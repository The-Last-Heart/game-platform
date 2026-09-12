import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

/// Do not touch the marked zone until the deadline.
class TrapNoTouchEngine implements ChallengeEngine {
  @override
  String get engineId => 'trap.no_touch';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _TrapNoTouchWidget(challengeContext: challengeContext);
  }
}

class _TrapNoTouchWidget extends StatelessWidget {
  const _TrapNoTouchWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg = challengeContext.challenge.clientConfig;
    final String promptKey =
        (cfg['promptKey'] as String?) ?? challengeContext.challenge.promptKey;
    final Map<String, dynamic> zone =
        (cfg['zone'] as Map<String, dynamic>?) ??
        <String, dynamic>{'x': 0.25, 'y': 0.3, 'width': 0.5, 'height': 0.4};

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double left = (zone['x'] as num).toDouble() * constraints.maxWidth;
        final double top =
            (zone['y'] as num).toDouble() * constraints.maxHeight;
        final double width =
            (zone['width'] as num).toDouble() * constraints.maxWidth;
        final double height =
            (zone['height'] as num).toDouble() * constraints.maxHeight;

        return Stack(
          fit: StackFit.expand,
          children: <Widget>[
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  resolver.resolve(promptKey),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ),
            Positioned(
              left: left,
              top: top,
              width: width,
              height: height,
              child: Semantics(
                label: resolver.resolve(
                  (cfg['zoneHintKey'] as String?) ?? promptKey,
                ),
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTapDown: challengeContext.isInteractionLocked
                      ? null
                      : (_) {
                          challengeContext.onSubmit(<String, dynamic>{
                            'touched': true,
                          });
                        },
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: LhColors.primary.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: LhColors.primary, width: 2),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
