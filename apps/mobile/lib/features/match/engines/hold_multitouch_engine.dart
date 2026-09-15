import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class HoldMultitouchEngine implements ChallengeEngine {
  @override
  String get engineId => 'hold.multitouch';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _HoldMultitouchWidget(challengeContext: challengeContext);
  }
}

class _HoldMultitouchWidget extends StatefulWidget {
  const _HoldMultitouchWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_HoldMultitouchWidget> createState() => _HoldMultitouchWidgetState();
}

class _HoldMultitouchWidgetState extends State<_HoldMultitouchWidget>
    with SingleTickerProviderStateMixin {
  final Set<int> _pointers = <int>{};
  final Map<int, int> _padPointers = <int, int>{};
  bool _submitted = false;
  DateTime _lastProgressEmit = DateTime.fromMillisecondsSinceEpoch(0);

  late final AnimationController _fill;

  int get _required {
    final num? v =
        widget.challengeContext.challenge.clientConfig['requiredContacts']
            as num?;
    return v?.toInt() ?? 2;
  }

  int get _holdMs {
    final num? v =
        widget.challengeContext.challenge.clientConfig['holdMs'] as num?;
    return v?.toInt() ?? 1500;
  }

  bool get _pad0Active => _padPointers.containsKey(0);
  bool get _pad1Active => _padPointers.containsKey(1);
  bool get _bothHeld => _pad0Active && _pad1Active;

  @override
  void initState() {
    super.initState();
    _fill = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: _holdMs),
    );
    _fill.addStatusListener((AnimationStatus status) {
      if (status == AnimationStatus.completed) {
        _completeHold();
      }
    });
  }

  @override
  void didUpdateWidget(covariant _HoldMultitouchWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    final Duration next = Duration(milliseconds: _holdMs);
    if (_fill.duration != next) {
      _fill.duration = next;
    }
  }

  @override
  void dispose() {
    _fill.dispose();
    super.dispose();
  }

  void _completeHold() {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    _submitted = true;
    try {
      HapticFeedback.mediumImpact();
    } catch (_) {}
    widget.challengeContext.onSubmit(<String, dynamic>{
      'contacts': _pointers.length.clamp(_required, 10),
      'heldMs': _holdMs,
      'final': true,
    });
  }

  void _emitProgress({required int contacts, required int heldMs}) {
    final DateTime now = DateTime.now();
    if (now.difference(_lastProgressEmit) < const Duration(milliseconds: 120)) {
      return;
    }
    _lastProgressEmit = now;
    widget.challengeContext.onSubmit(<String, dynamic>{
      'contacts': contacts,
      'heldMs': heldMs,
      'final': false,
    });
  }

  void _syncFill() {
    if (_submitted || widget.challengeContext.isInteractionLocked) {
      _fill.stop();
      return;
    }
    if (_bothHeld) {
      if (!_fill.isAnimating && _fill.value < 1) {
        unawaited(_fill.forward());
      }
      _emitProgress(
        contacts: _pointers.length,
        heldMs: (_fill.value * _holdMs).round(),
      );
      return;
    }
    if (_fill.value != 0 || _fill.isAnimating) {
      _fill.stop();
      _fill.value = 0;
    }
    _emitProgress(contacts: _pointers.length, heldMs: 0);
  }

  void _onPadDown(int padIndex, int pointer) {
    if (widget.challengeContext.isInteractionLocked || _submitted) return;
    if (_padPointers.containsKey(padIndex)) return;
    setState(() {
      _padPointers[padIndex] = pointer;
      _pointers.add(pointer);
    });
    _syncFill();
  }

  void _onPadUp(int pointer) {
    if (!_pointers.contains(pointer) &&
        !_padPointers.values.contains(pointer)) {
      return;
    }
    setState(() {
      _pointers.remove(pointer);
      _padPointers.removeWhere((_, int p) => p == pointer);
    });
    _syncFill();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String promptKey =
        (widget.challengeContext.challenge.clientConfig['promptKey']
            as String?) ??
        widget.challengeContext.challenge.promptKey;

    // Match reference: compact tombstone pads (not full-height columns).
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 36, 20, 16),
      child: Column(
        children: <Widget>[
          ChallengeCountdown(
            challenge: widget.challengeContext.challenge,
            estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
            size: 132,
            ringColor: LhColors.success,
            glow: true,
          ),
          const SizedBox(height: 18),
          Text(
            resolver.resolve(promptKey),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const Spacer(flex: 2),
          SizedBox(
            height: 210,
            child: Row(
              children: <Widget>[
                Expanded(child: _buildPad(padIndex: 0, active: _pad0Active)),
                const SizedBox(width: 18),
                Expanded(child: _buildPad(padIndex: 1, active: _pad1Active)),
              ],
            ),
          ),
          const Spacer(flex: 3),
          AnimatedBuilder(
            animation: _fill,
            builder: (BuildContext context, Widget? child) {
              return _HoldProgressBar(value: _fill.value);
            },
          ),
          const SizedBox(height: 12),
          Text(
            resolver.resolve('challenge.hold.do_not_lift'),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: LhColors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }

  Widget _buildPad({required int padIndex, required bool active}) {
    const Color padFill = Color(0xFF071018);
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (PointerDownEvent e) => _onPadDown(padIndex, e.pointer),
      onPointerUp: (PointerUpEvent e) => _onPadUp(e.pointer),
      onPointerCancel: (PointerCancelEvent e) => _onPadUp(e.pointer),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        decoration: BoxDecoration(
          color: padFill,
          borderRadius: BorderRadius.circular(48),
          border: Border.all(
            color: LhColors.success,
            width: active ? 3.2 : 2.4,
          ),
          boxShadow: <BoxShadow>[
            BoxShadow(
              color: LhColors.success.withValues(alpha: active ? 0.55 : 0.32),
              blurRadius: active ? 24 : 16,
              spreadRadius: active ? 1.5 : 0.5,
            ),
          ],
        ),
        child: Center(
          child: AnimatedScale(
            scale: active ? 1.08 : 1,
            duration: const Duration(milliseconds: 120),
            child: Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: LhColors.success, width: 2.5),
                boxShadow: active
                    ? <BoxShadow>[
                        BoxShadow(
                          color: LhColors.success.withValues(alpha: 0.5),
                          blurRadius: 12,
                        ),
                      ]
                    : null,
              ),
              child: Center(
                child: Container(
                  width: 16,
                  height: 16,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: LhColors.success,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Cyan hold meter — fills smoothly with the AnimationController.
class _HoldProgressBar extends StatelessWidget {
  const _HoldProgressBar({required this.value});

  final double value;

  @override
  Widget build(BuildContext context) {
    final double clamped = value.clamp(0.0, 1.0);
    return Container(
      height: 18,
      decoration: BoxDecoration(
        color: LhColors.elevated,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: LhColors.success.withValues(alpha: 0.65),
          width: 1.5,
        ),
        boxShadow: clamped > 0.02
            ? <BoxShadow>[
                BoxShadow(
                  color: LhColors.success.withValues(alpha: 0.28),
                  blurRadius: 10,
                ),
              ]
            : null,
      ),
      clipBehavior: Clip.antiAlias,
      child: Align(
        alignment: Alignment.centerLeft,
        child: FractionallySizedBox(
          widthFactor: clamped,
          heightFactor: 1,
          child: const ColoredBox(color: LhColors.success),
        ),
      ),
    );
  }
}
