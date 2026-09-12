import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

class TapPrecisionEngine implements ChallengeEngine {
  @override
  String get engineId => 'tap.precision';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _PrecisionTapWidget(challengeContext: challengeContext);
  }
}

class _PrecisionTapWidget extends StatefulWidget {
  const _PrecisionTapWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_PrecisionTapWidget> createState() => _PrecisionTapWidgetState();
}

class _PrecisionTapWidgetState extends State<_PrecisionTapWidget> {
  final List<String> _tapped = <String>[];

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final int attemptCount = (cfg['attemptCount'] as num?)?.toInt() ?? 1;
    final List<dynamic> targets =
        (cfg['targets'] as List<dynamic>?) ?? <dynamic>[];
    final String promptKey =
        (cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        return Stack(
          fit: StackFit.expand,
          children: <Widget>[
            Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  resolver.resolve(promptKey),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
            ),
            for (final dynamic raw in targets)
              if (raw is Map<String, dynamic>)
                Positioned(
                  left:
                      (raw['x'] as num).toDouble() * constraints.maxWidth - 28,
                  top:
                      (raw['y'] as num).toDouble() * constraints.maxHeight - 28,
                  child: Semantics(
                    button: true,
                    label: raw['id'] as String? ?? 'target',
                    child: GestureDetector(
                      onTap: widget.challengeContext.isInteractionLocked
                          ? null
                          : () {
                              final String id = raw['id'] as String;
                              if (_tapped.contains(id)) return;
                              setState(() => _tapped.add(id));
                              if (_tapped.length >= attemptCount) {
                                widget.challengeContext.onSubmit(
                                  <String, dynamic>{
                                    'tappedTargetIds': List<String>.from(
                                      _tapped,
                                    ),
                                  },
                                );
                              }
                            },
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: _tapped.contains(raw['id'])
                              ? LhColors.success
                              : LhColors.success,
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
