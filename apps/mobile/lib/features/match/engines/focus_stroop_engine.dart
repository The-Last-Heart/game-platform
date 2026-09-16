import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class FocusStroopEngine implements ChallengeEngine {
  @override
  String get engineId => 'focus.stroop';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _StroopWidget(challengeContext: challengeContext);
  }
}

class _StroopWidget extends StatefulWidget {
  const _StroopWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_StroopWidget> createState() => _StroopWidgetState();
}

class _StroopWidgetState extends State<_StroopWidget>
    with SingleTickerProviderStateMixin {
  bool _submitted = false;
  int? _pressedIndex;
  late final AnimationController _wordPulse;

  List<String> get _optionKeys {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['optionKeys'];
    if (raw is List) {
      return raw.whereType<String>().toList(growable: false);
    }
    return const <String>['cyan', 'red', 'yellow'];
  }

  @override
  void initState() {
    super.initState();
    _wordPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _wordPulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final String promptKey =
        (cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;
    final String footerKey = (cfg['footerKey'] as String?) ?? '';
    final String wordKey = (cfg['wordKey'] as String?) ?? 'color.red';
    final String inkColorId = (cfg['inkColorId'] as String?) ?? 'cyan';
    final Color inkColor = _stroopColor(inkColorId);
    final List<String> options = _optionKeys;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: LhColors.warning,
          ),
          const SizedBox(height: 18),
          TweenAnimationBuilder<double>(
            tween: Tween<double>(begin: 0, end: 1),
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOut,
            builder: (BuildContext context, double t, Widget? child) {
              return Opacity(opacity: t, child: child);
            },
            child: Text(
              resolver.resolve(promptKey),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 32),
          AnimatedBuilder(
            animation: _wordPulse,
            builder: (BuildContext context, Widget? child) {
              final double scale = 1 + _wordPulse.value * 0.05;
              return Transform.scale(scale: scale, child: child);
            },
            child: TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: 1),
              duration: const Duration(milliseconds: 420),
              curve: Curves.elasticOut,
              builder: (BuildContext context, double t, Widget? child) {
                return Transform.scale(scale: t, child: child);
              },
              child: Text(
                resolver.resolve(wordKey),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.displayLarge?.copyWith(
                  color: inkColor,
                  fontWeight: FontWeight.w800,
                  shadows: <Shadow>[
                    Shadow(
                      color: inkColor.withValues(alpha: 0.45),
                      blurRadius: 18,
                    ),
                  ],
                ),
              ),
            ),
          ),
          const Spacer(),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            alignment: WrapAlignment.center,
            children: <Widget>[
              for (int i = 0; i < options.length; i++)
                TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0, end: 1),
                  duration: Duration(milliseconds: 260 + i * 70),
                  curve: Curves.easeOutBack,
                  builder: (BuildContext context, double t, Widget? child) {
                    return Transform.scale(scale: t, child: child);
                  },
                  child: _StroopOptionChip(
                    label: _stroopLabel(resolver, options[i]),
                    color: _stroopColor(options[i]),
                    pressed: _pressedIndex == i,
                    onTapDown:
                        widget.challengeContext.isInteractionLocked || _submitted
                        ? null
                        : () => setState(() => _pressedIndex = i),
                    onTapUp:
                        widget.challengeContext.isInteractionLocked || _submitted
                        ? null
                        : () {
                            setState(() {
                              _pressedIndex = null;
                              _submitted = true;
                            });
                            widget.challengeContext.onSubmit(
                              <String, dynamic>{
                                'chosenOptionKey': options[i],
                              },
                            );
                          },
                    onTapCancel: () => setState(() => _pressedIndex = null),
                  ),
                ),
            ],
          ),
          const Spacer(),
          if (footerKey.isNotEmpty) ...<Widget>[
            Text(
              resolver.resolve(footerKey),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: LhColors.textMuted,
              ),
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

Color _stroopColor(String id) {
  return switch (id) {
    'cyan' => LhColors.success,
    'red' => LhColors.primary,
    'yellow' => LhColors.warning,
    _ => LhColors.text,
  };
}

String _stroopLabel(TranslationResolver resolver, String id) {
  // Option ids are bare color tokens (cyan/red/yellow). Prefer color.* keys;
  // fall back to the bare id used by older localization packs.
  for (final String key in <String>['color.$id', id]) {
    final String resolved = resolver.resolve(key);
    if (!_isUnavailableLabel(resolved, resolver)) {
      return resolved;
    }
  }
  return id.toUpperCase();
}

bool _isUnavailableLabel(String resolved, TranslationResolver resolver) {
  if (resolved.contains('MISSING') || resolved == '…') {
    return true;
  }
  // Production missing-key fallback is locale copy, not MISSING:…
  final String unavailable = resolver.resolve('errors.content_unavailable');
  return resolved == unavailable;
}

class _StroopOptionChip extends StatelessWidget {
  const _StroopOptionChip({
    required this.label,
    required this.color,
    required this.pressed,
    required this.onTapDown,
    required this.onTapUp,
    required this.onTapCancel,
  });

  final String label;
  final Color color;
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
        scale: pressed ? 0.92 : 1,
        duration: const Duration(milliseconds: 90),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
          decoration: BoxDecoration(
            color: LhColors.elevated,
            borderRadius: LhRadii.pillAll,
            border: Border.all(color: color, width: pressed ? 2.8 : 2),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: color.withValues(alpha: pressed ? 0.5 : 0.28),
                blurRadius: pressed ? 16 : 10,
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 10),
              Text(
                label,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
