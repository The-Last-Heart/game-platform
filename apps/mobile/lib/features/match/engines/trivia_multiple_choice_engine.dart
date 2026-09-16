import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class TriviaMultipleChoiceEngine implements ChallengeEngine {
  @override
  String get engineId => 'trivia.multiple_choice';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _TriviaMultipleChoiceWidget(challengeContext: challengeContext);
  }
}

class _TriviaMultipleChoiceWidget extends StatefulWidget {
  const _TriviaMultipleChoiceWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_TriviaMultipleChoiceWidget> createState() =>
      _TriviaMultipleChoiceWidgetState();
}

class _TriviaMultipleChoiceWidgetState
    extends State<_TriviaMultipleChoiceWidget> {
  bool _submitted = false;
  int? _pressedIndex;

  List<String> get _optionKeys {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['optionKeys'];
    if (raw is List) {
      return raw.whereType<String>().toList(growable: false);
    }
    return const <String>[];
  }

  Object? _optionText(Map<String, dynamic> cfg, String key) {
    final Object? raw = cfg['optionTexts'];
    if (raw is Map) {
      return raw[key];
    }
    return null;
  }

  String _resolvedText(
    TranslationResolver resolver,
    String key,
    Object? pinned,
  ) {
    if (pinned is String && pinned.trim().isNotEmpty) {
      return pinned;
    }
    if (key.isEmpty) {
      return '';
    }
    return resolver.resolve(key);
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final String questionKey =
        (cfg['questionKey'] as String?) ?? cfg['promptKey'] as String? ?? '';
    final String footerKey = (cfg['footerKey'] as String?) ?? '';
    final List<String> options = _optionKeys;
    final String questionText = _resolvedText(
      resolver,
      questionKey,
      cfg['questionText'],
    );

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: LhColors.primary,
          ),
          const SizedBox(height: 18),
          TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: 1),
            duration: const Duration(milliseconds: 320),
            curve: Curves.easeOut,
            builder: (BuildContext context, double t, Widget? child) {
              return Opacity(
                opacity: t,
                child: Transform.translate(
                  offset: Offset(0, (1 - t) * 10),
                  child: child,
                ),
              );
            },
            child: Text(
              questionText,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: 24),
          Expanded(
            child: GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 1.55,
              ),
              itemCount: options.length,
              itemBuilder: (BuildContext context, int index) {
                return TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0, end: 1),
                  duration: Duration(milliseconds: 280 + index * 60),
                  curve: Curves.easeOutBack,
                  builder: (BuildContext context, double t, Widget? child) {
                    return Transform.scale(scale: t, child: child);
                  },
                  child: _OptionButton(
                    label: _resolvedText(
                      resolver,
                      options[index],
                      _optionText(cfg, options[index]),
                    ),
                    pressed: _pressedIndex == index,
                    onTapDown:
                        widget.challengeContext.isInteractionLocked ||
                            _submitted
                        ? null
                        : () => setState(() => _pressedIndex = index),
                    onTapUp:
                        widget.challengeContext.isInteractionLocked ||
                            _submitted
                        ? null
                        : () {
                            setState(() {
                              _pressedIndex = null;
                              _submitted = true;
                            });
                            widget.challengeContext.onSubmit(<String, dynamic>{
                              'chosenOptionKey': options[index],
                            });
                          },
                    onTapCancel: () => setState(() => _pressedIndex = null),
                  ),
                );
              },
            ),
          ),
          if (footerKey.isNotEmpty) ...<Widget>[
            const SizedBox(height: 8),
            Text(
              resolver.resolve(footerKey),
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: LhColors.textMuted),
            ),
          ],
        ],
      ),
    );
  }
}

class _OptionButton extends StatelessWidget {
  const _OptionButton({
    required this.label,
    required this.pressed,
    required this.onTapDown,
    required this.onTapUp,
    required this.onTapCancel,
  });

  final String label;
  final bool pressed;
  final VoidCallback? onTapDown;
  final VoidCallback? onTapUp;
  final VoidCallback onTapCancel;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: onTapDown == null ? null : (_) => onTapDown!(),
      onTapUp: onTapUp == null ? null : (_) => onTapUp!(),
      onTapCancel: onTapCancel,
      child: AnimatedScale(
        scale: pressed ? 0.94 : 1,
        duration: const Duration(milliseconds: 90),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          decoration: BoxDecoration(
            color: pressed ? LhColors.elevated : LhColors.surface,
            borderRadius: LhRadii.mdAll,
            border: Border.all(
              color: pressed ? LhColors.primary : LhColors.border,
              width: pressed ? 2.4 : 1.6,
            ),
            boxShadow: pressed
                ? <BoxShadow>[
                    BoxShadow(
                      color: LhColors.primary.withValues(alpha: 0.35),
                      blurRadius: 14,
                    ),
                  ]
                : null,
          ),
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ),
    );
  }
}
