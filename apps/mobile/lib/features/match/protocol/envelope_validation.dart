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
  MessageTypes.challengeSubmissionAck,
  MessageTypes.challengeResolved,
  MessageTypes.matchStateChanged,
  MessageTypes.matchFinished,
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
};

const Set<String> _matchPhases = <String>{
  'lobby',
  'ready_countdown',
  'challenge_intro',
  'challenge_active',
  'round_result',
  'completed',
  'halted',
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
  'resolved',
};

const Set<String> _playerStatuses = <String>{'active', 'spectator'};
const Set<String> _presences = <String>{'connected', 'disconnected'};
const Set<String> _outcomes = <String>{
  'success',
  'failure',
  'timeout',
  'skipped_spectator',
};

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
    'status',
    'presence',
    'submittedForCurrentChallenge',
  }, label);
  if (extra != null) return extra;
  if (!_isUuidLike(json['playerId'])) {
    return EnvelopeValidation.invalid('$label.playerId invalid');
  }
  final Object? hearts = json['hearts'];
  if (hearts is! int || hearts < 0 || hearts > 3) {
    return EnvelopeValidation.invalid('$label.hearts invalid');
  }
  if (!_isNonNegInt(json['energy'])) {
    return EnvelopeValidation.invalid('$label.energy invalid');
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
  if (!_isNonNegInt(json['energyAfter'])) {
    return EnvelopeValidation.invalid('$label.energyAfter invalid');
  }
  if (json['statusAfter'] is! String ||
      !_playerStatuses.contains(json['statusAfter'] as String)) {
    return EnvelopeValidation.invalid('$label.statusAfter invalid');
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
  if (durationMs is! int || durationMs < 3000 || durationMs > 8000) {
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
    'roundNumber',
    'serverNowMs',
    'lastRoundResult',
    'nextPhaseAtMs',
    'revision',
    'sequence',
    'players',
    'winnerId',
    'currentChallenge',
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
    'serverNowMs',
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
      !_isNonNegInt(payload['serverNowMs'])) {
    return const EnvelopeValidation.invalid(
      'challenge.signal timing fields invalid',
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
      case MessageTypes.challengeSubmissionAck:
        return _validateSubmissionAck(payload);
      case MessageTypes.challengeResolved:
        return _validateChallengeResolved(payload);
      case MessageTypes.matchStateChanged:
        return _validateMatchStateChanged(payload);
      case MessageTypes.matchFinished:
        return _validateMatchFinished(payload);
      case MessageTypes.protocolError:
        return _validateProtocolError(payload);
      default:
        return EnvelopeValidation.invalid('unknown event type: $typeStr');
    }
  } catch (e) {
    return EnvelopeValidation.invalid('validation threw: $e');
  }
}
