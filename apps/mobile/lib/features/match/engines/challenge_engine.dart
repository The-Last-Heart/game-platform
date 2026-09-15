import 'package:flutter/widgets.dart';

import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';

/// Data passed to challenge engines for rendering.
class ChallengeContext {
  const ChallengeContext({
    required this.challenge,
    required this.onSubmit,
    required this.estimateServerNowMs,
    required this.answerStatus,
    required this.inputEnabled,
    this.localPlayerId,
    this.players = const <PlayerPublic>[],
  });

  /// The public challenge state (definition fields + roundPhase + signal).
  final PublicChallenge challenge;

  /// Callback to submit an answer. The engine should pass the answer map.
  final void Function(Map<String, dynamic> answer) onSubmit;

  /// Server-time estimate (monotonic-anchored). Never use DateTime.now().
  final int Function() estimateServerNowMs;

  /// Authoritative submission status from the session controller.
  final AnswerSubmissionStatus answerStatus;

  /// Whether taps may be forwarded to [onSubmit].
  final bool inputEnabled;

  /// Local seat id when known (pair sync partner labels).
  final String? localPlayerId;

  /// Current match roster for partner display names / avatars.
  final List<PlayerPublic> players;

  bool get isInteractionLocked =>
      !inputEnabled ||
      answerStatus == AnswerSubmissionStatus.pending ||
      answerStatus == AnswerSubmissionStatus.confirmed;
}

/// Abstract challenge engine that renders challenge-specific UI.
///
/// Engines receive only public challenge data — never serverConfig.
abstract class ChallengeEngine {
  /// The unique engine identifier (matches server-side engineId).
  String get engineId;

  /// Build the challenge widget for the given context.
  Widget build(BuildContext context, ChallengeContext challengeContext);
}
