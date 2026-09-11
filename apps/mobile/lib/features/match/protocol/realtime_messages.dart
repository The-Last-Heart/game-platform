// GENERATED-BY-HAND parity with packages/contracts realtime v1 — keep in sync;
// verified by tests in test/contract_parity_test.dart.

/// Schema version for the realtime protocol.
const String realtimeSchemaVersion = '1';

/// Message type constants matching packages/contracts MessageTypes.
abstract final class MessageTypes {
  // Client commands
  static const String matchCreateDev = 'match.create_dev';
  static const String matchJoin = 'match.join';
  static const String matchResume = 'match.resume';
  static const String matchSubmitAnswer = 'match.submit_answer';
  static const String matchRequestSnapshot = 'match.request_snapshot';
  static const String matchFillDevBots = 'match.fill_dev_bots';
  static const String matchmakingEnqueue = 'matchmaking.enqueue';
  static const String matchmakingCancel = 'matchmaking.cancel';
  static const String privateRoomCreate = 'private_room.create';
  static const String privateRoomJoin = 'private_room.join';
  static const String matchReady = 'match.ready';
  static const String matchLeave = 'match.leave';
  static const String trainingStart = 'training.start';
  static const String trainingRetry = 'training.retry';
  static const String matchRematch = 'match.rematch';
  // Server events
  static const String sessionAccepted = 'session.accepted';
  static const String matchSnapshot = 'match.snapshot';
  static const String playerPresence = 'match.player_presence';
  static const String challengeStarted = 'challenge.started';
  static const String challengeSignal = 'challenge.signal';
  static const String challengeSubmissionAck = 'challenge.submission_ack';
  static const String challengeResolved = 'challenge.resolved';
  static const String matchStateChanged = 'match.state_changed';
  static const String matchFinished = 'match.finished';
  static const String matchmakingStatus = 'matchmaking.status';
  static const String protocolError = 'protocol.error';
}

/// Base envelope shared by all realtime messages.
class RealtimeEnvelope {
  const RealtimeEnvelope({
    required this.schemaVersion,
    required this.type,
    required this.messageId,
    this.matchId,
    this.commandId,
    this.correlationId,
    this.serverSequence,
    this.serverTimestampMs,
    this.payload,
  });

  final String schemaVersion;
  final String type;
  final String messageId;
  final String? matchId;
  final String? commandId;
  final String? correlationId;
  final int? serverSequence;
  final int? serverTimestampMs;
  final Map<String, dynamic>? payload;

  factory RealtimeEnvelope.fromJson(Map<String, dynamic> json) {
    return RealtimeEnvelope(
      schemaVersion: json['schemaVersion'] as String,
      type: json['type'] as String,
      messageId: json['messageId'] as String,
      matchId: json['matchId'] as String?,
      commandId: json['commandId'] as String?,
      correlationId: json['correlationId'] as String?,
      serverSequence: json['serverSequence'] as int?,
      serverTimestampMs: json['serverTimestampMs'] as int?,
      payload: json['payload'] != null
          ? Map<String, dynamic>.from(json['payload'] as Map<dynamic, dynamic>)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'schemaVersion': schemaVersion,
      'type': type,
      'messageId': messageId,
      if (matchId != null) 'matchId': matchId,
      if (commandId != null) 'commandId': commandId,
      if (correlationId != null) 'correlationId': correlationId,
      if (serverSequence != null) 'serverSequence': serverSequence,
      if (serverTimestampMs != null) 'serverTimestampMs': serverTimestampMs,
      if (payload != null) 'payload': payload,
    };
  }
}

/// Match phase values matching protocol.ts matchPhaseSchema.
enum MatchPhase {
  lobby,
  readyCountdown,
  challengeIntro,
  challengeActive,
  roundResult,
  completed,
  halted;

  static MatchPhase fromString(String value) {
    return switch (value) {
      'lobby' => MatchPhase.lobby,
      'ready_countdown' => MatchPhase.readyCountdown,
      'challenge_intro' => MatchPhase.challengeIntro,
      'challenge_active' => MatchPhase.challengeActive,
      'round_result' => MatchPhase.roundResult,
      'completed' => MatchPhase.completed,
      'halted' => MatchPhase.halted,
      _ => throw ArgumentError('Unknown MatchPhase: $value'),
    };
  }

  String toWire() {
    return switch (this) {
      MatchPhase.lobby => 'lobby',
      MatchPhase.readyCountdown => 'ready_countdown',
      MatchPhase.challengeIntro => 'challenge_intro',
      MatchPhase.challengeActive => 'challenge_active',
      MatchPhase.roundResult => 'round_result',
      MatchPhase.completed => 'completed',
      MatchPhase.halted => 'halted',
    };
  }
}

/// Round phase values matching protocol.ts roundPhaseSchema.
enum RoundPhase {
  waitingSignal,
  signalActive,
  resolved;

  static RoundPhase fromString(String value) {
    return switch (value) {
      'waiting_signal' => RoundPhase.waitingSignal,
      'signal_active' => RoundPhase.signalActive,
      'resolved' => RoundPhase.resolved,
      _ => throw ArgumentError('Unknown RoundPhase: $value'),
    };
  }
}

/// Player status matching the protocol.
enum PlayerStatus {
  active,
  spectator;

  static PlayerStatus fromString(String value) {
    return switch (value) {
      'active' => PlayerStatus.active,
      'spectator' => PlayerStatus.spectator,
      _ => throw ArgumentError('Unknown PlayerStatus: $value'),
    };
  }
}

/// Player presence matching the protocol.
enum Presence {
  connected,
  disconnected;

  static Presence fromString(String value) {
    return switch (value) {
      'connected' => Presence.connected,
      'disconnected' => Presence.disconnected,
      _ => throw ArgumentError('Unknown Presence: $value'),
    };
  }
}

/// Match mode values matching protocol.ts matchModeSchema.
enum MatchMode {
  quickSurvival,
  privateRoom,
  training,
  dev;

  static MatchMode? tryParse(String? value) {
    return switch (value) {
      'quick_survival' => MatchMode.quickSurvival,
      'private' => MatchMode.privateRoom,
      'training' => MatchMode.training,
      'dev' => MatchMode.dev,
      null => null,
      _ => null,
    };
  }

  String toWire() {
    return switch (this) {
      MatchMode.quickSurvival => 'quick_survival',
      MatchMode.privateRoom => 'private',
      MatchMode.training => 'training',
      MatchMode.dev => 'dev',
    };
  }
}

/// Public player data from server snapshot.
class PlayerPublic {
  const PlayerPublic({
    required this.playerId,
    required this.hearts,
    required this.energy,
    required this.status,
    required this.presence,
    required this.submittedForCurrentChallenge,
    this.displayName,
    this.avatarColor,
    this.ready,
    this.isBot,
    this.isHost,
  });

  final String playerId;
  final int hearts;
  final int energy;
  final PlayerStatus status;
  final Presence presence;
  final bool submittedForCurrentChallenge;
  final String? displayName;
  final String? avatarColor;
  final bool? ready;
  final bool? isBot;
  final bool? isHost;

  factory PlayerPublic.fromJson(Map<String, dynamic> json) {
    return PlayerPublic(
      playerId: json['playerId'] as String,
      hearts: json['hearts'] as int,
      energy: json['energy'] as int,
      status: PlayerStatus.fromString(json['status'] as String),
      presence: Presence.fromString(json['presence'] as String),
      submittedForCurrentChallenge:
          json['submittedForCurrentChallenge'] as bool,
      displayName: json['displayName'] as String?,
      avatarColor: json['avatarColor'] as String?,
      ready: json['ready'] as bool?,
      isBot: json['isBot'] as bool?,
      isHost: json['isHost'] as bool?,
    );
  }
}

/// Public challenge fields sent by challenge.started and active snapshot.
class PublicChallenge {
  const PublicChallenge({
    required this.challengeInstanceId,
    required this.definitionId,
    required this.definitionVersion,
    required this.engineId,
    required this.promptKey,
    required this.clientConfig,
    required this.serverNowMs,
    required this.startsAtMs,
    required this.deadlineAtMs,
    required this.durationMs,
    required this.roundPhase,
    this.choiceKeys = const <String>[],
    this.signalToken,
    this.signaledAtMs,
  });

  final String challengeInstanceId;
  final String definitionId;
  final int definitionVersion;
  final String engineId;
  final String promptKey;
  final List<String> choiceKeys;
  final Map<String, dynamic> clientConfig;
  final int serverNowMs;
  final int startsAtMs;
  final int deadlineAtMs;
  final int durationMs;
  final RoundPhase roundPhase;
  final String? signalToken;
  final int? signaledAtMs;

  factory PublicChallenge.fromJson(Map<String, dynamic> json) {
    final dynamic rawChoiceKeys = json['choiceKeys'];
    final List<String> parsedChoiceKeys = rawChoiceKeys is List
        ? rawChoiceKeys.cast<String>()
        : const <String>[];
    return PublicChallenge(
      challengeInstanceId: json['challengeInstanceId'] as String,
      definitionId: json['definitionId'] as String,
      definitionVersion: json['definitionVersion'] as int,
      engineId: json['engineId'] as String,
      promptKey: json['promptKey'] as String,
      choiceKeys: parsedChoiceKeys,
      clientConfig: Map<String, dynamic>.from(
        json['clientConfig'] as Map<dynamic, dynamic>,
      ),
      serverNowMs: json['serverNowMs'] as int,
      startsAtMs: json['startsAtMs'] as int,
      deadlineAtMs: json['deadlineAtMs'] as int,
      durationMs: json['durationMs'] as int,
      roundPhase: RoundPhase.fromString(json['roundPhase'] as String),
      signalToken: json['signalToken'] as String?,
      signaledAtMs: json['signaledAtMs'] as int?,
    );
  }
}

/// Individual player resolution from challenge.resolved.
class PlayerChallengeResolution {
  const PlayerChallengeResolution({
    required this.playerId,
    required this.outcome,
    required this.heartsDelta,
    required this.energyDelta,
    required this.heartsAfter,
    required this.energyAfter,
    required this.statusAfter,
  });

  final String playerId;
  final String outcome;
  final int heartsDelta;
  final int energyDelta;
  final int heartsAfter;
  final int energyAfter;
  final PlayerStatus statusAfter;

  factory PlayerChallengeResolution.fromJson(Map<String, dynamic> json) {
    return PlayerChallengeResolution(
      playerId: json['playerId'] as String,
      outcome: json['outcome'] as String,
      heartsDelta: json['heartsDelta'] as int,
      energyDelta: json['energyDelta'] as int,
      heartsAfter: json['heartsAfter'] as int,
      energyAfter: json['energyAfter'] as int,
      statusAfter: PlayerStatus.fromString(json['statusAfter'] as String),
    );
  }
}

/// Last round result from match snapshot.
class LastRoundResult {
  const LastRoundResult({
    required this.challengeInstanceId,
    required this.resolutions,
  });

  final String challengeInstanceId;
  final List<PlayerChallengeResolution> resolutions;

  factory LastRoundResult.fromJson(Map<String, dynamic> json) {
    return LastRoundResult(
      challengeInstanceId: json['challengeInstanceId'] as String,
      resolutions: (json['resolutions'] as List<dynamic>)
          .map(
            (dynamic e) => PlayerChallengeResolution.fromJson(
              Map<String, dynamic>.from(e as Map<dynamic, dynamic>),
            ),
          )
          .toList(),
    );
  }
}

/// Full match snapshot payload.
class MatchSnapshotPayload {
  const MatchSnapshotPayload({
    required this.matchId,
    required this.status,
    required this.phase,
    required this.roundNumber,
    required this.serverNowMs,
    required this.revision,
    required this.sequence,
    required this.players,
    this.phaseDeadlineAtMs,
    this.lastRoundResult,
    this.nextPhaseAtMs,
    this.winnerId,
    this.currentChallenge,
    this.mode,
    this.hostPlayerId,
    this.roomCode,
  });

  final String matchId;
  final String status;
  final MatchPhase phase;
  final int? phaseDeadlineAtMs;
  final int roundNumber;
  final int serverNowMs;
  final LastRoundResult? lastRoundResult;
  final int? nextPhaseAtMs;
  final int revision;
  final int sequence;
  final List<PlayerPublic> players;
  final String? winnerId;
  final PublicChallenge? currentChallenge;
  final MatchMode? mode;
  final String? hostPlayerId;
  final String? roomCode;

  factory MatchSnapshotPayload.fromJson(Map<String, dynamic> json) {
    final dynamic lastRound = json['lastRoundResult'];
    final dynamic challenge = json['currentChallenge'];
    return MatchSnapshotPayload(
      matchId: json['matchId'] as String,
      status: json['status'] as String,
      phase: MatchPhase.fromString(json['phase'] as String),
      phaseDeadlineAtMs: json['phaseDeadlineAtMs'] as int?,
      roundNumber: json['roundNumber'] as int,
      serverNowMs: json['serverNowMs'] as int,
      lastRoundResult: lastRound != null
          ? LastRoundResult.fromJson(
              Map<String, dynamic>.from(lastRound as Map<dynamic, dynamic>),
            )
          : null,
      nextPhaseAtMs: json['nextPhaseAtMs'] as int?,
      revision: json['revision'] as int,
      sequence: json['sequence'] as int,
      players: (json['players'] as List<dynamic>)
          .map(
            (dynamic e) => PlayerPublic.fromJson(
              Map<String, dynamic>.from(e as Map<dynamic, dynamic>),
            ),
          )
          .toList(),
      winnerId: json['winnerId'] as String?,
      currentChallenge: challenge != null
          ? PublicChallenge.fromJson(
              Map<String, dynamic>.from(challenge as Map<dynamic, dynamic>),
            )
          : null,
      mode: MatchMode.tryParse(json['mode'] as String?),
      hostPlayerId: json['hostPlayerId'] as String?,
      roomCode: json['roomCode'] as String?,
    );
  }
}

/// Queue status payload from matchmaking.status.
class MatchmakingStatusPayload {
  const MatchmakingStatusPayload({
    required this.ticketId,
    required this.state,
    required this.acceptedSeats,
    required this.capacity,
    required this.serverNowMs,
    this.timeoutAtMs,
    this.matchId,
  });

  final String ticketId;
  final String state;
  final int acceptedSeats;
  final int capacity;
  final int? timeoutAtMs;
  final String? matchId;
  final int serverNowMs;

  factory MatchmakingStatusPayload.fromJson(Map<String, dynamic> json) {
    return MatchmakingStatusPayload(
      ticketId: json['ticketId'] as String,
      state: json['state'] as String,
      acceptedSeats: json['acceptedSeats'] as int,
      capacity: json['capacity'] as int,
      timeoutAtMs: json['timeoutAtMs'] as int?,
      matchId: json['matchId'] as String?,
      serverNowMs: json['serverNowMs'] as int,
    );
  }
}

/// session.accepted payload — exact mutually exclusive contract shapes.
///
/// Creator: `{ matchId, role: "creator" }`
/// Player: `{ matchId, playerId, resumeToken }`
class SessionAcceptedPayload {
  const SessionAcceptedPayload._({
    required this.matchId,
    this.playerId,
    this.resumeToken,
    this.role,
  });

  /// Creator-only acceptance (no player credentials).
  const SessionAcceptedPayload.creator({required String matchId})
    : this._(matchId: matchId, role: 'creator');

  /// Player join/resume acceptance (no creator role).
  const SessionAcceptedPayload.player({
    required String matchId,
    required String playerId,
    required String resumeToken,
  }) : this._(matchId: matchId, playerId: playerId, resumeToken: resumeToken);

  final String matchId;
  final String? playerId;
  final String? resumeToken;
  final String? role;

  bool get isCreator => role == 'creator';
  bool get isPlayer => playerId != null && resumeToken != null && role == null;

  /// Strict parse aligned with contracts `sessionAcceptedPayloadSchema`.
  ///
  /// Returns null when the payload is not exactly one of the two shapes
  /// (rejects mixed creator+credentials, partials, and unknown keys).
  static SessionAcceptedPayload? tryParse(Map<String, dynamic> json) {
    final Object? matchIdRaw = json['matchId'];
    if (matchIdRaw is! String || matchIdRaw.isEmpty) return null;

    final Set<String> keys = json.keys.toSet();
    final bool hasPlayerId = keys.contains('playerId');
    final bool hasResumeToken = keys.contains('resumeToken');
    final bool hasRole = keys.contains('role');

    // Creator: exactly { matchId, role: "creator" }
    if (hasRole && !hasPlayerId && !hasResumeToken && keys.length == 2) {
      if (json['role'] != 'creator') return null;
      return SessionAcceptedPayload.creator(matchId: matchIdRaw);
    }

    // Player: exactly { matchId, playerId, resumeToken }
    if (!hasRole && hasPlayerId && hasResumeToken && keys.length == 3) {
      final Object? playerId = json['playerId'];
      final Object? resumeToken = json['resumeToken'];
      if (playerId is! String || playerId.isEmpty) return null;
      if (resumeToken is! String || resumeToken.isEmpty) return null;
      return SessionAcceptedPayload.player(
        matchId: matchIdRaw,
        playerId: playerId,
        resumeToken: resumeToken,
      );
    }

    return null;
  }

  factory SessionAcceptedPayload.fromJson(Map<String, dynamic> json) {
    final SessionAcceptedPayload? parsed = tryParse(json);
    if (parsed == null) {
      throw FormatException('Invalid session.accepted payload: $json');
    }
    return parsed;
  }
}

/// challenge.signal payload.
class ChallengeSignalPayload {
  const ChallengeSignalPayload({
    required this.challengeInstanceId,
    required this.signalToken,
    required this.signaledAtMs,
    required this.serverNowMs,
  });

  final String challengeInstanceId;
  final String signalToken;
  final int signaledAtMs;
  final int serverNowMs;

  factory ChallengeSignalPayload.fromJson(Map<String, dynamic> json) {
    return ChallengeSignalPayload(
      challengeInstanceId: json['challengeInstanceId'] as String,
      signalToken: json['signalToken'] as String,
      signaledAtMs: json['signaledAtMs'] as int,
      serverNowMs: json['serverNowMs'] as int,
    );
  }
}

/// challenge.submission_ack payload.
class ChallengeSubmissionAckPayload {
  const ChallengeSubmissionAckPayload({
    required this.accepted,
    this.reasonKey,
    this.duplicate,
  });

  final bool accepted;
  final String? reasonKey;
  final bool? duplicate;

  factory ChallengeSubmissionAckPayload.fromJson(Map<String, dynamic> json) {
    return ChallengeSubmissionAckPayload(
      accepted: json['accepted'] as bool,
      reasonKey: json['reasonKey'] as String?,
      duplicate: json['duplicate'] as bool?,
    );
  }
}

/// challenge.resolved payload.
class ChallengeResolvedPayload {
  const ChallengeResolvedPayload({
    required this.challengeInstanceId,
    required this.resolutions,
  });

  final String challengeInstanceId;
  final List<PlayerChallengeResolution> resolutions;

  factory ChallengeResolvedPayload.fromJson(Map<String, dynamic> json) {
    return ChallengeResolvedPayload(
      challengeInstanceId: json['challengeInstanceId'] as String,
      resolutions: (json['resolutions'] as List<dynamic>)
          .map(
            (dynamic e) => PlayerChallengeResolution.fromJson(
              Map<String, dynamic>.from(e as Map<dynamic, dynamic>),
            ),
          )
          .toList(),
    );
  }
}

/// match.state_changed payload.
class MatchStateChangedPayload {
  const MatchStateChangedPayload({required this.status, this.reasonKey});

  final String status;
  final String? reasonKey;

  factory MatchStateChangedPayload.fromJson(Map<String, dynamic> json) {
    return MatchStateChangedPayload(
      status: json['status'] as String,
      reasonKey: json['reasonKey'] as String?,
    );
  }
}

/// match.finished payload.
class MatchFinishedPayload {
  const MatchFinishedPayload({required this.winnerId});

  final String winnerId;

  factory MatchFinishedPayload.fromJson(Map<String, dynamic> json) {
    return MatchFinishedPayload(winnerId: json['winnerId'] as String);
  }
}

/// protocol.error payload.
class ProtocolErrorPayload {
  const ProtocolErrorPayload({
    required this.code,
    required this.messageKey,
    this.commandId,
  });

  final String code;
  final String messageKey;
  final String? commandId;

  factory ProtocolErrorPayload.fromJson(Map<String, dynamic> json) {
    return ProtocolErrorPayload(
      code: json['code'] as String,
      messageKey: json['messageKey'] as String,
      commandId: json['commandId'] as String?,
    );
  }
}

/// match.player_presence payload.
class PlayerPresencePayload {
  const PlayerPresencePayload({
    required this.playerId,
    required this.presence,
    required this.joined,
  });

  final String playerId;
  final Presence presence;
  final bool joined;

  factory PlayerPresencePayload.fromJson(Map<String, dynamic> json) {
    return PlayerPresencePayload(
      playerId: json['playerId'] as String,
      presence: Presence.fromString(json['presence'] as String),
      joined: json['joined'] as bool,
    );
  }
}
