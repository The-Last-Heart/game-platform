import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class SearchSelectOccurrencesEngine implements ChallengeEngine {
  @override
  String get engineId => 'search.select_occurrences';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _SearchSelectWidget(challengeContext: challengeContext);
  }
}

class _SearchSelectWidget extends StatefulWidget {
  const _SearchSelectWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_SearchSelectWidget> createState() => _SearchSelectWidgetState();
}

class _SearchSelectWidgetState extends State<_SearchSelectWidget> {
  final Set<int> _selected = <int>{};
  bool _submitted = false;
  int? _wrongFlash;

  int get _columns {
    final num? v =
        widget.challengeContext.challenge.clientConfig['columns'] as num?;
    return v?.toInt().clamp(2, 6) ?? 4;
  }

  List<String> get _cells {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['cells'];
    if (raw is List) {
      return raw.map((Object? v) => v.toString()).toList(growable: false);
    }
    return const <String>[];
  }

  String get _targetValue {
    final Object? v =
        widget.challengeContext.challenge.clientConfig['targetValue'];
    return v?.toString() ?? '';
  }

  int get _requiredCount =>
      _cells.where((String c) => c == _targetValue).length;

  void _submit(List<int> indices) {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    _submitted = true;
    widget.challengeContext.onSubmit(<String, dynamic>{
      'selectedIndices': indices,
    });
  }

  void _onCellTap(int index) {
    if (widget.challengeContext.isInteractionLocked ||
        _submitted ||
        _selected.contains(index)) {
      return;
    }
    final String value = _cells[index];
    if (value != _targetValue) {
      setState(() => _wrongFlash = index);
      Future<void>.delayed(const Duration(milliseconds: 120), () {
        if (!mounted) return;
        _submit(<int>[..._selected, index]);
      });
      return;
    }
    setState(() => _selected.add(index));
    if (_selected.length >= _requiredCount) {
      Future<void>.delayed(const Duration(milliseconds: 160), () {
        if (!mounted) return;
        _submit(_selected.toList()..sort());
      });
    }
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
    final List<String> cells = _cells;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            ringColor: LhColors.success,
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
              resolver.resolve(
                promptKey,
                params: <String, String>{'value': _targetValue},
              ),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            children: <Widget>[
              for (int i = 0; i < _requiredCount; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: 28,
                  height: 10,
                  decoration: BoxDecoration(
                    color: i < _selected.length
                        ? LhColors.success
                        : LhColors.elevated,
                    borderRadius: LhRadii.pillAll,
                    border: Border.all(
                      color: i < _selected.length
                          ? LhColors.success
                          : LhColors.border,
                    ),
                    boxShadow: i < _selected.length
                        ? <BoxShadow>[
                            BoxShadow(
                              color: LhColors.success.withValues(alpha: 0.4),
                              blurRadius: 8,
                            ),
                          ]
                        : null,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: GridView.builder(
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: _columns,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
              ),
              itemCount: cells.length,
              itemBuilder: (BuildContext context, int index) {
                final bool picked = _selected.contains(index);
                final bool wrong = _wrongFlash == index;
                return TweenAnimationBuilder<double>(
                  tween: Tween<double>(begin: 0, end: 1),
                  duration: Duration(milliseconds: 220 + (index % _columns) * 40),
                  curve: Curves.easeOutBack,
                  builder: (BuildContext context, double t, Widget? child) {
                    return Transform.scale(scale: t, child: child);
                  },
                  child: GestureDetector(
                    onTap: () => _onCellTap(index),
                    child: AnimatedScale(
                      scale: picked ? 0.94 : 1,
                      duration: const Duration(milliseconds: 120),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 140),
                        decoration: BoxDecoration(
                          color: wrong
                              ? LhColors.primary.withValues(alpha: 0.35)
                              : picked
                              ? LhColors.success.withValues(alpha: 0.22)
                              : LhColors.elevated,
                          borderRadius: LhRadii.smAll,
                          border: Border.all(
                            color: wrong
                                ? LhColors.primary
                                : picked
                                ? LhColors.success
                                : LhColors.border,
                            width: picked || wrong ? 2.2 : 1.4,
                          ),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          cells[index],
                          style: Theme.of(context).textTheme.titleLarge
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
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
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: LhColors.textMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
