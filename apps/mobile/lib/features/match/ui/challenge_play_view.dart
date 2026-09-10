import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../engines/challenge_engine.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/hearts_display.dart';

/// Active challenge view: header with hearts + challenge info, engine below.
class ChallengePlayView extends StatefulWidget {
  const ChallengePlayView({
    required this.state,
    required this.engine,
    required this.onSubmit,
    required this.estimateServerNowMs,
    super.key,
  });

  final MatchViewState state;
  final ChallengeEngine engine;
  final void Function(Map<String, dynamic> answer) onSubmit;
  final int Function() estimateServerNowMs;

  @override
  State<ChallengePlayView> createState() => _ChallengePlayViewState();
}

class _ChallengePlayViewState extends State<ChallengePlayView> {
  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final PlayerPublic? local = widget.state.localPlayer;
    final int round = widget.state.roundNumber;
    final PublicChallenge? challenge = widget.state.currentChallenge;

    final Object? categoryValue = challenge?.clientConfig['categoryKey'];
    final String? categoryKey =
        categoryValue is String && categoryValue.trim().isNotEmpty
        ? categoryValue.trim()
        : null;

    final bool reconnecting =
        widget.state.lifecycle == SessionLifecycle.resuming ||
        widget.state.lifecycle == SessionLifecycle.connecting ||
        !widget.state.isConnected;

    final bool inputEnabled =
        widget.state.lifecycle == SessionLifecycle.bound &&
        widget.state.isConnected &&
        !widget.state.isSpectator;

    return Stack(
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: <Widget>[
              const SizedBox(height: 8),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  HeartsDisplay(hearts: local?.hearts ?? 3),
                  const Spacer(),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      Text(
                        resolver.resolve(
                          TranslationKeys.introRound,
                          params: <String, String>{'round': '$round'},
                        ),
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      if (categoryKey != null)
                        Text(
                          resolver.resolve(categoryKey),
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Expanded(
                child: challenge == null
                    ? const SizedBox.shrink()
                    : widget.engine.build(
                        context,
                        ChallengeContext(
                          challenge: challenge,
                          onSubmit: widget.onSubmit,
                          estimateServerNowMs: widget.estimateServerNowMs,
                          answerStatus: widget.state.answerStatus,
                          inputEnabled: inputEnabled,
                        ),
                      ),
              ),
            ],
          ),
        ),
        if (reconnecting)
          Positioned.fill(
            child: ColoredBox(
              color: LhColors.bg.withValues(alpha: 0.72),
              child: Center(
                child: Text(
                  resolver.resolve(TranslationKeys.errorsConnectionFailed),
                  style: Theme.of(context).textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
