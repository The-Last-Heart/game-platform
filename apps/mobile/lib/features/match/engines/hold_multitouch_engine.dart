import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
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

class _HoldMultitouchWidgetState extends State<_HoldMultitouchWidget> {
  final Set<int> _pointers = <int>{};
  DateTime? _holdStarted;
  double _progress = 0;
  bool _submitted = false;

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

  void _tick() {
    if (_submitted || widget.challengeContext.isInteractionLocked) return;
    if (_pointers.length < _required) {
      _holdStarted = null;
      if (_progress != 0) {
        setState(() => _progress = 0);
      }
      widget.challengeContext.onSubmit(<String, dynamic>{
        'contacts': _pointers.length,
        'heldMs': 0,
        'final': false,
      });
      return;
    }
    _holdStarted ??= DateTime.now();
    final int held = DateTime.now().difference(_holdStarted!).inMilliseconds;
    setState(() => _progress = (held / _holdMs).clamp(0, 1));
    if (held >= _holdMs) {
      _submitted = true;
      widget.challengeContext.onSubmit(<String, dynamic>{
        'contacts': _pointers.length,
        'heldMs': held,
        'final': true,
      });
    } else {
      widget.challengeContext.onSubmit(<String, dynamic>{
        'contacts': _pointers.length,
        'heldMs': held,
        'final': false,
      });
      Future<void>.delayed(const Duration(milliseconds: 50), _tick);
    }
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String promptKey =
        (widget.challengeContext.challenge.clientConfig['promptKey']
            as String?) ??
        widget.challengeContext.challenge.promptKey;

    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (PointerDownEvent e) {
        if (widget.challengeContext.isInteractionLocked) return;
        _pointers.add(e.pointer);
        _tick();
      },
      onPointerUp: (PointerUpEvent e) {
        _pointers.remove(e.pointer);
        _tick();
      },
      onPointerCancel: (PointerCancelEvent e) {
        _pointers.remove(e.pointer);
        _tick();
      },
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              resolver.resolve(promptKey),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: 180,
              child: LinearProgressIndicator(
                value: _progress,
                minHeight: 12,
                color: LhColors.success,
              ),
            ),
            const SizedBox(height: 12),
            Text('${_pointers.length} / $_required'),
          ],
        ),
      ),
    );
  }
}
