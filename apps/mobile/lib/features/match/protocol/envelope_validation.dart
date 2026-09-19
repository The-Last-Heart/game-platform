import '../../identity/data/display_name_moderation.dart';
import 'realtime_messages.dart';

/// Result of validating a server envelope before reducer/controller effects.
class EnvelopeValidation {
  const EnvelopeValidation._({required this.isValid, this.reason});

  const EnvelopeValidation.valid() : this._(isValid: true);

  const EnvelopeValidation.invalid(String reason)
    : this._(isValid: false, reason: reason);

  final bool isValid;
  final String? reason;
}

const Set<String> _knownServerEventTypes = <String>{
  MessageTypes.sessionAccepted,
  MessageTypes.matchSnapshot,
  MessageTypes.playerPresence,
  MessageTypes.challengeStarted,
  MessageTypes.challengeSignal,
  MessageTypes.challengeSignalEnded,
  MessageTypes.challengeSubmissionAck,
  MessageTypes.challengeResolved,
  MessageTypes.matchStateChanged,
  MessageTypes.matchFinished,
  MessageTypes.matchDrawn,
  MessageTypes.powerGranted,
  MessageTypes.powerInventoryFull,
  MessageTypes.powerOffered,
  MessageTypes.powerUsed,
  MessageTypes.powerDefenseRequired,
  MessageTypes.powerResolved,
  MessageTypes.protocolError,
};

/// Contract `protocol.error.code` enum (packages/contracts protocol.ts).
const Set<String> protocolErrorCodes = <String>{
  'INVALID_SCHEMA_VERSION',
  'UNKNOWN_MESSAGE_TYPE',
  'INVALID_PAYLOAD',
  'UNAUTHORIZED',
  'MATCH_NOT_FOUND',
  'MATCH_FULL',
  'MATCH_NOT_JOINABLE',
  'SPECTATOR_CANNOT_SUBMIT',
  'CHALLENGE_NOT_ACTIVE',
  'SUBMISSION_LATE',
  'DUPLICATE_COMMAND',
  'INTERNAL_ERROR',
  'DEV_ONLY_FORBIDDEN',
  'ROOM_CODE_INVALID',
  'ROOM_CODE_EXPIRED',
  'ROOM_FULL',
  'QUEUE_CANCELLED',
  'QUEUE_TIMEOUT',
  'QUEUE_NOT_FOUND',
  'ALREADY_IN_QUEUE',
  'ALREADY_IN_MATCH',
  'NOT_IN_MATCH',
  'NOT_HOST',
  'REMATCH_UNAVAILABLE',
  'MATCHMAKING_PAUSED',
  'TRAINING_UNAVAILABLE',
  'POWER_NOT_AVAILABLE',
  'POWER_PHASE_INVALID',
  'ILLEGAL_POWER_TARGET',
  'POWER_ATTACK_NOT_FOUND',
  'OFFENSIVE_POWERS_DISABLED',
  'DISPLAY_NAME_TAKEN',
  'DISPLAY_NAME_PROHIBITED',
  'DISPLAY_NAME_INVALID',
  'APP_UPDATE_REQUIRED',
  'CLIENT_VERSION_MISSING',
  'CLIENT_VERSION_INVALID',
  'PRIVATE_ROOM_VERSION_CLIENT_OLDER',
  'PRIVATE_ROOM_VERSION_CLIENT_NEWER',
  'MATCH_RESUME_VERSION_MISMATCH',
  'NO_COMPATIBLE_CHALLENGES_FOR_APP_VERSION',
};

const Set<String> _matchPhases = <String>{
  'lobby',
  'ready_countdown',
  'challenge_intro',
  'challenge_active',
  'round_result',
  'power_action',
  'power_defense',
  'completed',
  'draw',
  'halted',
};

const Set<String> _matchModes = <String>{
  'quick_survival',
  'private',
  'training',
  'dev',
};

const Set<String> _matchStatuses = <String>{
  'waiting',
  'challenge_active',
  'resolving',
  'completed',
};

const Set<String> _roundPhases = <String>{
  'waiting_signal',
  'signal_active',
  'signal_expired',
  'preview',
  'answer',
  'resolved',
};

const Set<String> _playerStatuses = <String>{'active', 'spectator', 'left'};
const Set<String> _presences = <String>{'connected', 'disconnected'};
const Set<String> _outcomes = <String>{
  'success',
  'failure',
  'timeout',
  'skipped_spectator',
  'left',
};
const Set<String> _powerIds = <String>{
  PowerIds.dangerPulse,
  PowerIds.shield,
  PowerIds.reflection,
};
const Set<String> _powerGrantOutcomes = <String>{'granted', 'inventory_full'};
const Set<String> _powerResolveOutcomes = <String>{
  'hit',
  'shielded',
  'reflected_hit',
  'reflected_shielded',
  'expired',
  'cancelled',
};

bool _isCharge01(Object? value) => value is int && value >= 0 && value <= 1;

bool _isEnergy(Object? value) => value is int && value >= 0 && value <= 4;

bool _isNonEmptyBounded(Object? value, {required int max}) =>
    value is String && value.isNotEmpty && value.length <= max;

bool _isUuidLike(Object? value) => _isNonEmptyBounded(value, max: 128);

bool _isNonEmpty(Object? value) => _isNonEmptyBounded(value, max: 256);

bool _isNonNegInt(Object? value) => value is int && !value.isNegative;

bool _isPositiveInt(Object? value) => value is int && value > 0;

bool _isBool(Object? value) => value is bool;

EnvelopeValidation? _rejectExtraKeys(
  Map<String, dynamic> map,
  Set<String> allowed,
  String label,
) {
  for (final String key in map.keys) {
    if (!allowed.contains(key)) {
      return EnvelopeValidation.invalid('$label has unknown field: $key');
    }
  }
  return null;
}

EnvelopeValidation? _validatePlayerPublic(
  Map<String, dynamic> json,
  String label,
) {
  final EnvelopeValidation? extra = _rejectExtraKeys(json, <String>{
    'playerId',
    'hearts',
    'energy',
    'claimedPoints',
    'status',
    'presence',
    'submittedForCurrentChallenge',
    'inventory',
    'protectedThroughRound',
    'lastDangerPulseTargetId',
    'displayName',
    'avatarColor',
    'countryCode',
    'ready',
    'isBot',
    'isHost',
  }, label);
  if (extra != null) return extra;
  if (!_isUuidLike(json['playerId'])) {
    return EnvelopeValidation.invalid('$label.playerId invalid');
  }
  final Object? hearts = json['hearts'];
  if (hearts is! int || hearts < 0 || hearts > 3) {
    return EnvelopeValidation.invalid('$label.hearts invalid');
  }
  if (!_isEnergy(json['energy'])) {
    return EnvelopeValidation.invalid('$label.energy invalid');
  }
  if (json.containsKey('claimedPoints') &&
      json['claimedPoints'] != null &&
      !_isNonNegInt(json['claimedPoints'])) {
    return EnvelopeValidation.invalid('$label.claimedPoints invalid');
  }
  if (json['status'] is! String ||
      !_playerStatuses.contains(json['status'] as String)) {
    return EnvelopeValidation.invalid('$label.status invalid');
  }
  if (json['presence'] is! String ||
      !_presences.contains(json['presence'] as String)) {
    return EnvelopeValidation.invalid('$label.presence invalid');
  }
  if (!_isBool(json['submittedForCurrentChallenge'])) {
    return EnvelopeValidation.invalid(
      '$label.submittedForCurrentChallenge invalid',
    );
  }
  if (json.containsKey('inventory') && json['inventory'] != null) {
    final Object? inv = json['inventory'];
    if (inv is! Map) {
      return EnvelopeValidation.invalid('$label.inventory invalid');
    }
    final Map<String, dynamic> invMap = Map<String, dynamic>.from(inv);
    final EnvelopeValidation? invExtra = _rejectExtraKeys(invMap, <String>{
      'danger_pulse',
      'shield',
      'reflection',
    }, '$label.inventory');
    if (invExtra != null) return invExtra;
    if (!_isCharge01(invMap['danger_pulse']) ||
        !_isCharge01(invMap['shield']) ||
        !_isCharge01(invMap['reflection'])) {
      return EnvelopeValidation.invalid('$label.inventory charges invalid');
    }
  }
  if (json.containsKey('protectedThroughRound') &&
      json['protectedThroughRound'] != null &&
      !_isNonNegInt(json['protectedThroughRound'])) {
    return EnvelopeValidation.invalid(
      '$label.protectedThroughRound invalid',
    );
  }
  if (json.containsKey('lastDangerPulseTargetId') &&
      json['lastDangerPulseTargetId'] != null &&
      !_isUuidLike(json['lastDangerPulseTargetId'])) {
    return EnvelopeValidation.invalid(
      '$label.lastDangerPulseTargetId invalid',
    );
  }
  if (json.containsKey('displayName') && json['displayName'] != null) {
    final Object? name = json['displayName'];
    if (name is! String || !isValidDisplayNameFormat(name)) {
      return EnvelopeValidation.invalid('$label.displayName invalid');
    }
  }
  if (json.containsKey('avatarColor') && json['avatarColor'] != null) {
    final Object? color = json['avatarColor'];
    if (color is! String ||
        !RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(color)) {
      return EnvelopeValidation.invalid('$label.avatarColor invalid');
    }
  }
  if (json.containsKey('countryCode') && json['countryCode'] != null) {
    final Object? country = json['countryCode'];
    if (country is! String ||
        !RegExp(r'^[A-Z]{2}$').hasMatch(country)) {
      return EnvelopeValidation.invalid('$label.countryCode invalid');
    }
  }
  for (final String key in <String>['ready', 'isBot', 'isHost']) {
    if (json.containsKey(key) && json[key] != null && !_isBool(json[key])) {
      return EnvelopeValidation.invalid('$label.$key invalid');
    }
  }
  return null;
}

EnvelopeValidation? _validatePendingAttack(
  Map<String, dynamic> json,
  String label,
) {
  final EnvelopeValidation? extra = _rejectExtraKeys(json, <String>{
    'attackId',
    'attackerId',
    'targetId',
    'powerId',
    'reflected',
    'defenseDeadlineAtMs',
  }, label);
  if (extra != null) return extra;
  if (!_isUuidLike(json['attackId']) ||
      !_isUuidLike(json['attackerId']) ||
      !_isUuidLike(json['targetId'])) {
    return EnvelopeValidation.invalid('$label ids invalid');
  }
  if (json['powerId'] != PowerIds.dangerPulse) {
    return EnvelopeValidation.invalid('$label.powerId invalid');
  }
  if (!_isBool(json['reflected'])) {
    return EnvelopeValidation.invalid('$label.reflected invalid');
  }
  if (!_isNonNegInt(json['defenseDeadlineAtMs'])) {
    return EnvelopeValidation.invalid('$label.defenseDeadlineAtMs invalid');
  }
  return null;
}

EnvelopeValidation? _validateTactical(
  Map<String, dynamic> json,
  String label,
) {
  final EnvelopeValidation? extra = _rejectExtraKeys(json, <String>{
    'pendingAttack',
    'eligibleTargetIds',
    'actorsWithOffensiveCharge',
    'lastGrant',
  }, label);
  if (extra != null) return extra;
  final Object? pending = json['pendingAttack'];
  if (pending != null) {
    if (pending is! Map) {
      return EnvelopeValidation.invalid('$label.pendingAttack invalid');
    }
    final EnvelopeValidation? err = _validatePendingAttack(
      Map<String, dynamic>.from(pending),
      '$label.pendingAttack',
    );
    if (err != null) return err;
  }
  for (final String key in <String>[
    'eligibleTargetIds',
    'actorsWithOffensiveCharge',
  ]) {
    if (!json.containsKey(key) || json[key] == null) continue;
    final Object? list = json[key];
    if (list is! List) {
      return EnvelopeValidation.invalid('$label.$key invalid');
    }
    for (final Object? item in list) {
      if (!_isUuidLike(item)) {
        return EnvelopeValidation.invalid('$label.$key item invalid');
      }
    }
  }
  if (json.containsKey('lastGrant') && json['lastGrant'] != null) {
    final Object? grant = json['lastGrant'];
    if (grant is! Map) {
      return EnvelopeValidation.invalid('$label.lastGrant invalid');
    }
    final Map<String, dynamic> grantMap = Map<String, dynamic>.from(grant);
    final EnvelopeValidation? grantExtra = _rejectExtraKeys(grantMap, <String>{
      'playerId',
      'powerId',
      'outcome',
    }, '$label.lastGrant');
    if (grantExtra != null) return grantExtra;
    if (!_isUuidLike(grantMap['playerId'])) {
      return EnvelopeValidation.invalid('$label.lastGrant.playerId invalid');
    }
    if (grantMap.containsKey('powerId') &&
        grantMap['powerId'] != null &&
        (grantMap['powerId'] is! String ||
            !_powerIds.contains(grantMap['powerId'] as String))) {
      return EnvelopeValidation.invalid('$label.lastGrant.powerId invalid');
    }
    if (grantMap['outcome'] is! String ||
        !_powerGrantOutcomes.contains(grantMap['outcome'] as String)) {
      return EnvelopeValidation.invalid('$label.lastGrant.outcome invalid');
    }
  }
  return null;
}

EnvelopeValidation? _validateResolution(
  Map<String, dynamic> json,
  String label,
) {
  final EnvelopeValidation? extra = _rejectExtraKeys(json, <String>{
    'playerId',
    'outcome',
    'heartsDelta',
    'energyDelta',
    'heartsAfter',
    'energyAfter',
    'statusAfter',
    'reasonKey',
    'measureMs',
  }, label);
  if (extra != null) return extra;
  if (!_isUuidLike(json['playerId'])) {
    return EnvelopeValidation.invalid('$label.playerId invalid');
  }
  if (json['outcome'] is! String ||
      !_outcomes.contains(json['outcome'] as String)) {
    return EnvelopeValidation.invalid('$label.outcome invalid');
  }
  if (json['heartsDelta'] is! int) {
    return EnvelopeValidation.invalid('$label.heartsDelta invalid');
  }
  if (json['energyDelta'] is! int) {
    return EnvelopeValidation.invalid('$label.energyDelta invalid');
  }
  final Object? heartsAfter = json['heartsAfter'];
  if (heartsAfter is! int || heartsAfter < 0 || heartsAfter > 3) {
    return EnvelopeValidation.invalid('$label.heartsAfter invalid');
  }
  if (!_isEnergy(json['energyAfter'])) {
    return EnvelopeValidation.invalid('$label.energyAfter invalid');
  }
  if (json['statusAfter'] is! String ||
      !_playerStatuses.contains(json['statusAfter'] as String)) {
    return EnvelopeValidation.invalid('$label.statusAfter invalid');
  }
  if (json.containsKey('reasonKey') &&
      json['reasonKey'] != null &&
      !_isNonEmpty(json['reasonKey'])) {
    return EnvelopeValidation.invalid('$label.reasonKey invalid');
  }
  if (json.containsKey('measureMs') &&
      json['measureMs'] != null &&
      !_isNonNegInt(json['measureMs'])) {
    return EnvelopeValidation.invalid('$label.measureMs invalid');
  }
  return null;
}

EnvelopeValidation? _validatePublicChallenge(
  Map<String, dynamic> json,
  String label,
) {
  final EnvelopeValidation? extra = _rejectExtraKeys(json, <String>{
    'challengeInstanceId',
    'definitionId',
    'definitionVersion',
    'engineId',
    'promptKey',
    'choiceKeys',
    'clientConfig',
    'serverNowMs',
    'startsAtMs',
    'deadlineAtMs',
    'durationMs',
    'roundPhase',
    'signalToken',
    'signaledAtMs',
    'signalEndsAtMs',
  }, label);
  if (extra != null) return extra;
  if (json.containsKey('serverConfig')) {
    return EnvelopeValidation.invalid('$label must not include serverConfig');
  }
  if (!_isUuidLike(json['challengeInstanceId'])) {
    return EnvelopeValidation.invalid('$label.challengeInstanceId invalid');
  }
  if (!_isNonEmpty(json['definitionId'])) {
    return EnvelopeValidation.invalid('$label.definitionId invalid');
  }
  if (!_isPositiveInt(json['definitionVersion'])) {
    return EnvelopeValidation.invalid('$label.definitionVersion invalid');
  }
  if (!_isNonEmpty(json['engineId'])) {
    return EnvelopeValidation.invalid('$label.engineId invalid');
  }
  if (!_isNonEmpty(json['promptKey'])) {
    return EnvelopeValidation.invalid('$label.promptKey invalid');
  }
  if (json.containsKey('choiceKeys')) {
    final Object? choiceKeys = json['choiceKeys'];
    if (choiceKeys is! List) {
      return EnvelopeValidation.invalid('$label.choiceKeys invalid');
    }
    for (final Object? item in choiceKeys) {
      if (!_isNonEmpty(item)) {
        return EnvelopeValidation.invalid('$label.choiceKeys item invalid');
      }
    }
  }
  final Object? clientConfig = json['clientConfig'];
  if (clientConfig is! Map) {
    return EnvelopeValidation.invalid('$label.clientConfig invalid');
  }
  if (clientConfig.containsKey('expectedChoice')) {
    return EnvelopeValidation.invalid(
      '$label.clientConfig must not include expectedChoice',
    );
  }
  if (!_isNonNegInt(json['serverNowMs']) ||
      !_isNonNegInt(json['startsAtMs']) ||
      !_isNonNegInt(json['deadlineAtMs'])) {
    return EnvelopeValidation.invalid('$label timing fields invalid');
  }
  final Object? durationMs = json['durationMs'];
  // Must stay aligned with contracts challengeDurationMsSchema (3s–15s).
  if (durationMs is! int || durationMs < 3000 || durationMs > 15000) {
    return EnvelopeValidation.invalid('$label.durationMs invalid');
  }
  if (json['roundPhase'] is! String ||
      !_roundPhases.contains(json['roundPhase'] as String)) {
    return EnvelopeValidation.invalid('$label.roundPhase invalid');
  }
  if (json.containsKey('signalToken') &&
      json['signalToken'] != null &&
      json['signalToken'] is! String) {
    return EnvelopeValidation.invalid('$label.signalToken invalid');
  }
  if (json.containsKey('signaledAtMs') &&
      json['signaledAtMs'] != null &&
      !_isNonNegInt(json['signaledAtMs'])) {
    return EnvelopeValidation.invalid('$label.signaledAtMs invalid');
  }
  if (json.containsKey('signalEndsAtMs') &&
      json['signalEndsAtMs'] != null &&
      !_isNonNegInt(json['signalEndsAtMs'])) {
    return EnvelopeValidation.invalid('$label.signalEndsAtMs invalid');
  }
  return null;
}

EnvelopeValidation? _validateLastRoundResult(
  Map<String, dynamic> json,
  String label,
) {
  final EnvelopeValidation? extra = _rejectExtraKeys(json, <String>{
    'challengeInstanceId',
    'resolutions',
  }, label);
  if (extra != null) return extra;
  if (!_isUuidLike(json['challengeInstanceId'])) {
    return EnvelopeValidation.invalid('$label.challengeInstanceId invalid');
  }
  final Object? resolutions = json['resolutions'];
  if (resolutions is! List) {
    return EnvelopeValidation.invalid('$label.resolutions invalid');
  }
  for (int i = 0; i < resolutions.length; i++) {
    final Object? item = resolutions[i];
    if (item is! Map) {
      return EnvelopeValidation.invalid('$label.resolutions[$i] invalid');
    }
    final EnvelopeValidation? err = _validateResolution(
      Map<String, dynamic>.from(item),
      '$label.resolutions[$i]',
    );
    if (err != null) return err;
  }
  return null;
}

EnvelopeValidation _validateSessionAccepted(Map<String, dynamic> payload) {
  if (SessionAcceptedPayload.tryParse(payload) == null) {
    return const EnvelopeValidation.invalid(
      'session.accepted payload shape invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validateMatchSnapshot(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'matchId',
    'status',
    'phase',
    'phaseDeadlineAtMs',
    'lobbyFillDeadlineAtMs',
    'roundNumber',
    'serverNowMs',
    'lastRoundResult',
    'nextPhaseAtMs',
    'revision',
    'sequence',
    'players',
    'winnerId',
    'currentChallenge',
    'mode',
    'hostPlayerId',
    'roomCode',
    'releasePins',
    'tactical',
  }, 'match.snapshot');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['matchId'])) {
    return const EnvelopeValidation.invalid('match.snapshot.matchId invalid');
  }
  if (payload['status'] is! String ||
      !_matchStatuses.contains(payload['status'] as String)) {
    return const EnvelopeValidation.invalid('match.snapshot.status invalid');
  }
  if (payload['phase'] is! String ||
      !_matchPhases.contains(payload['phase'] as String)) {
    return const EnvelopeValidation.invalid('match.snapshot.phase invalid');
  }
  final Object? phaseDeadline = payload['phaseDeadlineAtMs'];
  if (phaseDeadline != null && !_isNonNegInt(phaseDeadline)) {
    return const EnvelopeValidation.invalid(
      'match.snapshot.phaseDeadlineAtMs invalid',
    );
  }
  final Object? lobbyFillDeadline = payload['lobbyFillDeadlineAtMs'];
  if (lobbyFillDeadline != null && !_isNonNegInt(lobbyFillDeadline)) {
    return const EnvelopeValidation.invalid(
      'match.snapshot.lobbyFillDeadlineAtMs invalid',
    );
  }
  if (!_isNonNegInt(payload['roundNumber']) ||
      !_isNonNegInt(payload['serverNowMs']) ||
      !_isNonNegInt(payload['sequence']) ||
      !_isPositiveInt(payload['revision'])) {
    return const EnvelopeValidation.invalid(
      'match.snapshot numeric fields invalid',
    );
  }
  final Object? nextPhase = payload['nextPhaseAtMs'];
  if (nextPhase != null && !_isNonNegInt(nextPhase)) {
    return const EnvelopeValidation.invalid(
      'match.snapshot.nextPhaseAtMs invalid',
    );
  }
  final Object? lastRound = payload['lastRoundResult'];
  if (lastRound != null) {
    if (lastRound is! Map) {
      return const EnvelopeValidation.invalid(
        'match.snapshot.lastRoundResult invalid',
      );
    }
    final EnvelopeValidation? err = _validateLastRoundResult(
      Map<String, dynamic>.from(lastRound),
      'match.snapshot.lastRoundResult',
    );
    if (err != null) return err;
  }
  final Object? players = payload['players'];
  if (players is! List) {
    return const EnvelopeValidation.invalid('match.snapshot.players invalid');
  }
  for (int i = 0; i < players.length; i++) {
    final Object? item = players[i];
    if (item is! Map) {
      return EnvelopeValidation.invalid('match.snapshot.players[$i] invalid');
    }
    final EnvelopeValidation? err = _validatePlayerPublic(
      Map<String, dynamic>.from(item),
      'match.snapshot.players[$i]',
    );
    if (err != null) return err;
  }
  final Object? winnerId = payload['winnerId'];
  if (winnerId != null && !_isUuidLike(winnerId)) {
    return const EnvelopeValidation.invalid('match.snapshot.winnerId invalid');
  }
  if (payload.containsKey('mode') && payload['mode'] != null) {
    final Object? mode = payload['mode'];
    if (mode is! String || !_matchModes.contains(mode)) {
      return const EnvelopeValidation.invalid('match.snapshot.mode invalid');
    }
  }
  if (payload.containsKey('hostPlayerId') && payload['hostPlayerId'] != null) {
    if (!_isUuidLike(payload['hostPlayerId'])) {
      return const EnvelopeValidation.invalid(
        'match.snapshot.hostPlayerId invalid',
      );
    }
  }
  if (payload.containsKey('roomCode') && payload['roomCode'] != null) {
    final Object? code = payload['roomCode'];
    if (code is! String ||
        code.length < 4 ||
        code.length > 8 ||
        !RegExp(r'^[A-Za-z0-9]+$').hasMatch(code)) {
      return const EnvelopeValidation.invalid(
        'match.snapshot.roomCode invalid',
      );
    }
  }
  if (payload.containsKey('releasePins') && payload['releasePins'] != null) {
    final Object? pins = payload['releasePins'];
    if (pins is! Map) {
      return const EnvelopeValidation.invalid(
        'match.snapshot.releasePins invalid',
      );
    }
    final Map<String, dynamic> map = Map<String, dynamic>.from(pins);
    const List<String> keys = <String>[
      'challengeCatalogReleaseId',
      'gameModeRuleReleaseId',
      'localizationReleaseId',
      'powerConfigurationReleaseId',
    ];
    for (final String key in keys) {
      if (!_isUuidLike(map[key])) {
        return EnvelopeValidation.invalid(
          'match.snapshot.releasePins.$key invalid',
        );
      }
    }
  }
  final Object? challenge = payload['currentChallenge'];
  if (challenge != null) {
    if (challenge is! Map) {
      return const EnvelopeValidation.invalid(
        'match.snapshot.currentChallenge invalid',
      );
    }
    final EnvelopeValidation? err = _validatePublicChallenge(
      Map<String, dynamic>.from(challenge),
      'match.snapshot.currentChallenge',
    );
    if (err != null) return err;
  }
  if (payload.containsKey('tactical') && payload['tactical'] != null) {
    final Object? tactical = payload['tactical'];
    if (tactical is! Map) {
      return const EnvelopeValidation.invalid(
        'match.snapshot.tactical invalid',
      );
    }
    final EnvelopeValidation? err = _validateTactical(
      Map<String, dynamic>.from(tactical),
      'match.snapshot.tactical',
    );
    if (err != null) return err;
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validatePlayerPresence(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'playerId',
    'presence',
    'joined',
  }, 'match.player_presence');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['playerId'])) {
    return const EnvelopeValidation.invalid(
      'match.player_presence.playerId invalid',
    );
  }
  if (payload['presence'] is! String ||
      !_presences.contains(payload['presence'] as String)) {
    return const EnvelopeValidation.invalid(
      'match.player_presence.presence invalid',
    );
  }
  if (!_isBool(payload['joined'])) {
    return const EnvelopeValidation.invalid(
      'match.player_presence.joined invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validateChallengeStarted(Map<String, dynamic> payload) {
  final EnvelopeValidation? err = _validatePublicChallenge(
    payload,
    'challenge.started',
  );
  return err ?? const EnvelopeValidation.valid();
}

EnvelopeValidation _validateChallengeSignal(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'challengeInstanceId',
    'signalToken',
    'signaledAtMs',
    'signalEndsAtMs',
    'serverNowMs',
    'playerId',
  }, 'challenge.signal');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['challengeInstanceId'])) {
    return const EnvelopeValidation.invalid(
      'challenge.signal.challengeInstanceId invalid',
    );
  }
  if (!_isNonEmpty(payload['signalToken'])) {
    return const EnvelopeValidation.invalid(
      'challenge.signal.signalToken invalid',
    );
  }
  if (!_isNonNegInt(payload['signaledAtMs']) ||
      !_isNonNegInt(payload['signalEndsAtMs']) ||
      !_isNonNegInt(payload['serverNowMs'])) {
    return const EnvelopeValidation.invalid(
      'challenge.signal timing fields invalid',
    );
  }
  if (payload.containsKey('playerId') &&
      payload['playerId'] != null &&
      !_isUuidLike(payload['playerId'])) {
    return const EnvelopeValidation.invalid(
      'challenge.signal.playerId invalid',
    );
  }
  final int signaledAtMs = payload['signaledAtMs'] as int;
  final int signalEndsAtMs = payload['signalEndsAtMs'] as int;
  if (signalEndsAtMs <= signaledAtMs) {
    return const EnvelopeValidation.invalid(
      'challenge.signal.signalEndsAtMs must be after signaledAtMs',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validateChallengeSignalEnded(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'challengeInstanceId',
    'signalEndsAtMs',
    'serverNowMs',
    'playerId',
  }, 'challenge.signal_ended');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['challengeInstanceId'])) {
    return const EnvelopeValidation.invalid(
      'challenge.signal_ended.challengeInstanceId invalid',
    );
  }
  if (!_isNonNegInt(payload['signalEndsAtMs']) ||
      !_isNonNegInt(payload['serverNowMs'])) {
    return const EnvelopeValidation.invalid(
      'challenge.signal_ended timing fields invalid',
    );
  }
  if (payload.containsKey('playerId') &&
      payload['playerId'] != null &&
      !_isUuidLike(payload['playerId'])) {
    return const EnvelopeValidation.invalid(
      'challenge.signal_ended.playerId invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validateSubmissionAck(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'accepted',
    'reasonKey',
    'duplicate',
  }, 'challenge.submission_ack');
  if (extra != null) return extra;
  if (!_isBool(payload['accepted'])) {
    return const EnvelopeValidation.invalid(
      'challenge.submission_ack.accepted invalid',
    );
  }
  if (payload.containsKey('reasonKey') && !_isNonEmpty(payload['reasonKey'])) {
    return const EnvelopeValidation.invalid(
      'challenge.submission_ack.reasonKey invalid',
    );
  }
  if (payload.containsKey('duplicate') && !_isBool(payload['duplicate'])) {
    return const EnvelopeValidation.invalid(
      'challenge.submission_ack.duplicate invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validateChallengeResolved(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'challengeInstanceId',
    'resolutions',
  }, 'challenge.resolved');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['challengeInstanceId'])) {
    return const EnvelopeValidation.invalid(
      'challenge.resolved.challengeInstanceId invalid',
    );
  }
  final Object? resolutions = payload['resolutions'];
  if (resolutions is! List) {
    return const EnvelopeValidation.invalid(
      'challenge.resolved.resolutions invalid',
    );
  }
  for (int i = 0; i < resolutions.length; i++) {
    final Object? item = resolutions[i];
    if (item is! Map) {
      return EnvelopeValidation.invalid(
        'challenge.resolved.resolutions[$i] invalid',
      );
    }
    final EnvelopeValidation? err = _validateResolution(
      Map<String, dynamic>.from(item),
      'challenge.resolved.resolutions[$i]',
    );
    if (err != null) return err;
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validateMatchStateChanged(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'status',
    'reasonKey',
  }, 'match.state_changed');
  if (extra != null) return extra;
  if (payload['status'] is! String ||
      !_matchStatuses.contains(payload['status'] as String)) {
    return const EnvelopeValidation.invalid(
      'match.state_changed.status invalid',
    );
  }
  if (payload.containsKey('reasonKey') && !_isNonEmpty(payload['reasonKey'])) {
    return const EnvelopeValidation.invalid(
      'match.state_changed.reasonKey invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validateMatchFinished(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'winnerId',
  }, 'match.finished');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['winnerId'])) {
    return const EnvelopeValidation.invalid('match.finished.winnerId invalid');
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validateMatchDrawn(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(
    payload,
    <String>{},
    'match.drawn',
  );
  if (extra != null) return extra;
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validatePowerGranted(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'playerId',
    'powerId',
    'energyAfter',
  }, 'power.granted');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['playerId'])) {
    return const EnvelopeValidation.invalid('power.granted.playerId invalid');
  }
  if (payload['powerId'] is! String ||
      !_powerIds.contains(payload['powerId'] as String)) {
    return const EnvelopeValidation.invalid('power.granted.powerId invalid');
  }
  if (!_isEnergy(payload['energyAfter'])) {
    return const EnvelopeValidation.invalid(
      'power.granted.energyAfter invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validatePowerInventoryFull(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'playerId',
    'energyAfter',
  }, 'power.inventory_full');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['playerId'])) {
    return const EnvelopeValidation.invalid(
      'power.inventory_full.playerId invalid',
    );
  }
  if (!_isEnergy(payload['energyAfter'])) {
    return const EnvelopeValidation.invalid(
      'power.inventory_full.energyAfter invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validatePowerOffered(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'actorsWithOffensiveCharge',
    'actionDeadlineAtMs',
  }, 'power.offered');
  if (extra != null) return extra;
  final Object? actors = payload['actorsWithOffensiveCharge'];
  if (actors is! List) {
    return const EnvelopeValidation.invalid(
      'power.offered.actorsWithOffensiveCharge invalid',
    );
  }
  for (final Object? item in actors) {
    if (!_isUuidLike(item)) {
      return const EnvelopeValidation.invalid(
        'power.offered.actorsWithOffensiveCharge item invalid',
      );
    }
  }
  if (!_isNonNegInt(payload['actionDeadlineAtMs'])) {
    return const EnvelopeValidation.invalid(
      'power.offered.actionDeadlineAtMs invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validatePowerUsed(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'attackId',
    'attackerId',
    'targetId',
    'powerId',
  }, 'power.used');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['attackId']) ||
      !_isUuidLike(payload['attackerId']) ||
      !_isUuidLike(payload['targetId'])) {
    return const EnvelopeValidation.invalid('power.used ids invalid');
  }
  if (payload['powerId'] != PowerIds.dangerPulse) {
    return const EnvelopeValidation.invalid('power.used.powerId invalid');
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validatePowerDefenseRequired(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'attackId',
    'attackerId',
    'targetId',
    'reflected',
    'defenseDeadlineAtMs',
  }, 'power.defense_required');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['attackId']) ||
      !_isUuidLike(payload['attackerId']) ||
      !_isUuidLike(payload['targetId'])) {
    return const EnvelopeValidation.invalid(
      'power.defense_required ids invalid',
    );
  }
  if (!_isBool(payload['reflected'])) {
    return const EnvelopeValidation.invalid(
      'power.defense_required.reflected invalid',
    );
  }
  if (!_isNonNegInt(payload['defenseDeadlineAtMs'])) {
    return const EnvelopeValidation.invalid(
      'power.defense_required.defenseDeadlineAtMs invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validatePowerResolved(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'attackId',
    'attackerId',
    'targetId',
    'outcome',
    'heartsDeltaTarget',
    'heartsAfterTarget',
    'statusAfterTarget',
  }, 'power.resolved');
  if (extra != null) return extra;
  if (!_isUuidLike(payload['attackId']) ||
      !_isUuidLike(payload['attackerId']) ||
      !_isUuidLike(payload['targetId'])) {
    return const EnvelopeValidation.invalid('power.resolved ids invalid');
  }
  if (payload['outcome'] is! String ||
      !_powerResolveOutcomes.contains(payload['outcome'] as String)) {
    return const EnvelopeValidation.invalid('power.resolved.outcome invalid');
  }
  if (payload['heartsDeltaTarget'] is! int) {
    return const EnvelopeValidation.invalid(
      'power.resolved.heartsDeltaTarget invalid',
    );
  }
  final Object? heartsAfter = payload['heartsAfterTarget'];
  if (heartsAfter is! int || heartsAfter < 0 || heartsAfter > 3) {
    return const EnvelopeValidation.invalid(
      'power.resolved.heartsAfterTarget invalid',
    );
  }
  if (payload['statusAfterTarget'] is! String ||
      !_playerStatuses.contains(payload['statusAfterTarget'] as String)) {
    return const EnvelopeValidation.invalid(
      'power.resolved.statusAfterTarget invalid',
    );
  }
  return const EnvelopeValidation.valid();
}

EnvelopeValidation _validateProtocolError(Map<String, dynamic> payload) {
  final EnvelopeValidation? extra = _rejectExtraKeys(payload, <String>{
    'code',
    'messageKey',
    'commandId',
  }, 'protocol.error');
  if (extra != null) return extra;
  final Object? code = payload['code'];
  if (code is! String || !protocolErrorCodes.contains(code)) {
    return const EnvelopeValidation.invalid('protocol.error.code invalid');
  }
  if (!_isNonEmpty(payload['messageKey'])) {
    return const EnvelopeValidation.invalid(
      'protocol.error.messageKey invalid',
    );
  }
  if (payload.containsKey('commandId') && !_isUuidLike(payload['commandId'])) {
    return const EnvelopeValidation.invalid('protocol.error.commandId invalid');
  }
  return const EnvelopeValidation.valid();
}

/// Validates a raw server envelope against packages/contracts realtime v1.
///
/// Malformed or unsupported envelopes must produce [EnvelopeValidation.invalid]
/// without throwing, so the ordered event queue never permanently stalls.
EnvelopeValidation validateServerEnvelope(Map<String, dynamic> raw) {
  try {
    // Reject unknown top-level keys beyond the contract envelope base.
    final EnvelopeValidation? envelopeExtra = _rejectExtraKeys(raw, <String>{
      'schemaVersion',
      'type',
      'messageId',
      'matchId',
      'commandId',
      'correlationId',
      'serverSequence',
      'serverTimestampMs',
      'payload',
    }, 'envelope');
    if (envelopeExtra != null) return envelopeExtra;

    final Object? schemaVersion = raw['schemaVersion'];
    if (schemaVersion != realtimeSchemaVersion) {
      return const EnvelopeValidation.invalid('unsupported schemaVersion');
    }

    final Object? type = raw['type'];
    if (!_isNonEmptyBounded(type, max: 64)) {
      return const EnvelopeValidation.invalid('missing type');
    }
    final String typeStr = type! as String;
    if (!_knownServerEventTypes.contains(typeStr)) {
      return EnvelopeValidation.invalid('unknown event type: $typeStr');
    }

    if (!_isUuidLike(raw['messageId'])) {
      return const EnvelopeValidation.invalid('missing messageId');
    }

    final Object? envelopeMatchId = raw['matchId'];
    if (raw.containsKey('matchId') && !_isUuidLike(envelopeMatchId)) {
      return const EnvelopeValidation.invalid('empty envelope matchId');
    }

    final Object? commandId = raw['commandId'];
    if (raw.containsKey('commandId') && !_isUuidLike(commandId)) {
      return const EnvelopeValidation.invalid('empty commandId');
    }

    if (raw.containsKey('correlationId') &&
        !_isUuidLike(raw['correlationId'])) {
      return const EnvelopeValidation.invalid('invalid correlationId');
    }

    if (raw.containsKey('serverSequence') &&
        !_isNonNegInt(raw['serverSequence'])) {
      return const EnvelopeValidation.invalid('invalid serverSequence');
    }
    if (raw.containsKey('serverTimestampMs') &&
        !_isNonNegInt(raw['serverTimestampMs'])) {
      return const EnvelopeValidation.invalid('invalid serverTimestampMs');
    }

    if (typeStr == MessageTypes.sessionAccepted ||
        typeStr == MessageTypes.challengeSubmissionAck) {
      if (!_isUuidLike(commandId)) {
        return EnvelopeValidation.invalid('$typeStr requires commandId');
      }
    }

    final Object? payloadRaw = raw['payload'];
    if (payloadRaw == null || payloadRaw is! Map) {
      return const EnvelopeValidation.invalid('missing payload');
    }
    final Map<String, dynamic> payload = Map<String, dynamic>.from(payloadRaw);

    final Object? payloadMatchId = payload['matchId'];
    if (payload.containsKey('matchId') && !_isUuidLike(payloadMatchId)) {
      return const EnvelopeValidation.invalid('empty payload matchId');
    }
    if (envelopeMatchId is String &&
        payloadMatchId is String &&
        envelopeMatchId != payloadMatchId) {
      return const EnvelopeValidation.invalid(
        'envelope/payload matchId disagree',
      );
    }

    switch (typeStr) {
      case MessageTypes.sessionAccepted:
        return _validateSessionAccepted(payload);
      case MessageTypes.matchSnapshot:
        return _validateMatchSnapshot(payload);
      case MessageTypes.playerPresence:
        return _validatePlayerPresence(payload);
      case MessageTypes.challengeStarted:
        return _validateChallengeStarted(payload);
      case MessageTypes.challengeSignal:
        return _validateChallengeSignal(payload);
      case MessageTypes.challengeSignalEnded:
        return _validateChallengeSignalEnded(payload);
      case MessageTypes.challengeSubmissionAck:
        return _validateSubmissionAck(payload);
      case MessageTypes.challengeResolved:
        return _validateChallengeResolved(payload);
      case MessageTypes.matchStateChanged:
        return _validateMatchStateChanged(payload);
      case MessageTypes.matchFinished:
        return _validateMatchFinished(payload);
      case MessageTypes.matchDrawn:
        return _validateMatchDrawn(payload);
      case MessageTypes.powerGranted:
        return _validatePowerGranted(payload);
      case MessageTypes.powerInventoryFull:
        return _validatePowerInventoryFull(payload);
      case MessageTypes.powerOffered:
        return _validatePowerOffered(payload);
      case MessageTypes.powerUsed:
        return _validatePowerUsed(payload);
      case MessageTypes.powerDefenseRequired:
        return _validatePowerDefenseRequired(payload);
      case MessageTypes.powerResolved:
        return _validatePowerResolved(payload);
      case MessageTypes.protocolError:
        return _validateProtocolError(payload);
      default:
        return EnvelopeValidation.invalid('unknown event type: $typeStr');
    }
  } catch (e) {
    return EnvelopeValidation.invalid('validation threw: $e');
  }
}
