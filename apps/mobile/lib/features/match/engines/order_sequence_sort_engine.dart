import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class OrderSequenceSortEngine implements ChallengeEngine {
  @override
  String get engineId => 'order.sequence_sort';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _SequenceSortWidget(challengeContext: challengeContext);
  }
}

class _SequenceSortWidget extends StatefulWidget {
  const _SequenceSortWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_SequenceSortWidget> createState() => _SequenceSortWidgetState();
}

class _SequenceSortWidgetState extends State<_SequenceSortWidget> {
  late List<String?> _slots;
  late List<String> _pool;
  bool _submitted = false;
  int? _draggingFromSlot;
  String? _draggingKey;
  String? _selectedKey;
  Timer? _autoSubmitTimer;

  @override
  void initState() {
    super.initState();
    _resetFromConfig();
  }

  @override
  void dispose() {
    _autoSubmitTimer?.cancel();
    super.dispose();
  }

  void _resetFromConfig() {
    final List<String> items = _itemKeys;
    _slots = List<String?>.filled(items.length, null);
    _pool = List<String>.from(items);
  }

  List<String> get _itemKeys {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['itemKeys'];
    if (raw is List) {
      return raw.whereType<String>().toList(growable: false);
    }
    return const <String>[];
  }

  bool get _ascending {
    final Object? v =
        widget.challengeContext.challenge.clientConfig['ascending'];
    return v is! bool || v;
  }

  bool get _allFilled => _slots.every((String? s) => s != null);

  void _clearDragState() {
    _draggingKey = null;
    _draggingFromSlot = null;
  }

  void _scheduleAutoSubmit() {
    _autoSubmitTimer?.cancel();
    if (!_allFilled || _submitted) return;
    _autoSubmitTimer = Timer(const Duration(milliseconds: 450), () {
      if (mounted && _allFilled && !_submitted) {
        _submit();
      }
    });
  }

  void _placeInSlot(int slotIndex, String key, {int? fromSlot}) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    setState(() {
      final int? sourceSlot = fromSlot ?? _draggingFromSlot;
      final String? displaced = _slots[slotIndex];

      if (sourceSlot != null) {
        if (sourceSlot == slotIndex) {
          _clearDragState();
          return;
        }
        _slots[sourceSlot] = displaced;
      } else {
        _pool.remove(key);
        if (displaced != null && !_pool.contains(displaced)) {
          _pool.add(displaced);
        }
      }

      _slots[slotIndex] = key;
      _selectedKey = null;
      _clearDragState();
    });
    _scheduleAutoSubmit();
  }

  void _returnToPool(String key, {int? fromSlot}) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    setState(() {
      if (fromSlot != null) {
        _slots[fromSlot] = null;
      }
      if (!_pool.contains(key)) {
        _pool.add(key);
      }
      if (_selectedKey == key) {
        _selectedKey = null;
      }
      _clearDragState();
    });
    _autoSubmitTimer?.cancel();
  }

  void _selectFromPool(String key) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    setState(() {
      if (_selectedKey == key) {
        _selectedKey = null;
      } else {
        _selectedKey = key;
      }
      _clearDragState();
    });
  }

  void _onSlotTap(int slotIndex) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    if (_selectedKey != null) {
      _placeInSlot(slotIndex, _selectedKey!);
      return;
    }
    final String? key = _slots[slotIndex];
    if (key != null) {
      _returnToPool(key, fromSlot: slotIndex);
    }
  }

  void _submit() {
    if (!_allFilled ||
        widget.challengeContext.isInteractionLocked ||
        _submitted) {
      return;
    }
    _autoSubmitTimer?.cancel();
    setState(() => _submitted = true);
    widget.challengeContext.onSubmit(<String, dynamic>{
      'orderedKeys': _slots.cast<String>(),
    });
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
            child: Column(
              children: <Widget>[
                Text(
                  resolver.resolve(promptKey),
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  _ascending ? '↑' : '↓',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: LhColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: <Widget>[
              for (int i = 0; i < _slots.length; i++)
                Expanded(
                  child: Padding(
                    padding: EdgeInsetsDirectional.only(
                      end: i < _slots.length - 1 ? 8 : 0,
                    ),
                    child: TweenAnimationBuilder<double>(
                      tween: Tween<double>(begin: 0, end: 1),
                      duration: Duration(milliseconds: 280 + i * 60),
                      curve: Curves.easeOutBack,
                      builder: (BuildContext context, double t, Widget? child) {
                        return Transform.scale(scale: t, child: child);
                      },
                      child: DragTarget<String>(
                        onWillAcceptWithDetails: (_) =>
                            !widget.challengeContext.isInteractionLocked &&
                            !_submitted,
                        onAcceptWithDetails: (DragTargetDetails<String> d) {
                          _placeInSlot(i, d.data);
                        },
                        builder: (
                          BuildContext context,
                          List<String?> candidate,
                          List<dynamic> rejected,
                        ) {
                          final bool hover = candidate.isNotEmpty;
                          final String? key = _slots[i];
                          final bool showChip =
                              key != null &&
                              !(_draggingFromSlot == i && _draggingKey == key);
                          return GestureDetector(
                            onTap: () => _onSlotTap(i),
                            child: AnimatedScale(
                              scale: hover ? 1.04 : 1.0,
                              duration: const Duration(milliseconds: 140),
                              curve: Curves.easeOutBack,
                              child: AnimatedContainer(
                              duration: const Duration(milliseconds: 140),
                              height: 72,
                              decoration: BoxDecoration(
                                color: hover
                                    ? LhColors.success.withValues(alpha: 0.12)
                                    : LhColors.elevated,
                                borderRadius: LhRadii.mdAll,
                                border: Border.all(
                                  color: hover
                                      ? LhColors.success
                                      : key != null
                                      ? LhColors.success.withValues(alpha: 0.6)
                                      : LhColors.border,
                                  width: hover ? 2.4 : 1.6,
                                ),
                              ),
                              child: showChip
                                  ? Draggable<String>(
                                      data: key,
                                      feedback: Material(
                                        color: Colors.transparent,
                                        child: _SortChip(
                                          label: resolver.resolve(key),
                                          elevated: true,
                                        ),
                                      ),
                                      onDragStarted: () => setState(() {
                                        _draggingFromSlot = i;
                                        _draggingKey = key;
                                        _selectedKey = null;
                                      }),
                                      onDragEnd: (DraggableDetails details) {
                                        setState(() {
                                          if (_draggingFromSlot == i &&
                                              _slots[i] == null) {
                                            _returnToPool(key, fromSlot: i);
                                          }
                                          _clearDragState();
                                        });
                                      },
                                      childWhenDragging:
                                          const SizedBox.shrink(),
                                      child: _SortChip(
                                        label: resolver.resolve(key),
                                      ),
                                    )
                                  : Center(
                                      child: Text(
                                        '${i + 1}',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodyMedium
                                            ?.copyWith(
                                              color: LhColors.textMuted,
                                            ),
                                      ),
                                    ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 24),
          Expanded(
            child: Wrap(
              spacing: 10,
              runSpacing: 10,
              alignment: WrapAlignment.center,
              children: <Widget>[
                for (int i = 0; i < _pool.length; i++)
                  if (_pool[i] != _draggingKey || _draggingFromSlot != null)
                    TweenAnimationBuilder<double>(
                      tween: Tween<double>(begin: 0, end: 1),
                      duration: Duration(milliseconds: 300 + i * 50),
                      curve: Curves.easeOutBack,
                      builder: (BuildContext context, double t, Widget? child) {
                        return Transform.scale(scale: t, child: child);
                      },
                      child: Draggable<String>(
                        data: _pool[i],
                        feedback: Material(
                          color: Colors.transparent,
                          child: _SortChip(
                            label: resolver.resolve(_pool[i]),
                            elevated: true,
                          ),
                        ),
                        onDragStarted: () => setState(() {
                          _draggingKey = _pool[i];
                          _draggingFromSlot = null;
                          _selectedKey = null;
                        }),
                        onDragEnd: (_) =>
                            setState(_clearDragState),
                        childWhenDragging: Opacity(
                          opacity: 0.35,
                          child: _SortChip(
                            label: resolver.resolve(_pool[i]),
                          ),
                        ),
                        child: _SortChip(
                          label: resolver.resolve(_pool[i]),
                          selected: _selectedKey == _pool[i],
                          onTap: () => _selectFromPool(_pool[i]),
                        ),
                      ),
                    ),
              ],
            ),
          ),
          AnimatedOpacity(
            opacity: _allFilled ? 1 : 0,
            duration: const Duration(milliseconds: 200),
            child: SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _allFilled &&
                        !widget.challengeContext.isInteractionLocked &&
                        !_submitted
                    ? _submit
                    : null,
                style: FilledButton.styleFrom(
                  backgroundColor: LhColors.success,
                  foregroundColor: LhColors.bg,
                ),
                child: Text(resolver.resolve('challenge.order.footer')),
              ),
            ),
          ),
          if (footerKey.isNotEmpty && !_allFilled) ...<Widget>[
            const SizedBox(height: 10),
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

class _SortChip extends StatelessWidget {
  const _SortChip({
    required this.label,
    this.elevated = false,
    this.selected = false,
    this.onTap,
  });

  final String label;
  final bool elevated;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: selected
              ? LhColors.success.withValues(alpha: 0.18)
              : elevated
              ? LhColors.surface
              : LhColors.elevated,
          borderRadius: LhRadii.mdAll,
          border: Border.all(
            color: selected
                ? LhColors.success
                : LhColors.success.withValues(alpha: 0.7),
            width: selected ? 2.2 : 1.4,
          ),
          boxShadow: elevated
              ? <BoxShadow>[
                  BoxShadow(
                    color: LhColors.success.withValues(alpha: 0.35),
                    blurRadius: 16,
                  ),
                ]
              : null,
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}
