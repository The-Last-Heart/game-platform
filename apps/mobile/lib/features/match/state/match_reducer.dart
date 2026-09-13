import '../protocol/realtime_messages.dart';
import 'match_snapshot.dart';

/// How the reducer treated an incoming envelope.
enum ReducerDisposition {
  /// Event mutated authoritative view state (or was a no-op ACK applied for the session).
  applied,

  /// Event was safely ignored (stale, cross-match, duplicate).
  ignored,

  /// Event could not be applied; controller should request recovery.
  recoveryRequired,
}

/// Result of reducer processing an envelope.
class ReducerResult {
  const ReducerResult({
    required this.state,
    required this.disposition,
    this.requestSnapshot = false,
  });

  final MatchViewState state;
  final ReducerDisposition disposition;

  /// True if the reducer detected a sequence gap / mismatch and wants recovery.
  final bool requestSnapshot;

  bool get wasApplied => disposition == ReducerDisposition.applied;
}

/// Pure reducer: given current state and a server envelope, produces new state.
///
/// Sequence rules (LH-003A / LH-003B):
///
/// **match.snapshot:**
/// - Validate envelope.serverSequence == payload.sequence if both present;
///   on mismatch → recoveryRequired without applying.
/// - Ignore only if payload.sequence < state.serverSequence (strictly lower).
/// - Equal sequence MUST apply as full authoritative replacement.
///
/// **Sequenced events (non-snapshot):**
/// - Ignore if seq <= state.serverSequence.
/// - If seq > state.serverSequence + 1 → recoveryRequired; do NOT apply.
/// - Else (seq == state.serverSequence + 1) → apply and advance.
///
/// **Unsequenced (ACK / protocol.error / session.accepted):**
/// - Apply without sequence update (disposition applied).
/// - `session.accepted` is a no-op for identity: matchId/playerId are owned
///   by [MatchSessionController] after correlation + durable save.
///
/// **Cross-match:**
/// - If state.matchId is bound and envelope.matchId differs → ignored.
class MatchReducer {
  /// Process a raw server event envelope.
  ReducerResult reduce(MatchViewState state, Map<String, dynamic> raw) {
    final RealtimeEnvelope envelope = RealtimeEnvelope.fromJson(raw);

    // Cross-match guard: if we are bound to a match and the envelope
    // specifies a different matchId, ignore entirely.
    if (state.matchId != null &&
        envelope.matchId != null &&
        envelope.matchId != state.matchId) {
      return ReducerResult(
        state: state,
        disposition: ReducerDisposition.ignored,
      );
    }

    // Bound session must not accept envelopes that omit matchId for match-scoped types.
    if (state.matchId != null &&
        envelope.matchId == null &&
        _isMatchScopedType(envelope.type)) {
      return ReducerResult(
        state: state,
        disposition: ReducerDisposition.ignored,
      );
    }

    final int? seq = envelope.serverSequence;
    final bool isSnapshot = envelope.type == MessageTypes.matchSnapshot;

    if (isSnapshot) {
      return _reduceSnapshot(state, envelope);
    }

    if (seq != null) {
      return _reduceSequencedEvent(state, envelope, seq);
    }

    // Unsequenced events (ACK, protocol.error, session.accepted).
    return ReducerResult(
      state: _applyEvent(state, envelope),
      disposition: ReducerDisposition.applied,
    );
  }

  bool _isMatchScopedType(String type) {
    return type == MessageTypes.matchSnapshot ||
        type == MessageTypes.challengeStarted ||
        type == MessageTypes.challengeSignal ||
        type == MessageTypes.challengeSignalEnded ||
        type == MessageTypes.challengeResolved ||
        type == MessageTypes.matchFinished ||
        type == MessageTypes.playerPresence ||
        type == MessageTypes.matchStateChanged ||
        type == MessageTypes.challengeSubmissionAck ||
        type == MessageTypes.powerGranted ||
        type == MessageTypes.powerInventoryFull ||
        type == MessageTypes.powerOffered ||
        type == MessageTypes.powerUsed ||
        type == MessageTypes.powerDefenseRequired ||
        type == MessageTypes.powerResolved;
  }

  ReducerResult _reduceSnapshot(
    MatchViewState state,
    RealtimeEnvelope envelope,
  ) {
    final MatchSnapshotPayload snap = MatchSnapshotPayload.fromJson(
      envelope.payload!,
    );

    // Envelope matchId must agree with payload matchId when both present.
    if (envelope.matchId != null && envelope.matchId != snap.matchId) {
      return ReducerResult(
        state: state,
        disposition: ReducerDisposition.recoveryRequired,
        requestSnapshot: true,
      );
    }

    // Validate envelope.serverSequence == payload.sequence if both present.
    if (envelope.serverSequence != null &&
        envelope.serverSequence != snap.sequence) {
      return ReducerResult(
        state: state,
        disposition: ReducerDisposition.recoveryRequired,
        requestSnapshot: true,
      );
    }

    final int payloadSeq = snap.sequence;

    // Ignore only if payload.sequence < state.serverSequence (strictly lower).
    if (payloadSeq < state.serverSequence) {
      return ReducerResult(
        state: state,
        disposition: ReducerDisposition.ignored,
      );
    }

    // Equal or higher → apply as full authoritative replacement.
    return ReducerResult(
      state: _applySnapshot(state, snap),
      disposition: ReducerDisposition.applied,
    );
  }

  ReducerResult _reduceSequencedEvent(
    MatchViewState state,
    RealtimeEnvelope envelope,
    int seq,
  ) {
    // Ignore if seq <= state.serverSequence.
    if (seq <= state.serverSequence) {
      return ReducerResult(
        state: state,
        disposition: ReducerDisposition.ignored,
      );
    }

    // Gap: seq > state.serverSequence + 1 → request snapshot, do NOT apply.
    if (state.serverSequence >= 0 && seq > state.serverSequence + 1) {
      return ReducerResult(
        state: state,
        disposition: ReducerDisposition.recoveryRequired,
        requestSnapshot: true,
      );
    }

    // Consecutive: apply and advance.
    return ReducerResult(
      state: _applyEvent(state, envelope),
      disposition: ReducerDisposition.applied,
    );
  }

  MatchViewState _applySnapshot(
    MatchViewState state,
    MatchSnapshotPayload snap,
  ) {
    // Prefer snapshot challenge only for challenge phases; clear otherwise so
    // power / result chrome is not blocked by a stale PublicChallenge.
    final bool keepChallenge =
        snap.phase == MatchPhase.challengeIntro ||
        snap.phase == MatchPhase.challengeActive;
    return state.copyWith(
      matchId: () => snap.matchId,
      phase: snap.phase,
      players: snap.players,
      currentChallenge: () => keepChallenge ? snap.currentChallenge : null,
      lastRoundResult: () => snap.lastRoundResult,
      winnerId: () => snap.winnerId,
      roundNumber: snap.roundNumber,
      serverSequence: snap.sequence,
      phaseDeadlineAtMs: () => snap.phaseDeadlineAtMs,
      lobbyFillDeadlineAtMs: () => snap.lobbyFillDeadlineAtMs,
      nextPhaseAtMs: () => snap.nextPhaseAtMs,
      serverNowMs: snap.serverNowMs,
      mode: () => snap.mode,
      hostPlayerId: () => snap.hostPlayerId,
      roomCode: () => snap.roomCode,
      tactical: () => snap.tactical,
    );
  }

  MatchViewState _applyEvent(MatchViewState state, RealtimeEnvelope envelope) {
    switch (envelope.type) {
      case MessageTypes.sessionAccepted:
        // Identity (matchId / playerId) is intentionally not applied here.
        // MatchSessionController validates commandId correlation and sets
        // credentials only after durable sessionStore.save succeeds.
        return state;

      case MessageTypes.matchSnapshot:
        final MatchSnapshotPayload snap = MatchSnapshotPayload.fromJson(
          envelope.payload!,
        );
        return _applySnapshot(state, snap);

      case MessageTypes.challengeStarted:
        final PublicChallenge challenge = PublicChallenge.fromJson(
          envelope.payload!,
        );
        return state.copyWith(
          phase: MatchPhase.challengeActive,
          currentChallenge: () => challenge,
          serverSequence: envelope.serverSequence ?? state.serverSequence,
          serverNowMs: challenge.serverNowMs,
        );

      case MessageTypes.challengeSignal:
        final ChallengeSignalPayload signal = ChallengeSignalPayload.fromJson(
          envelope.payload!,
        );
        final PublicChallenge? current = state.currentChallenge;
        if (current != null &&
            current.challengeInstanceId == signal.challengeInstanceId) {
          return state.copyWith(
            currentChallenge: () => PublicChallenge(
              challengeInstanceId: current.challengeInstanceId,
              definitionId: current.definitionId,
              definitionVersion: current.definitionVersion,
              engineId: current.engineId,
              promptKey: current.promptKey,
              choiceKeys: current.choiceKeys,
              clientConfig: current.clientConfig,
              serverNowMs: signal.serverNowMs,
              startsAtMs: current.startsAtMs,
              deadlineAtMs: current.deadlineAtMs,
              durationMs: current.durationMs,
              roundPhase: RoundPhase.signalActive,
              signalToken: signal.signalToken,
              signaledAtMs: signal.signaledAtMs,
              signalEndsAtMs: signal.signalEndsAtMs,
            ),
            serverSequence: envelope.serverSequence ?? state.serverSequence,
            serverNowMs: signal.serverNowMs,
          );
        }
        return state.copyWith(
          serverSequence: envelope.serverSequence ?? state.serverSequence,
        );

      case MessageTypes.challengeSignalEnded:
        final ChallengeSignalEndedPayload ended =
            ChallengeSignalEndedPayload.fromJson(envelope.payload!);
        final PublicChallenge? currentEnded = state.currentChallenge;
        if (currentEnded != null &&
            currentEnded.challengeInstanceId == ended.challengeInstanceId) {
          return state.copyWith(
            currentChallenge: () => PublicChallenge(
              challengeInstanceId: currentEnded.challengeInstanceId,
              definitionId: currentEnded.definitionId,
              definitionVersion: currentEnded.definitionVersion,
              engineId: currentEnded.engineId,
              promptKey: currentEnded.promptKey,
              choiceKeys: currentEnded.choiceKeys,
              clientConfig: currentEnded.clientConfig,
              serverNowMs: ended.serverNowMs,
              startsAtMs: currentEnded.startsAtMs,
              deadlineAtMs: currentEnded.deadlineAtMs,
              durationMs: currentEnded.durationMs,
              roundPhase: RoundPhase.signalExpired,
              signalToken: null,
              signaledAtMs: currentEnded.signaledAtMs,
              signalEndsAtMs: ended.signalEndsAtMs,
            ),
            serverSequence: envelope.serverSequence ?? state.serverSequence,
            serverNowMs: ended.serverNowMs,
          );
        }
        return state.copyWith(
          serverSequence: envelope.serverSequence ?? state.serverSequence,
        );

      case MessageTypes.challengeResolved:
        final ChallengeResolvedPayload resolved =
            ChallengeResolvedPayload.fromJson(envelope.payload!);
        return state.copyWith(
          phase: MatchPhase.roundResult,
          lastRoundResult: () => LastRoundResult(
            challengeInstanceId: resolved.challengeInstanceId,
            resolutions: resolved.resolutions,
          ),
          currentChallenge: () => null,
          serverSequence: envelope.serverSequence ?? state.serverSequence,
        );

      case MessageTypes.matchFinished:
        final MatchFinishedPayload finished = MatchFinishedPayload.fromJson(
          envelope.payload!,
        );
        return state.copyWith(
          phase: MatchPhase.completed,
          winnerId: () => finished.winnerId,
          serverSequence: envelope.serverSequence ?? state.serverSequence,
        );

      case MessageTypes.matchDrawn:
        return state.copyWith(
          phase: MatchPhase.draw,
          winnerId: () => null,
          currentChallenge: () => null,
          serverSequence: envelope.serverSequence ?? state.serverSequence,
        );

      case MessageTypes.playerPresence:
        final PlayerPresencePayload presence = PlayerPresencePayload.fromJson(
          envelope.payload!,
        );
        final List<PlayerPublic> updatedPlayers = state.players.map((
          PlayerPublic p,
        ) {
          if (p.playerId == presence.playerId) {
            return p.copyWith(presence: presence.presence);
          }
          return p;
        }).toList();
        if (presence.joined &&
            !updatedPlayers.any(
              (PlayerPublic p) => p.playerId == presence.playerId,
            )) {
          // Presence is not an authoritative roster snapshot. Do not invent
          // hearts/energy/status — wait for match snapshot / state sync.
          return state.copyWith(
            serverSequence: envelope.serverSequence ?? state.serverSequence,
          );
        }
        return state.copyWith(
          players: updatedPlayers,
          serverSequence: envelope.serverSequence ?? state.serverSequence,
        );

      case MessageTypes.matchStateChanged:
        return state.copyWith(
          serverSequence: envelope.serverSequence ?? state.serverSequence,
        );

      case MessageTypes.challengeSubmissionAck:
        return state;

      case MessageTypes.powerGranted:
        return _applyPowerGranted(state, envelope);

      case MessageTypes.powerInventoryFull:
        return _applyPowerInventoryFull(state, envelope);

      case MessageTypes.powerOffered:
        return _applyPowerOffered(state, envelope);

      case MessageTypes.powerUsed:
        return _applyPowerUsed(state, envelope);

      case MessageTypes.powerDefenseRequired:
        return _applyPowerDefenseRequired(state, envelope);

      case MessageTypes.powerResolved:
        return _applyPowerResolved(state, envelope);

      case MessageTypes.protocolError:
        final ProtocolErrorPayload error = ProtocolErrorPayload.fromJson(
          envelope.payload!,
        );
        return state.copyWith(connectionError: () => error.messageKey);

      default:
        return state;
    }
  }

  MatchViewState _applyPowerGranted(
    MatchViewState state,
    RealtimeEnvelope envelope,
  ) {
    final PowerGrantedPayload granted = PowerGrantedPayload.fromJson(
      envelope.payload!,
    );
    final List<PlayerPublic> players = state.players.map((PlayerPublic p) {
      if (p.playerId != granted.playerId) return p;
      final PlayerPowerInventory prior =
          p.inventory ?? const PlayerPowerInventory();
      final PlayerPowerInventory next = switch (granted.powerId) {
        PowerIds.dangerPulse => prior.copyWith(dangerPulse: 1),
        PowerIds.shield => prior.copyWith(shield: 1),
        PowerIds.reflection => prior.copyWith(reflection: 1),
        _ => prior,
      };
      return p.copyWith(energy: granted.energyAfter, inventory: () => next);
    }).toList();
    final MatchTacticalState tactical =
        (state.tactical ?? const MatchTacticalState()).copyWith(
          lastGrant: () => PowerGrantInfo(
            playerId: granted.playerId,
            powerId: granted.powerId,
            outcome: 'granted',
          ),
        );
    return state.copyWith(
      players: players,
      tactical: () => tactical,
      currentChallenge: () => null,
      serverSequence: envelope.serverSequence ?? state.serverSequence,
    );
  }

  MatchViewState _applyPowerInventoryFull(
    MatchViewState state,
    RealtimeEnvelope envelope,
  ) {
    final PowerInventoryFullPayload full = PowerInventoryFullPayload.fromJson(
      envelope.payload!,
    );
    final List<PlayerPublic> players = state.players.map((PlayerPublic p) {
      if (p.playerId != full.playerId) return p;
      return p.copyWith(energy: full.energyAfter);
    }).toList();
    final MatchTacticalState tactical =
        (state.tactical ?? const MatchTacticalState()).copyWith(
          lastGrant: () => PowerGrantInfo(
            playerId: full.playerId,
            powerId: null,
            outcome: 'inventory_full',
          ),
        );
    return state.copyWith(
      players: players,
      tactical: () => tactical,
      currentChallenge: () => null,
      serverSequence: envelope.serverSequence ?? state.serverSequence,
    );
  }

  MatchViewState _applyPowerOffered(
    MatchViewState state,
    RealtimeEnvelope envelope,
  ) {
    final PowerOfferedPayload offered = PowerOfferedPayload.fromJson(
      envelope.payload!,
    );
    final MatchTacticalState tactical =
        (state.tactical ?? const MatchTacticalState()).copyWith(
          pendingAttack: () => null,
          actorsWithOffensiveCharge: offered.actorsWithOffensiveCharge,
        );
    return state.copyWith(
      phase: MatchPhase.powerAction,
      phaseDeadlineAtMs: () => offered.actionDeadlineAtMs,
      nextPhaseAtMs: () => offered.actionDeadlineAtMs,
      tactical: () => tactical,
      currentChallenge: () => null,
      serverSequence: envelope.serverSequence ?? state.serverSequence,
    );
  }

  MatchViewState _applyPowerUsed(
    MatchViewState state,
    RealtimeEnvelope envelope,
  ) {
    final PowerUsedPayload used = PowerUsedPayload.fromJson(envelope.payload!);
    final List<PlayerPublic> players = state.players.map((PlayerPublic p) {
      if (p.playerId != used.attackerId) return p;
      final PlayerPowerInventory prior =
          p.inventory ?? const PlayerPowerInventory();
      return p.copyWith(
        inventory: () => prior.copyWith(dangerPulse: 0),
        lastDangerPulseTargetId: () => used.targetId,
      );
    }).toList();
    return state.copyWith(
      players: players,
      currentChallenge: () => null,
      serverSequence: envelope.serverSequence ?? state.serverSequence,
    );
  }

  MatchViewState _applyPowerDefenseRequired(
    MatchViewState state,
    RealtimeEnvelope envelope,
  ) {
    final PowerDefenseRequiredPayload required =
        PowerDefenseRequiredPayload.fromJson(envelope.payload!);
    final PendingPowerAttack pending = PendingPowerAttack(
      attackId: required.attackId,
      attackerId: required.attackerId,
      targetId: required.targetId,
      powerId: PowerIds.dangerPulse,
      reflected: required.reflected,
      defenseDeadlineAtMs: required.defenseDeadlineAtMs,
    );
    final MatchTacticalState tactical =
        (state.tactical ?? const MatchTacticalState()).copyWith(
          pendingAttack: () => pending,
          eligibleTargetIds: const <String>[],
          actorsWithOffensiveCharge: const <String>[],
        );
    return state.copyWith(
      phase: MatchPhase.powerDefense,
      phaseDeadlineAtMs: () => required.defenseDeadlineAtMs,
      nextPhaseAtMs: () => required.defenseDeadlineAtMs,
      tactical: () => tactical,
      currentChallenge: () => null,
      serverSequence: envelope.serverSequence ?? state.serverSequence,
    );
  }

  MatchViewState _applyPowerResolved(
    MatchViewState state,
    RealtimeEnvelope envelope,
  ) {
    final PowerResolvedPayload resolved = PowerResolvedPayload.fromJson(
      envelope.payload!,
    );
    final List<PlayerPublic> players = state.players.map((PlayerPublic p) {
      if (p.playerId != resolved.targetId) return p;
      return p.copyWith(
        hearts: resolved.heartsAfterTarget,
        status: resolved.statusAfterTarget,
      );
    }).toList();
    final MatchTacticalState tactical =
        (state.tactical ?? const MatchTacticalState()).copyWith(
          pendingAttack: () => null,
          eligibleTargetIds: const <String>[],
          actorsWithOffensiveCharge: const <String>[],
        );
    return state.copyWith(
      players: players,
      tactical: () => tactical,
      currentChallenge: () => null,
      serverSequence: envelope.serverSequence ?? state.serverSequence,
    );
  }
}
