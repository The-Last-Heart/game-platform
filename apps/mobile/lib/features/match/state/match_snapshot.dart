import '../protocol/realtime_messages.dart';

/// Session lifecycle states for the match controller.
enum SessionLifecycle { disconnected, connecting, resuming, bound, terminal }

/// Authoritative per-challenge answer submission UI state.
enum AnswerSubmissionStatus { idle, pending, confirmed, rejected }

/// Immutable view state derived from server snapshots and events.
///
/// This is the single source of truth consumed by UI widgets.
class MatchViewState {
  const MatchViewState({
    this.matchId,
    this.playerId,
    this.phase = MatchPhase.lobby,
    this.players = const <PlayerPublic>[],
    this.currentChallenge,
    this.lastRoundResult,
    this.winnerId,
    this.roundNumber = 0,
    this.serverSequence = -1,
    this.phaseDeadlineAtMs,
    this.lobbyFillDeadlineAtMs,
    this.nextPhaseAtMs,
    this.serverNowMs = 0,
    this.connectionError,
    this.canRetry = false,
    this.isConnected = false,
    this.lifecycle = SessionLifecycle.disconnected,
    this.needsSnapshot = false,
    this.answerStatus = AnswerSubmissionStatus.idle,
    this.answerChallengeInstanceId,
    this.answerSubmittedEarly = false,
    this.inMatch = false,
    this.mode,
    this.hostPlayerId,
    this.roomCode,
    this.matchmakingAcceptedSeats = 0,
    this.tactical,
  });

  final String? matchId;
  final String? playerId;
  final MatchPhase phase;
  final List<PlayerPublic> players;
  final PublicChallenge? currentChallenge;
  final LastRoundResult? lastRoundResult;
  final String? winnerId;
  final int roundNumber;
  final int serverSequence;
  final int? phaseDeadlineAtMs;
  final int? lobbyFillDeadlineAtMs;
  final int? nextPhaseAtMs;
  final int serverNowMs;
  final String? connectionError;
  final bool canRetry;
  final bool isConnected;
  final SessionLifecycle lifecycle;
  final bool needsSnapshot;
  final AnswerSubmissionStatus answerStatus;
  final String? answerChallengeInstanceId;

  /// True when the in-flight/confirmed submit was an early miss (no signal token).
  final bool answerSubmittedEarly;

  /// Whether UI should show the active-match shell (authoritative navigation).
  final bool inMatch;

  final MatchMode? mode;
  final String? hostPlayerId;
  final String? roomCode;
  final int matchmakingAcceptedSeats;

  /// Between-round tactical window (LH-008). Null when absent from snapshot.
  final MatchTacticalState? tactical;

  /// Whether the session is gameplay-ready.
  bool get isBound => lifecycle == SessionLifecycle.bound;

  /// Whether gameplay input must be covered/disabled.
  ///
  /// Recovery (`needsSnapshot`) is a hard gameplay lock: the client does not
  /// have trustworthy authoritative state until a convergent snapshot arrives.
  bool get blocksGameplayInput =>
      lifecycle != SessionLifecycle.bound ||
      !isConnected ||
      needsSnapshot ||
      answerStatus == AnswerSubmissionStatus.pending ||
      answerStatus == AnswerSubmissionStatus.confirmed;

  /// The local player's public state, if present.
  PlayerPublic? get localPlayer {
    if (playerId == null) return null;
    for (final PlayerPublic p in players) {
      if (p.playerId == playerId) return p;
    }
    return null;
  }

  /// Whether the local player is a spectator.
  bool get isSpectator => localPlayer?.status == PlayerStatus.spectator;

  MatchViewState copyWith({
    String? Function()? matchId,
    String? Function()? playerId,
    MatchPhase? phase,
    List<PlayerPublic>? players,
    PublicChallenge? Function()? currentChallenge,
    LastRoundResult? Function()? lastRoundResult,
    String? Function()? winnerId,
    int? roundNumber,
    int? serverSequence,
    int? Function()? phaseDeadlineAtMs,
    int? Function()? lobbyFillDeadlineAtMs,
    int? Function()? nextPhaseAtMs,
    int? serverNowMs,
    String? Function()? connectionError,
    bool? canRetry,
    bool? isConnected,
    SessionLifecycle? lifecycle,
    bool? needsSnapshot,
    AnswerSubmissionStatus? answerStatus,
    String? Function()? answerChallengeInstanceId,
    bool? answerSubmittedEarly,
    bool? inMatch,
    MatchMode? Function()? mode,
    String? Function()? hostPlayerId,
    String? Function()? roomCode,
    int? matchmakingAcceptedSeats,
    MatchTacticalState? Function()? tactical,
  }) {
    return MatchViewState(
      // Explicit nullable setters: omit = unchanged; () => null = clear.
      matchId: matchId != null ? matchId() : this.matchId,
      playerId: playerId != null ? playerId() : this.playerId,
      phase: phase ?? this.phase,
      players: players ?? this.players,
      currentChallenge: currentChallenge != null
          ? currentChallenge()
          : this.currentChallenge,
      lastRoundResult: lastRoundResult != null
          ? lastRoundResult()
          : this.lastRoundResult,
      winnerId: winnerId != null ? winnerId() : this.winnerId,
      roundNumber: roundNumber ?? this.roundNumber,
      serverSequence: serverSequence ?? this.serverSequence,
      phaseDeadlineAtMs: phaseDeadlineAtMs != null
          ? phaseDeadlineAtMs()
          : this.phaseDeadlineAtMs,
      lobbyFillDeadlineAtMs: lobbyFillDeadlineAtMs != null
          ? lobbyFillDeadlineAtMs()
          : this.lobbyFillDeadlineAtMs,
      nextPhaseAtMs: nextPhaseAtMs != null
          ? nextPhaseAtMs()
          : this.nextPhaseAtMs,
      serverNowMs: serverNowMs ?? this.serverNowMs,
      connectionError: connectionError != null
          ? connectionError()
          : this.connectionError,
      canRetry: canRetry ?? this.canRetry,
      isConnected: isConnected ?? this.isConnected,
      lifecycle: lifecycle ?? this.lifecycle,
      needsSnapshot: needsSnapshot ?? this.needsSnapshot,
      answerStatus: answerStatus ?? this.answerStatus,
      answerChallengeInstanceId: answerChallengeInstanceId != null
          ? answerChallengeInstanceId()
          : this.answerChallengeInstanceId,
      answerSubmittedEarly:
          answerSubmittedEarly ?? this.answerSubmittedEarly,
      inMatch: inMatch ?? this.inMatch,
      mode: mode != null ? mode() : this.mode,
      hostPlayerId: hostPlayerId != null ? hostPlayerId() : this.hostPlayerId,
      roomCode: roomCode != null ? roomCode() : this.roomCode,
      matchmakingAcceptedSeats:
          matchmakingAcceptedSeats ?? this.matchmakingAcceptedSeats,
      tactical: tactical != null ? tactical() : this.tactical,
    );
  }
}
