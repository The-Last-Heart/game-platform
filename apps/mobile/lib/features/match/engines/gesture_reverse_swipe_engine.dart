import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

class GestureReverseSwipeEngine implements ChallengeEngine {
  @override
  String get engineId => 'gesture.reverse_swipe';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _ReverseSwipeWidget(challengeContext: challengeContext);
  }
}

class _ReverseSwipeWidget extends StatefulWidget {
  const _ReverseSwipeWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_ReverseSwipeWidget> createState() => _ReverseSwipeWidgetState();
}

class _ReverseSwipeWidgetState extends State<_ReverseSwipeWidget> {
  Offset? _start;
  Offset? _last;
  DateTime? _startedAt;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final Map<String, dynamic> cfg =
        widget.challengeContext.challenge.clientConfig;
    final String direction = (cfg['displayedDirection'] as String?) ?? 'right';
    final String promptKey =
        (cfg['promptKey'] as String?) ??
        widget.challengeContext.challenge.promptKey;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onPanStart: widget.challengeContext.isInteractionLocked
          ? null
          : (DragStartDetails d) {
              _start = d.localPosition;
              _last = d.localPosition;
              _startedAt = DateTime.now();
            },
      onPanUpdate: widget.challengeContext.isInteractionLocked
          ? null
          : (DragUpdateDetails d) {
              _last = d.localPosition;
            },
      onPanEnd: widget.challengeContext.isInteractionLocked
          ? null
          : (DragEndDetails d) {
              if (_start == null || _last == null || _startedAt == null) {
                return;
              }
              final Offset delta = _last! - _start!;
              final int durationMs =
                  DateTime.now().difference(_startedAt!).inMilliseconds;
              widget.challengeContext.onSubmit(<String, dynamic>{
                'dx': delta.dx,
                'dy': delta.dy,
                'durationMs': durationMs,
              });
              _start = null;
              _last = null;
              _startedAt = null;
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
            Icon(
              switch (direction) {
                'up' => Icons.arrow_upward,
                'down' => Icons.arrow_downward,
                'left' => Icons.arrow_back,
                _ => Icons.arrow_forward,
              },
              size: 72,
              color: LhColors.success,
            ),
          ],
        ),
      ),
    );
  }
}
