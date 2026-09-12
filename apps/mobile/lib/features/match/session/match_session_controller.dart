import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../protocol/envelope_validation.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_reducer.dart';
import '../state/match_snapshot.dart';
import '../time/server_time_clock.dart';
import '../transport/realtime_transport.dart';
import '../../identity/data/identity_store.dart';
import 'session_store.dart';

/// Generates a cryptographically-secure 32-hex-char identifier (128 bits).
String generateSecureId() {
  final Random random = Random.secure();
  final StringBuffer buffer = StringBuffer();
  for (int i = 0; i < 16; i++) {
    buffer.write(random.nextInt(256).toRadixString(16).padLeft(2, '0'));
  }
  return buffer.toString();
}

/// Tracks a pending answer submission awaiting ACK or snapshot confirmation.
class PendingSubmission {
  const PendingSubmission({
    required this.commandId,
    required this.challengeInstanceId,
    required this.answer,
  });

  final String commandId;
  final String challengeInstanceId;
  final Map<String, dynamic> answer;
}

enum _HandshakeKind { createDev, join, resume }

class _PendingHandshake {
  _PendingHandshake({
    required this.kind,
    required this.commandId,
    this.expectedMatchId,
    this.expectedPlayerId,
    this.allowUncorrelatedAccept = false,
  });

  final _HandshakeKind kind;
  final String commandId;
  String? expectedMatchId;
  String? expectedPlayerId;
  bool accepted = false;
  bool tokenPersisted = false;

  /// Async matchmaking assign may emit session.accepted without commandId.
  bool allowUncorrelatedAccept;
}

/// Contract `protocol.error.code` values that definitively reject resume
/// credentials. Aligned with packages/contracts — no client-only invent codes.
const Set<String> _resumeCredentialRejectCodes = <String>{
  'UNAUTHORIZED',
  'MATCH_NOT_FOUND',
};

/// Contract codes that indicate snapshot request auth/binding failure.
const Set<String> _snapshotAuthBindingCodes = <String>{
  'UNAUTHORIZED',
  'MATCH_NOT_FOUND',
};

/// Orchestrates the match session lifecycle.
///
/// Lifecycle: disconnected → connecting / resuming → bound → terminal.
///
/// Incoming transport events and connection-state changes are processed through
/// a single ordered async queue so side effects (especially durable session
/// saves) complete before the next envelope is applied.
class MatchSessionController {
  MatchSessionController({
    required this.transport,
    required this.sessionStore,
    ServerTimeClock? serverTimeClock,
    this._snapshotRetryDelay = const Duration(seconds: 2),
    this._snapshotRetryDelayForAttempt,
    this._snapshotRetryDelayCap = const Duration(seconds: 30),
  }) : serverClock = serverTimeClock ?? ServerTimeClock();

  final RealtimeTransport transport;
  final SessionStore sessionStore;
  final ServerTimeClock serverClock;
  final Duration _snapshotRetryDelay;
  final Duration Function(int attempt)? _snapshotRetryDelayForAttempt;
  final Duration _snapshotRetryDelayCap;
  final MatchReducer _reducer = MatchReducer();

  final ValueNotifier<MatchViewState> state = ValueNotifier<MatchViewState>(
    const MatchViewState(),
  );

  StreamSubscription<Map<String, dynamic>>? _eventSub;
  StreamSubscription<bool>? _connectionSub;
  bool _initialized = false;
  bool _devMatchStarting = false;
  Completer<String?>? _matchmakingWaiter;
  bool _cleaningUp = false;
  bool _disposed = false;

  /// Bumped after an intentional disconnect so stale queued
  /// `_handleConnectionChange(false)` jobs cannot clear a fresh join handshake.
  int _connectionEpoch = 0;

  /// Ordered async work queue. Exceptions are caught so one bad job cannot
  /// permanently stall subsequent events.
  Future<void> _queue = Future<void>.value();

  PendingSubmission? _pending;
  _PendingHandshake? _handshake;

  /// Waiting in a rematch lobby from the end screen (not matchmaking search).
  bool _rematchLobbyActive = false;

  String? _snapshotRequestCommandId;
  Timer? _snapshotRetryTimer;
  int _snapshotRetryAttempt = 0;

  /// Highest authoritative sequence observed but not yet reconciled.
  int? _recoveryWatermark;

  /// At most one pending-answer resend per disconnect/resume/recovery episode.
  bool _pendingRetriedThisEpisode = false;

  /// Completes when all currently queued event/connection jobs finish.
  ///
  /// Tests should prefer this over artificial [Duration.zero] delays. One
  /// microtask yield allows async stream deliveries to enqueue first.
  Future<void> get idle async {
    await Future<void>.delayed(Duration.zero);
    await _queue;
  }

  /// Visible for tests: current recovery watermark, if any.
  int? get recoveryWatermarkForTest => _recoveryWatermark;

  /// Visible for tests: in-flight snapshot request command id.
  String? get snapshotRequestCommandIdForTest => _snapshotRequestCommandId;

  /// True while seated in a rematch lobby opened from match.rematch.
  bool get isRematchLobby =>
      _rematchLobbyActive &&
      state.value.inMatch &&
      state.value.phase == MatchPhase.lobby;

  void _enqueue(Future<void> Function() job) {
    _queue = _queue.catchError((Object _) {}).then((_) async {
      try {
        await job();
      } catch (e, st) {
        debugPrint('MatchSessionController queue error: $e\n$st');
        if (!_disposed && !_cleaningUp) {
          try {
            state.value = state.value.copyWith(
              connectionError: () => e.toString(),
              canRetry: true,
            );
          } catch (_) {}
        }
      }
    });
  }

  /// Initialize: listen to transport events. Guarded against re-entry.
  void init() {
    if (_initialized) return;
    _initialized = true;
    _eventSub = transport.events.listen((Map<String, dynamic> e) {
      // Stamp epoch at enqueue time so stale frames from a prior socket
      // (queued while _prepareFreshJoinSocket tears down) cannot wipe a new
      // join/training handshake or mutate identity after reconnect.
      final int epoch = _connectionEpoch;
      _enqueue(() async {
        if (epoch != _connectionEpoch) return;
        await _processEvent(e);
      });
    });
    _connectionSub = transport.connectionState.listen((bool connected) {
      final int epoch = _connectionEpoch;
      _enqueue(() async => _handleConnectionChange(connected, epoch));
    });
  }

  /// Cold-start bootstrap: discard any prior match seat so the player lands on
  /// entry/home — never auto-resume into a previous match after process exit.
  Future<void> bootstrap() async {
    await sessionStore.clear();
  }

  /// Start a dev match: create_dev → join → fill_dev_bots.
  Future<void> startDevMatch() async {
    if (_devMatchStarting) return;
    if (state.value.lifecycle == SessionLifecycle.bound ||
        state.value.lifecycle == SessionLifecycle.terminal) {
      await clearSessionAndDisconnect();
    }
    _devMatchStarting = true;

    try {
      state.value = state.value.copyWith(
        lifecycle: SessionLifecycle.connecting,
        isConnected: false,
        inMatch: false,
        connectionError: () => null,
      );
      await transport.connect();
      state.value = state.value.copyWith(isConnected: true);
      final String commandId = generateSecureId();
      _handshake = _PendingHandshake(
        kind: _HandshakeKind.createDev,
        commandId: commandId,
      );
      _sendCommandWithId(
        commandId,
        MessageTypes.matchCreateDev,
        <String, dynamic>{},
      );
    } on Exception catch (e) {
      _handshake = null;
      _devMatchStarting = false;
      state.value = state.value.copyWith(
        connectionError: () => e.toString(),
        canRetry: true,
        isConnected: false,
        lifecycle: SessionLifecycle.disconnected,
        inMatch: false,
      );
    }
  }

  Future<void> _ensureConnected() async {
    if (state.value.isConnected) return;
    state.value = state.value.copyWith(
      lifecycle: SessionLifecycle.connecting,
      connectionError: () => null,
    );
    await transport.connect();
    state.value = state.value.copyWith(isConnected: true);
  }

  /// Enqueue Quick Survival. Returns ticketId when status arrives, else null.
  Future<String?> enqueueMatchmaking(PlayerIdentity identity) async {
    await _prepareFreshJoinSocket();
    await _ensureConnected();
    final String commandId = generateSecureId();
    final Completer<String?> completer = Completer<String?>();
    _matchmakingWaiter = completer;
    // Join handshake so session.accepted after queue assign can bind.
    // allowUncorrelatedAccept covers delayed bot-fill (no commandId on accept).
    _handshake = _PendingHandshake(
      kind: _HandshakeKind.join,
      commandId: commandId,
      allowUncorrelatedAccept: true,
    );
    state.value = state.value.copyWith(
      matchmakingAcceptedSeats: 1,
      connectionError: () => null,
    );
    _sendCommandWithId(
      commandId,
      MessageTypes.matchmakingEnqueue,
      identity.toCommandPayload(),
    );
    return completer.future.timeout(
      const Duration(seconds: 8),
      onTimeout: () {
        _matchmakingWaiter = null;
        return null;
      },
    );
  }

  Future<void> cancelMatchmaking(String? ticketId) async {
    if (!state.value.isConnected) return;
    final _PendingHandshake? handshake = _handshake;
    if (handshake != null && handshake.allowUncorrelatedAccept) {
      _handshake = null;
    }
    _sendCommand(MessageTypes.matchmakingCancel, <String, dynamic>{
      if (ticketId != null) 'ticketId': ticketId,
    });
  }

  /// Clear local session and drop the live socket so the server is unbound.
  ///
  /// Required before training / queue / private join: a prior resume or failed
  /// bind can leave `matchId`/`playerId` on the server socket, and
  /// `training.start` then returns `errors.protocol.unauthorized`.
  Future<void> _prepareFreshJoinSocket() async {
    _handshake = null;
    _matchmakingWaiter = null;
    await sessionStore.clear();
    // Drop stale event/connection jobs from the prior socket before teardown,
    // then bump again after disconnect so teardown's own disconnect callback
    // cannot clear the next join/training handshake (service unavailable).
    _connectionEpoch++;
    if (transport.isConnected || state.value.isConnected) {
      await transport.disconnect();
    }
    _connectionEpoch++;
    state.value = state.value.copyWith(
      lifecycle: SessionLifecycle.disconnected,
      matchId: () => null,
      playerId: () => null,
      inMatch: false,
      isConnected: false,
      connectionError: () => null,
      matchmakingAcceptedSeats: 0,
    );
  }

  Future<void> createPrivateRoom(PlayerIdentity identity) async {
    await _prepareFreshJoinSocket();
    await _ensureConnected();
    final String commandId = generateSecureId();
    _handshake = _PendingHandshake(
      kind: _HandshakeKind.join,
      commandId: commandId,
    );
    _sendCommandWithId(
      commandId,
      MessageTypes.privateRoomCreate,
      identity.toCommandPayload(),
    );
  }

  Future<void> joinPrivateRoom(PlayerIdentity identity, String roomCode) async {
    await _prepareFreshJoinSocket();
    await _ensureConnected();
    final String commandId = generateSecureId();
    _handshake = _PendingHandshake(
      kind: _HandshakeKind.join,
      commandId: commandId,
    );
    _sendCommandWithId(commandId, MessageTypes.privateRoomJoin, <String, dynamic>{
      ...identity.toCommandPayload(),
      'roomCode': roomCode,
    });
  }

  Future<void> startTraining(PlayerIdentity identity) async {
    await _prepareFreshJoinSocket();
    await _ensureConnected();
    final String commandId = generateSecureId();
    _handshake = _PendingHandshake(
      kind: _HandshakeKind.join,
      commandId: commandId,
    );
    _sendCommandWithId(
      commandId,
      MessageTypes.trainingStart,
      identity.toCommandPayload(),
    );
  }

  Future<void> retryTraining() async {
    final String? matchId = state.value.matchId;
    if (matchId == null) return;

    // Leave failure/winner chrome immediately so a slow/failed handshake is
    // visible as progress (or a surfaced error), not a dead "لم تنجح" screen.
    final MatchPhase phase = state.value.phase;
    if (phase == MatchPhase.roundResult ||
        phase == MatchPhase.completed ||
        phase == MatchPhase.halted) {
      state.value = state.value.copyWith(
        phase: MatchPhase.lobby,
        lastRoundResult: () => null,
        winnerId: () => null,
        currentChallenge: () => null,
        answerStatus: AnswerSubmissionStatus.idle,
        answerChallengeInstanceId: () => null,
        answerSubmittedEarly: false,
        connectionError: () => null,
      );
    }

    final String commandId = generateSecureId();
    _handshake = _PendingHandshake(
      kind: _HandshakeKind.join,
      commandId: commandId,
    );
    _sendCommandWithId(commandId, MessageTypes.trainingRetry, <String, dynamic>{
      'matchId': matchId,
    });
  }

  Future<void> setReady() async {
    final String? matchId = state.value.matchId;
    if (matchId == null) return;
    _sendCommand(MessageTypes.matchReady, <String, dynamic>{
      'matchId': matchId,
    });
  }

  Future<void> leaveMatch() async {
    final String? matchId = state.value.matchId;
    if (matchId != null && state.value.isConnected) {
      _sendCommand(MessageTypes.matchLeave, <String, dynamic>{
        'matchId': matchId,
      });
      // Give the leave frame a moment to flush before tearing down the socket.
      // Server also frees lobby seats on disconnect as a safety net.
      await Future<void>.delayed(const Duration(milliseconds: 80));
    }
    await clearSessionAndDisconnect();
  }

  void extendLobbyFill() {
    final String? matchId = state.value.matchId;
    if (matchId == null) return;
    _sendCommand(MessageTypes.matchExtendLobbyFill, <String, dynamic>{
      'matchId': matchId,
    });
  }

  void startLobbyNow() {
    final String? matchId = state.value.matchId;
    if (matchId == null) return;
    _sendCommand(MessageTypes.matchStartLobby, <String, dynamic>{
      'matchId': matchId,
    });
  }

  Future<void> requestRematch() async {
    final String? matchId = state.value.matchId;
    if (matchId == null) return;
    final String commandId = generateSecureId();
    _rematchLobbyActive = true;
    _handshake = _PendingHandshake(
      kind: _HandshakeKind.join,
      commandId: commandId,
    );
    // Leave terminal chrome immediately so the lobby can paint after accept.
    if (state.value.lifecycle == SessionLifecycle.terminal) {
      state.value = state.value.copyWith(
        lifecycle: SessionLifecycle.connecting,
        winnerId: () => null,
        phase: MatchPhase.lobby,
      );
    }
    _sendCommandWithId(commandId, MessageTypes.matchRematch, <String, dynamic>{
      'matchId': matchId,
    });
  }

  /// Submit an answer for the current challenge.
  void submitAnswer(String challengeInstanceId, Map<String, dynamic> answer) {
    if (state.value.lifecycle != SessionLifecycle.bound) return;
    if (!state.value.isConnected) return;
    // Independent of UI: recovery means authoritative state is untrusted.
    if (state.value.needsSnapshot) return;
    if (_pending != null) return;
    if (state.value.answerStatus == AnswerSubmissionStatus.confirmed) return;

    final String commandId = generateSecureId();
    final bool earlyMiss = !_answerLooksLikeSignalSubmit(answer);
    _pending = PendingSubmission(
      commandId: commandId,
      challengeInstanceId: challengeInstanceId,
      answer: Map<String, dynamic>.from(answer),
    );
    state.value = state.value.copyWith(
      answerStatus: AnswerSubmissionStatus.pending,
      answerChallengeInstanceId: () => challengeInstanceId,
      answerSubmittedEarly: earlyMiss,
    );

    _sendCommandWithId(
      commandId,
      MessageTypes.matchSubmitAnswer,
      <String, dynamic>{
        'challengeInstanceId': challengeInstanceId,
        'answer': answer,
      },
    );
  }

  /// Whether recovery is still unresolved (watermark and/or needsSnapshot).
  bool get _recoveryUnresolved =>
      state.value.needsSnapshot || _recoveryWatermark != null;

  /// Terminal lifecycle is allowed only after recovery has converged (or never
  /// started). A below-watermark terminal-looking display must not finalize.
  bool get _mayEnterTerminal => !_recoveryUnresolved;

  bool _shouldContinueRecovery() {
    if (_disposed || _cleaningUp) return false;
    if (!state.value.needsSnapshot) return false;
    if (state.value.lifecycle != SessionLifecycle.bound) return false;
    if (!state.value.isConnected) return false;
    // Do not stop retries merely because a non-convergent display snapshot
    // looks completed/halted — only convergent state may become terminal.
    return state.value.matchId != null;
  }

  Duration _delayForAttempt(int attempt) {
    final Duration Function(int attempt)? custom =
        _snapshotRetryDelayForAttempt;
    if (custom != null) {
      return custom(attempt);
    }
    final int shift = attempt.clamp(0, 4);
    final int ms = _snapshotRetryDelay.inMilliseconds * (1 << shift);
    final int capped = ms > _snapshotRetryDelayCap.inMilliseconds
        ? _snapshotRetryDelayCap.inMilliseconds
        : ms;
    return Duration(milliseconds: capped);
  }

  void _raiseRecoveryWatermark(int observedSequence) {
    if (_recoveryWatermark == null || observedSequence > _recoveryWatermark!) {
      _recoveryWatermark = observedSequence;
    }
  }

  void _clearRecoveryState({bool clearWatermark = true}) {
    _snapshotRetryTimer?.cancel();
    _snapshotRetryTimer = null;
    _snapshotRequestCommandId = null;
    _snapshotRetryAttempt = 0;
    if (clearWatermark) {
      _recoveryWatermark = null;
    }
  }

  /// Cancel in-flight snapshot request and timer without clearing watermark.
  void _finishSnapshotRequestInFlight() {
    _snapshotRetryTimer?.cancel();
    _snapshotRetryTimer = null;
    _snapshotRequestCommandId = null;
  }

  /// Request a full snapshot (gap recovery). At most one in flight.
  void requestSnapshot() {
    if (!_shouldContinueRecovery()) return;
    if (_snapshotRequestCommandId != null) return;
    final String? matchId = state.value.matchId;
    if (matchId == null) return;

    final String commandId = generateSecureId();
    _snapshotRequestCommandId = commandId;
    _sendCommandWithId(
      commandId,
      MessageTypes.matchRequestSnapshot,
      <String, dynamic>{
        'matchId': matchId,
        'afterSequence': state.value.serverSequence,
      },
    );

    _armInFlightTimeout(commandId);
  }

  void _armInFlightTimeout(String commandId) {
    _snapshotRetryTimer?.cancel();
    final Duration delay = _delayForAttempt(_snapshotRetryAttempt);
    _snapshotRetryTimer = Timer(delay, () {
      _enqueue(() async {
        if (_snapshotRequestCommandId != commandId) return;
        _snapshotRequestCommandId = null;
        _snapshotRetryTimer = null;
        if (!_shouldContinueRecovery()) return;
        _snapshotRetryAttempt++;
        requestSnapshot();
      });
    });
  }

  /// Schedule a recovery request after finishing the previous one (no tight loop).
  void _scheduleRecoveryRetry() {
    if (!_shouldContinueRecovery()) return;
    if (_snapshotRequestCommandId != null) return;
    if (_snapshotRetryTimer != null) return;

    final Duration delay = _delayForAttempt(_snapshotRetryAttempt);
    _snapshotRetryTimer = Timer(delay, () {
      _enqueue(() async {
        _snapshotRetryTimer = null;
        if (!_shouldContinueRecovery()) return;
        if (_snapshotRequestCommandId != null) return;
        requestSnapshot();
      });
    });
  }

  /// Attempt to resume a stored session.
  ///
  /// After [connect], resume send is enqueued. The connection-change path only
  /// sends when handshake is still null (reconnect), avoiding duplicate sends
  /// from both paths for the same connect.
  Future<void> tryResume() async {
    final SessionData? data = await sessionStore.load();
    if (data == null) return;

    try {
      state.value = state.value.copyWith(
        lifecycle: SessionLifecycle.resuming,
        isConnected: false,
        inMatch: false,
        matchId: () => data.matchId,
        playerId: () => data.playerId,
        connectionError: () => null,
      );
      await transport.connect();
      state.value = state.value.copyWith(isConnected: true);
      // Prefer explicit enqueue after connect; connection callback only sends
      // when handshake is still null (e.g. later reconnects).
      _enqueue(() => _ensureResumeSent());
    } on Exception catch (e) {
      _handshake = null;
      state.value = state.value.copyWith(
        connectionError: () => e.toString(),
        canRetry: true,
        isConnected: false,
        lifecycle: SessionLifecycle.disconnected,
        inMatch: false,
      );
    }
  }

  Future<void> _ensureResumeSent() async {
    if (state.value.lifecycle != SessionLifecycle.resuming) return;
    if (!transport.isConnected) return;
    // Never clobber an in-flight join / matchmaking / createDev handshake.
    if (_handshake != null && _handshake!.kind != _HandshakeKind.resume) {
      return;
    }
    if (_handshake != null &&
        _handshake!.kind == _HandshakeKind.resume &&
        !_handshake!.accepted) {
      // Already have an in-flight logical resume for this connection.
      return;
    }

    final SessionData? data = await sessionStore.load();
    if (data == null) {
      state.value = state.value.copyWith(
        lifecycle: SessionLifecycle.disconnected,
        canRetry: true,
        inMatch: false,
      );
      return;
    }
    if (state.value.lifecycle != SessionLifecycle.resuming) return;
    if (!transport.isConnected) return;
    if (_handshake != null && _handshake!.kind != _HandshakeKind.resume) {
      return;
    }
    if (_handshake != null &&
        _handshake!.kind == _HandshakeKind.resume &&
        !_handshake!.accepted) {
      return;
    }

    final String commandId = data.pendingResumeCommandId ?? generateSecureId();
    if (data.pendingResumeCommandId != commandId) {
      await sessionStore.save(
        data.copyWith(pendingResumeCommandId: () => commandId),
      );
    }

    _handshake = _PendingHandshake(
      kind: _HandshakeKind.resume,
      commandId: commandId,
      expectedMatchId: data.matchId,
      expectedPlayerId: data.playerId,
    );
    _sendCommandWithId(commandId, MessageTypes.matchResume, <String, dynamic>{
      'matchId': data.matchId,
      'resumeToken': data.resumeToken,
    });
  }

  bool get _hasDurablePlayerCredentials {
    final _PendingHandshake? handshake = _handshake;
    if (handshake != null &&
        handshake.tokenPersisted &&
        (handshake.kind == _HandshakeKind.join ||
            handshake.kind == _HandshakeKind.resume)) {
      return true;
    }
    final SessionLifecycle lifecycle = state.value.lifecycle;
    if (lifecycle == SessionLifecycle.bound ||
        lifecycle == SessionLifecycle.terminal) {
      return true;
    }
    // Cold/reconnect resume already owns store-backed identity.
    if (lifecycle == SessionLifecycle.resuming &&
        state.value.playerId != null) {
      return true;
    }
    return false;
  }

  Future<void> _processEvent(Map<String, dynamic> raw) async {
    if (_cleaningUp || _disposed) return;

    final EnvelopeValidation validation = validateServerEnvelope(raw);
    if (!validation.isValid) {
      debugPrint(
        'MatchSessionController ignoring invalid envelope: ${validation.reason}',
      );
      return;
    }

    final String? type = raw['type'] as String?;

    // session.accepted: validate before any reducer touch; identity is owned
    // by the controller after durable save only.
    if (type == MessageTypes.sessionAccepted) {
      await _handleSessionAccepted(raw);
      return;
    }

    // Queue updates arrive before seat credentials exist.
    if (type == MessageTypes.matchmakingStatus) {
      _handleMatchmakingStatus(raw);
      return;
    }

    // Before correlated player credentials are durable, snapshots and other
    // sequenced match events must not mutate authoritative view state (including
    // sequence). Safe non-identity display updates are intentionally unsupported.
    if (!_hasDurablePlayerCredentials &&
        type != MessageTypes.protocolError &&
        type != MessageTypes.challengeSubmissionAck) {
      return;
    }

    final ReducerResult result = _reducer.reduce(state.value, raw);

    // Preserve controller-owned fields. Identity is never taken from the reducer.
    final MatchViewState prior = state.value;
    final bool wasRecovering =
        prior.needsSnapshot || _recoveryWatermark != null;
    bool nextNeedsSnapshot = prior.needsSnapshot;
    bool snapshotClearedRecovery = false;
    bool snapshotBelowWatermark = false;

    if (result.requestSnapshot) {
      // New recovery episode: allow one pending resend after convergence.
      if (!prior.needsSnapshot) {
        _pendingRetriedThisEpisode = false;
      }
      final int? observed = _observedRecoverySequence(raw);
      if (observed != null) {
        _raiseRecoveryWatermark(observed);
      }
      nextNeedsSnapshot = true;
    } else if (type == MessageTypes.matchSnapshot &&
        result.disposition == ReducerDisposition.applied) {
      final int? snapSeq = _payloadSequence(raw);
      if (snapSeq != null &&
          _recoveryWatermark != null &&
          snapSeq < _recoveryWatermark!) {
        // Equal/old recovery response may apply as replacement but must not
        // declare convergence while below the watermark.
        nextNeedsSnapshot = true;
        snapshotBelowWatermark = true;
      } else if (result.disposition == ReducerDisposition.applied) {
        nextNeedsSnapshot = false;
        snapshotClearedRecovery = true;
      }
    }

    final bool recoveryJustConverged = wasRecovering && snapshotClearedRecovery;

    state.value = result.state.copyWith(
      lifecycle: prior.lifecycle,
      isConnected: prior.isConnected,
      canRetry: prior.canRetry,
      connectionError: () {
        if (result.disposition == ReducerDisposition.applied &&
            type == MessageTypes.protocolError) {
          return result.state.connectionError;
        }
        return prior.connectionError;
      },
      answerStatus: prior.answerStatus,
      answerChallengeInstanceId: () => prior.answerChallengeInstanceId,
      inMatch: prior.inMatch,
      // Force-preserve prior identity even when prior is null (overwrite reducer).
      matchId: () => prior.matchId,
      playerId: () => prior.playerId,
      needsSnapshot: nextNeedsSnapshot,
    );

    if (result.disposition == ReducerDisposition.ignored) {
      return;
    }

    if (result.disposition == ReducerDisposition.recoveryRequired) {
      if (result.requestSnapshot) {
        requestSnapshot();
      }
      return;
    }

    // Applied only from here.
    _maybeAnchorFromAppliedEvent(raw, result.state);
    _syncActiveDeadline(result.state);
    _resetAnswerStateIfChallengeChanged(prior, state.value);

    if (type == MessageTypes.matchSnapshot) {
      if (snapshotClearedRecovery) {
        _clearRecoveryState(clearWatermark: true);
      } else if (snapshotBelowWatermark) {
        // Only a correlated response may retire the in-flight request.
        final Object? snapCmdRaw = raw['commandId'];
        final String? snapCmdId = snapCmdRaw is String ? snapCmdRaw : null;
        if (snapCmdId != null &&
            snapCmdId.isNotEmpty &&
            snapCmdId == _snapshotRequestCommandId) {
          _finishSnapshotRequestInFlight();
          _snapshotRetryAttempt++;
          _scheduleRecoveryRetry();
        }
      }
      await _handleAppliedSnapshot(
        raw,
        recoveryJustConverged: recoveryJustConverged,
      );
    } else if (type == MessageTypes.challengeSubmissionAck) {
      _handleSubmissionAck(raw);
    } else if (type == MessageTypes.protocolError) {
      await _handleProtocolError(raw);
    } else if (type == MessageTypes.matchFinished ||
        state.value.phase == MatchPhase.completed ||
        state.value.phase == MatchPhase.halted) {
      _maybeEnterTerminal(state.value);
    }

    if (result.requestSnapshot) {
      requestSnapshot();
    }
  }

  int? _payloadSequence(Map<String, dynamic> raw) {
    final Object? payload = raw['payload'];
    if (payload is Map && payload['sequence'] is int) {
      return payload['sequence'] as int;
    }
    return null;
  }

  /// Trusted recovery sequence observations only.
  ///
  /// Sequenced-event gaps may raise the watermark. A snapshot whose envelope
  /// and payload sequences disagree must not poison the watermark from either
  /// contradictory value.
  int? _observedRecoverySequence(Map<String, dynamic> raw) {
    final Object? envSeqRaw = raw['serverSequence'];
    final int? envSeq = envSeqRaw is int ? envSeqRaw : null;
    if (raw['type'] == MessageTypes.matchSnapshot) {
      final int? payloadSeq = _payloadSequence(raw);
      if (envSeq != null && payloadSeq != null && envSeq != payloadSeq) {
        return null;
      }
      // Agreed (or singly-present) snapshot sequence may raise watermark for
      // other recovery triggers such as matchId disagreement.
      return envSeq ?? payloadSeq;
    }
    return envSeq;
  }

  void _maybeAnchorFromAppliedEvent(
    Map<String, dynamic> raw,
    MatchViewState applied,
  ) {
    final String? type = raw['type'] as String?;
    final Map<String, dynamic>? payload =
        raw['payload'] as Map<String, dynamic>?;

    int? freshServerNow;
    if (type == MessageTypes.matchSnapshot) {
      final Object? value = payload?['serverNowMs'];
      if (value is int) freshServerNow = value;
    } else if (type == MessageTypes.challengeStarted ||
        type == MessageTypes.challengeSignal ||
        type == MessageTypes.challengeSignalEnded) {
      final Object? value = payload?['serverNowMs'];
      if (value is int) freshServerNow = value;
    }

    if (freshServerNow != null && freshServerNow > 0) {
      serverClock.anchor(freshServerNow);
    }

    // Keep applied.serverNowMs aligned for UI without re-anchoring from stale retained values.
    if (freshServerNow != null) {
      state.value = state.value.copyWith(serverNowMs: freshServerNow);
    } else {
      // Do not let retained applied.serverNowMs from non-timing events mutate the clock.
      state.value = state.value.copyWith(
        serverNowMs: priorServerNowOrEstimate(applied),
      );
    }
  }

  int priorServerNowOrEstimate(MatchViewState applied) {
    final int estimated = serverClock.estimateServerNowMs();
    if (estimated > 0) return estimated;
    return applied.serverNowMs;
  }

  void _syncActiveDeadline(MatchViewState view) {
    final int? deadline =
        view.currentChallenge?.deadlineAtMs ??
        view.phaseDeadlineAtMs ??
        view.nextPhaseAtMs;
    serverClock.setActiveDeadline(deadline);
  }

  void _resetAnswerStateIfChallengeChanged(
    MatchViewState prior,
    MatchViewState next,
  ) {
    final String? priorId = prior.currentChallenge?.challengeInstanceId;
    final String? nextId = next.currentChallenge?.challengeInstanceId;
    if (priorId != nextId) {
      if (_pending != null &&
          nextId != null &&
          _pending!.challengeInstanceId != nextId) {
        _pending = null;
      }
      if (_pending == null) {
        state.value = state.value.copyWith(
          answerStatus: AnswerSubmissionStatus.idle,
          answerChallengeInstanceId: () => null,
          answerSubmittedEarly: false,
        );
      }
    }
  }

  /// Wait-for-signal success submits carry a non-empty signalToken; early miss does not.
  static bool _answerLooksLikeSignalSubmit(Map<String, dynamic> answer) {
    final Object? token = answer['signalToken'];
    return token is String && token.trim().isNotEmpty;
  }

  /// Validate and apply session.accepted. Identity mutates only after durable save.
  void _handleMatchmakingStatus(Map<String, dynamic> raw) {
    final Object? payloadRaw = raw['payload'];
    if (payloadRaw is! Map) {
      return;
    }
    final MatchmakingStatusPayload status = MatchmakingStatusPayload.fromJson(
      Map<String, dynamic>.from(payloadRaw),
    );
    final Completer<String?>? waiter = _matchmakingWaiter;
    if (waiter != null && !waiter.isCompleted) {
      waiter.complete(status.ticketId);
      _matchmakingWaiter = null;
    }

    if (status.state == 'queued' || status.state == 'assigned') {
      final _PendingHandshake? handshake = _handshake;
      if (handshake != null &&
          handshake.allowUncorrelatedAccept &&
          status.matchId != null) {
        handshake.expectedMatchId = status.matchId;
      }
      state.value = state.value.copyWith(
        matchmakingAcceptedSeats: status.acceptedSeats,
        connectionError: () => null,
      );
      return;
    }

    // Terminal queue states — clear matchmaking handshake and surface recovery.
    if (_handshake != null && _handshake!.allowUncorrelatedAccept) {
      _handshake = null;
    }
    final String? errorKey = switch (status.state) {
      'timed_out' => 'errors.queue_timeout',
      'failed' => 'errors.queue_failed',
      'cancelled' => null,
      _ => 'errors.queue_failed',
    };
    state.value = state.value.copyWith(
      matchmakingAcceptedSeats: 0,
      connectionError: () => errorKey,
    );
  }

  Future<void> _handleSessionAccepted(Map<String, dynamic> raw) async {
    final Map<String, dynamic>? payload =
        raw['payload'] as Map<String, dynamic>?;
    if (payload == null) return;

    final SessionAcceptedPayload? accepted = SessionAcceptedPayload.tryParse(
      payload,
    );
    if (accepted == null) return;

    final String? envelopeCommandId = raw['commandId'] as String?;
    final String matchId = accepted.matchId;
    final String? playerId = accepted.playerId;
    final String? resumeToken = accepted.resumeToken;
    final String? role = accepted.role;

    // Envelope / payload matchId agreement (also enforced by validateServerEnvelope).
    final String? envelopeMatchId = raw['matchId'] as String?;
    if (envelopeMatchId != null && envelopeMatchId != matchId) return;

    final _PendingHandshake? handshake = _handshake;
    if (handshake == null) {
      return;
    }
    final bool correlated =
        envelopeCommandId != null && envelopeCommandId == handshake.commandId;
    final bool asyncMatchmakingAccept =
        handshake.allowUncorrelatedAccept &&
        handshake.kind == _HandshakeKind.join &&
        envelopeCommandId == null;
    // Prefer correlated accepts; allow null commandId only for queued matchmaking.
    if (!correlated && !asyncMatchmakingAccept) {
      return;
    }

    if (handshake.kind == _HandshakeKind.createDev) {
      if (!accepted.isCreator || role != 'creator') return;
      handshake.expectedMatchId = matchId;
      handshake.accepted = true;
      // Creator-only accept must NOT bind, persist, or set player identity.
      final String joinCommandId = generateSecureId();
      _handshake = _PendingHandshake(
        kind: _HandshakeKind.join,
        commandId: joinCommandId,
        expectedMatchId: matchId,
      );
      _sendCommandWithId(
        joinCommandId,
        MessageTypes.matchJoin,
        <String, dynamic>{'matchId': matchId},
      );
      return;
    }

    if (handshake.kind == _HandshakeKind.join ||
        handshake.kind == _HandshakeKind.resume) {
      if (!accepted.isPlayer || playerId == null || resumeToken == null) {
        return;
      }
      if (handshake.expectedMatchId != null &&
          handshake.expectedMatchId != matchId) {
        return;
      }
      if (handshake.expectedPlayerId != null &&
          handshake.expectedPlayerId != playerId) {
        return;
      }

      handshake.expectedMatchId = matchId;
      handshake.expectedPlayerId = playerId;
      handshake.accepted = true;

      try {
        await sessionStore.save(
          SessionData(
            matchId: matchId,
            playerId: playerId,
            resumeToken: resumeToken,
            // Clear pending resume command only after rotated token is durable.
            pendingResumeCommandId: null,
          ),
        );
      } catch (e) {
        handshake.accepted = false;
        state.value = state.value.copyWith(
          connectionError: () => e.toString(),
          canRetry: true,
        );
        return;
      }

      handshake.tokenPersisted = true;

      // Rematch / training.retry seats a *new* matchId while the prior match
      // may already be at a high serverSequence. Reset sequence and leave the
      // prior phase (round_result / completed) so low-seq snapshots apply and
      // the failure/winner chrome does not stick.
      final String? previousMatchId = state.value.matchId;
      final bool switchedMatch =
          previousMatchId != null && previousMatchId != matchId;
      state.value = state.value.copyWith(
        matchId: () => matchId,
        playerId: () => playerId,
        serverSequence: switchedMatch ? -1 : null,
        phase: switchedMatch ? MatchPhase.lobby : null,
        lifecycle: switchedMatch ? SessionLifecycle.connecting : null,
        winnerId: switchedMatch ? () => null : null,
        lastRoundResult: switchedMatch ? () => null : null,
        currentChallenge: switchedMatch ? () => null : null,
        answerStatus: switchedMatch ? AnswerSubmissionStatus.idle : null,
        answerChallengeInstanceId: switchedMatch ? () => null : null,
        players: switchedMatch ? const <PlayerPublic>[] : null,
        hostPlayerId: switchedMatch ? () => null : null,
        connectionError: () => null,
      );
      if (switchedMatch) {
        _clearRecoveryState(clearWatermark: true);
      }

      if (handshake.kind == _HandshakeKind.join && _devMatchStarting) {
        _sendCommand(MessageTypes.matchFillDevBots, <String, dynamic>{
          'matchId': matchId,
        });
        _devMatchStarting = false;
      }
      // Bound only after correlated snapshot with local player.
    }
  }

  Future<void> _handleAppliedSnapshot(
    Map<String, dynamic> raw, {
    bool recoveryJustConverged = false,
  }) async {
    final MatchViewState view = state.value;
    final _PendingHandshake? handshake = _handshake;

    final bool terminalPhase =
        view.phase == MatchPhase.completed || view.phase == MatchPhase.halted;

    // Terminal authoritative states after bind or terminal resume — only when
    // recovery has converged (below-watermark terminal-looking snaps must not
    // finalize).
    if (terminalPhase && _mayEnterTerminal) {
      final bool canEnterTerminal =
          view.lifecycle == SessionLifecycle.bound ||
          (handshake != null &&
              handshake.accepted &&
              handshake.tokenPersisted &&
              (handshake.kind == _HandshakeKind.join ||
                  handshake.kind == _HandshakeKind.resume) &&
              view.localPlayer != null);
      if (canEnterTerminal) {
        _enterTerminal();
        _updateAnswerFromSnapshot();
        // Convergent terminal snap still reconciles pending (confirm / reject /
        // obsolete) but never resends while terminal.
        if (recoveryJustConverged) {
          _reconcilePendingAfterRecovery();
        }
        return;
      }
    }

    if (handshake != null &&
        handshake.accepted &&
        handshake.tokenPersisted &&
        (handshake.kind == _HandshakeKind.join ||
            handshake.kind == _HandshakeKind.resume)) {
      final String? expectedMatch = handshake.expectedMatchId;
      final String? expectedPlayer = handshake.expectedPlayerId;
      if (expectedMatch != null && view.matchId != expectedMatch) {
        return;
      }
      if (expectedPlayer != null && view.playerId != expectedPlayer) {
        return;
      }
      if (view.localPlayer == null) {
        return;
      }

      final SessionLifecycle previous = view.lifecycle;
      state.value = state.value.copyWith(
        lifecycle: SessionLifecycle.bound,
        inMatch: true,
        canRetry: false,
        connectionError: () => null,
      );
      _handshake = null;

      _updateAnswerFromSnapshot();
      // Resume bind and/or recovery convergence must reconcile unconfirmed
      // pending. Below-watermark resume keeps recovery unresolved → no resend.
      if (previous == SessionLifecycle.resuming || recoveryJustConverged) {
        _reconcilePendingAfterRecovery();
      }

      // If recovery was pending across resume, continue while bound.
      // Below-watermark resume may bind for auth but must not unlock gameplay.
      if (state.value.needsSnapshot) {
        requestSnapshot();
      }

      // Terminal phase only after convergent recovery.
      if (terminalPhase && _mayEnterTerminal) {
        _enterTerminal();
      }
      return;
    }

    // Already bound: update answer confirmation from snapshot.
    if (view.lifecycle == SessionLifecycle.bound) {
      if (view.phase != MatchPhase.lobby &&
          view.phase != MatchPhase.completed &&
          view.phase != MatchPhase.halted) {
        _rematchLobbyActive = false;
      }
      _updateAnswerFromSnapshot();
      if (recoveryJustConverged) {
        _reconcilePendingAfterRecovery();
      }
      if (terminalPhase && _mayEnterTerminal) {
        _enterTerminal();
      }
    }
  }

  void _updateAnswerFromSnapshot() {
    final PlayerPublic? local = state.value.localPlayer;
    final PublicChallenge? challenge = state.value.currentChallenge;

    if (challenge == null) {
      if (_pending == null) {
        state.value = state.value.copyWith(
          answerStatus: AnswerSubmissionStatus.idle,
          answerChallengeInstanceId: () => null,
          answerSubmittedEarly: false,
        );
      }
      return;
    }

    if (local != null && local.submittedForCurrentChallenge) {
      _pending = null;
      state.value = state.value.copyWith(
        answerStatus: AnswerSubmissionStatus.confirmed,
        answerChallengeInstanceId: () => challenge.challengeInstanceId,
      );
    }
  }

  void _handleSubmissionAck(Map<String, dynamic> raw) {
    final String? envelopeCommandId = raw['commandId'] as String?;
    if (_pending == null || envelopeCommandId != _pending!.commandId) {
      return;
    }

    final Map<String, dynamic>? payload =
        raw['payload'] as Map<String, dynamic>?;
    final bool accepted = payload?['accepted'] == true;

    if (accepted) {
      state.value = state.value.copyWith(
        answerStatus: AnswerSubmissionStatus.confirmed,
        answerChallengeInstanceId: () => _pending!.challengeInstanceId,
      );
      _pending = null;
      return;
    }

    // Rejected: restore input if challenge still active and deadline open.
    _pending = null;
    final PublicChallenge? challenge = state.value.currentChallenge;
    final bool canRetry =
        challenge != null &&
        _deadlineStillOpen(challenge) &&
        state.value.lifecycle == SessionLifecycle.bound;
    state.value = state.value.copyWith(
      answerStatus: canRetry
          ? AnswerSubmissionStatus.idle
          : AnswerSubmissionStatus.rejected,
      answerChallengeInstanceId: () => challenge?.challengeInstanceId,
    );
  }

  Future<void> _handleProtocolError(Map<String, dynamic> raw) async {
    final Map<String, dynamic>? payload =
        raw['payload'] as Map<String, dynamic>?;
    if (payload == null) return;

    final String? errorCommandId = payload['commandId'] as String?;
    final String? code = payload['code'] as String?;

    // Correlated snapshot-request error.
    if (errorCommandId != null &&
        errorCommandId.isNotEmpty &&
        _snapshotRequestCommandId != null &&
        errorCommandId == _snapshotRequestCommandId) {
      _finishSnapshotRequestInFlight();
      if (code != null && _snapshotAuthBindingCodes.contains(code)) {
        // Auth/binding failure on snapshot → safe resume/rebind; keep credentials.
        await _enterSafeResumeRebind();
      } else if (_shouldContinueRecovery()) {
        // Transient: automatically re-arm recovery with backoff.
        _snapshotRetryAttempt++;
        _scheduleRecoveryRetry();
      }
    }

    if (_pending != null &&
        errorCommandId != null &&
        errorCommandId == _pending!.commandId) {
      _pending = null;
      final PublicChallenge? challenge = state.value.currentChallenge;
      final bool canRetry =
          challenge != null &&
          _deadlineStillOpen(challenge) &&
          state.value.lifecycle == SessionLifecycle.bound;
      state.value = state.value.copyWith(
        answerStatus: canRetry
            ? AnswerSubmissionStatus.idle
            : AnswerSubmissionStatus.rejected,
        answerChallengeInstanceId: () => challenge?.challengeInstanceId,
      );
    }

    // Resume rejection clears credentials ONLY when correlated to the pending
    // resume handshake commandId with a definitive credential-reject code.
    final _PendingHandshake? handshake = _handshake;
    final bool resumeRejected =
        state.value.lifecycle == SessionLifecycle.resuming &&
        handshake != null &&
        handshake.kind == _HandshakeKind.resume &&
        !handshake.tokenPersisted &&
        errorCommandId != null &&
        errorCommandId.isNotEmpty &&
        errorCommandId == handshake.commandId &&
        code != null &&
        _resumeCredentialRejectCodes.contains(code);
    if (resumeRejected) {
      await _clearStaleSessionAfterRejectedResume();
      return;
    }

    // Correlated join / create failures (training, private, queue) must surface
    // on the entry home instead of timing out as "service unavailable".
    final String? messageKey = payload['messageKey'] as String?;
    if (handshake != null &&
        (handshake.kind == _HandshakeKind.join ||
            handshake.kind == _HandshakeKind.createDev) &&
        errorCommandId != null &&
        errorCommandId.isNotEmpty &&
        errorCommandId == handshake.commandId) {
      _handshake = null;
      if (_matchmakingWaiter != null && !_matchmakingWaiter!.isCompleted) {
        _matchmakingWaiter!.complete(null);
        _matchmakingWaiter = null;
      }
      _rematchLobbyActive = false;
      state.value = state.value.copyWith(
        connectionError: () =>
            (messageKey != null && messageKey.startsWith('errors.'))
            ? messageKey
            : 'errors.protocol',
        canRetry: true,
        matchmakingAcceptedSeats: 0,
      );
    }
  }

  Future<void> _enterSafeResumeRebind() async {
    final SessionData? stored = await sessionStore.load();
    if (stored == null) return;
    if (_disposed || _cleaningUp) return;
    if (state.value.lifecycle == SessionLifecycle.terminal) return;

    _handshake = null;
    _finishSnapshotRequestInFlight();
    state.value = state.value.copyWith(
      lifecycle: SessionLifecycle.resuming,
      canRetry: true,
      inMatch: false,
      matchId: () => stored.matchId,
      playerId: () => stored.playerId,
    );
    if (transport.isConnected) {
      await _ensureResumeSent();
    }
  }

  /// Inclusive deadline boundary: still open while estimatedNow <= deadlineAtMs.
  ///
  /// Matches the server rule that accepts submissions stamped exactly at the
  /// deadline. Only estimatedNow > deadlineAtMs is late.
  bool _deadlineStillOpen(PublicChallenge challenge) {
    final int estimatedNow = serverClock.estimateServerNowMs();
    if (estimatedNow <= 0) return true;
    return estimatedNow <= challenge.deadlineAtMs;
  }

  /// Reconcile unconfirmed pending after resume bind and/or recovery convergence.
  ///
  /// Never resends while recovery is unresolved. At most one resend per
  /// disconnect/resume/recovery episode (exact same commandId + payload).
  void _reconcilePendingAfterRecovery() {
    if (_pending == null) return;
    // Never resend while recovery unresolved (below-watermark bind included).
    if (_recoveryUnresolved) return;

    final PublicChallenge? challenge = state.value.currentChallenge;
    if (challenge == null ||
        challenge.challengeInstanceId != _pending!.challengeInstanceId) {
      _pending = null;
      state.value = state.value.copyWith(
        answerStatus: AnswerSubmissionStatus.idle,
        answerChallengeInstanceId: () => null,
        answerSubmittedEarly: false,
      );
      return;
    }

    if (!_deadlineStillOpen(challenge)) {
      _pending = null;
      state.value = state.value.copyWith(
        answerStatus: AnswerSubmissionStatus.rejected,
      );
      return;
    }

    final PlayerPublic? local = state.value.localPlayer;
    if (local != null && local.submittedForCurrentChallenge) {
      _pending = null;
      state.value = state.value.copyWith(
        answerStatus: AnswerSubmissionStatus.confirmed,
        answerChallengeInstanceId: () => challenge.challengeInstanceId,
      );
      return;
    }

    // Resend only while bound and gameplay is trusted; terminal must not send.
    if (state.value.lifecycle != SessionLifecycle.bound) return;
    if (_pendingRetriedThisEpisode) return;

    _pendingRetriedThisEpisode = true;
    state.value = state.value.copyWith(
      answerStatus: AnswerSubmissionStatus.pending,
      answerChallengeInstanceId: () => challenge.challengeInstanceId,
    );
    _sendCommandWithId(
      _pending!.commandId,
      MessageTypes.matchSubmitAnswer,
      <String, dynamic>{
        'challengeInstanceId': _pending!.challengeInstanceId,
        'answer': Map<String, dynamic>.from(_pending!.answer),
      },
    );
  }

  void _maybeEnterTerminal(MatchViewState view) {
    if (!_mayEnterTerminal) return;
    if (view.lifecycle != SessionLifecycle.bound &&
        view.lifecycle != SessionLifecycle.terminal) {
      return;
    }
    if (view.phase == MatchPhase.completed || view.phase == MatchPhase.halted) {
      _enterTerminal();
    }
  }

  void _enterTerminal() {
    // Safety: never finalize while a higher watermark / recovery is unresolved.
    if (!_mayEnterTerminal) return;
    _handshake = null;
    _devMatchStarting = false;
    _clearRecoveryState(clearWatermark: true);
    state.value = state.value.copyWith(
      lifecycle: SessionLifecycle.terminal,
      inMatch: true,
      needsSnapshot: false,
    );
  }

  Future<void> _clearStaleSessionAfterRejectedResume() async {
    _cleaningUp = true;
    try {
      await sessionStore.clear();
      _pending = null;
      _handshake = null;
      _devMatchStarting = false;
      _pendingRetriedThisEpisode = false;
      _clearRecoveryState(clearWatermark: true);
      state.value = const MatchViewState(
        lifecycle: SessionLifecycle.disconnected,
        canRetry: true,
        inMatch: false,
      );
    } finally {
      _cleaningUp = false;
    }
  }

  Future<void> _handleConnectionChange(bool connected, int epoch) async {
    if (_cleaningUp || _disposed) return;
    if (epoch != _connectionEpoch) return;
    if (!connected) {
      // Cancel recovery timers/in-flight; keep watermark + needsSnapshot for resume.
      _finishSnapshotRequestInFlight();
      final SessionLifecycle current = state.value.lifecycle;
      if (current == SessionLifecycle.terminal) {
        // Terminal disconnect must not attempt match.resume.
        if (epoch == _connectionEpoch) {
          state.value = state.value.copyWith(isConnected: false);
        }
        return;
      }

      final _PendingHandshake? handshake = _handshake;
      final bool durableHandshake =
          handshake != null &&
          handshake.accepted &&
          handshake.tokenPersisted &&
          (handshake.kind == _HandshakeKind.join ||
              handshake.kind == _HandshakeKind.resume);
      final SessionData? stored = await sessionStore.load();
      if (_disposed || _cleaningUp || epoch != _connectionEpoch) {
        return;
      }

      // Bound, or credentials durable but not yet bound → resume path.
      if (current == SessionLifecycle.bound ||
          durableHandshake ||
          (current == SessionLifecycle.resuming && stored != null)) {
        // New disconnect/resume episode: allow one pending resend after settle.
        _pendingRetriedThisEpisode = false;
        _handshake = null;
        final bool keepInMatch = current == SessionLifecycle.bound
            ? state.value.inMatch
            : false;
        state.value = state.value.copyWith(
          isConnected: false,
          lifecycle: SessionLifecycle.resuming,
          canRetry: true,
          inMatch: keepInMatch,
          matchId: () => stored?.matchId ?? state.value.matchId,
          playerId: () => stored?.playerId ?? state.value.playerId,
        );
        return;
      }

      // Pre-credential create/join disconnect: fully retryable clean identity.
      _handshake = null;
      _devMatchStarting = false;
      _clearRecoveryState(clearWatermark: true);
      state.value = const MatchViewState(
        lifecycle: SessionLifecycle.disconnected,
        canRetry: true,
        inMatch: false,
        isConnected: false,
      );
      return;
    }

    if (epoch != _connectionEpoch) return;

    state.value = state.value.copyWith(isConnected: true);

    // Connected: send resume only when handshake is null (reconnect / race
    // with tryResume enqueue). Whichever path runs first wins; the other no-ops.
    if (state.value.lifecycle == SessionLifecycle.resuming &&
        _handshake == null) {
      await _ensureResumeSent();
    }
  }

  void _sendCommand(String type, Map<String, dynamic> payload) {
    final String commandId = generateSecureId();
    _sendCommandWithId(commandId, type, payload);
  }

  void _sendCommandWithId(
    String commandId,
    String type,
    Map<String, dynamic> payload,
  ) {
    final String messageId = generateSecureId();
    transport.sendCommand(<String, dynamic>{
      'schemaVersion': realtimeSchemaVersion,
      'type': type,
      'messageId': messageId,
      'commandId': commandId,
      if (state.value.matchId != null) 'matchId': state.value.matchId,
      'payload': payload,
    });
  }

  /// Clear session, disconnect/dispose transport, and reset state.
  Future<void> clearSessionAndDisconnect() async {
    _cleaningUp = true;
    try {
      await transport.disconnect();
      await sessionStore.clear();
      _pending = null;
      _handshake = null;
      _rematchLobbyActive = false;
      _devMatchStarting = false;
      _pendingRetriedThisEpisode = false;
      _clearRecoveryState(clearWatermark: true);
      serverClock.setActiveDeadline(null);
      state.value = const MatchViewState();
    } finally {
      _cleaningUp = false;
    }
  }

  Future<void> clearSession() => clearSessionAndDisconnect();

  void dispose() {
    _disposed = true;
    _cleaningUp = true;
    _clearRecoveryState(clearWatermark: true);
    _eventSub?.cancel();
    _connectionSub?.cancel();
    transport.dispose();
    state.dispose();
  }
}
