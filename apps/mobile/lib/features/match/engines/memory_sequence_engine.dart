import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import 'challenge_engine.dart';

class MemorySequenceEngine implements ChallengeEngine {
  @override
  String get engineId => 'memory.sequence';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _MemorySequenceWidget(challengeContext: challengeContext);
  }
}

class _MemorySequenceWidget extends StatefulWidget {
  const _MemorySequenceWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_MemorySequenceWidget> createState() => _MemorySequenceWidgetState();
}

class _MemorySequenceWidgetState extends State<_MemorySequenceWidget> {
  final List<String> _picked = <String>[];
  int _previewIndex = 0;
  Timer? _previewTimer;

  @override
  void initState() {
    super.initState();
    _maybeStartPreviewTicker();
  }

  @override
  void didUpdateWidget(covariant _MemorySequenceWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    final RoundPhase was = oldWidget.challengeContext.challenge.roundPhase;
    final RoundPhase now = widget.challengeContext.challenge.roundPhase;
    if (was != now) {
      _previewTimer?.cancel();
      _previewIndex = 0;
      _picked.clear();
      _maybeStartPreviewTicker();
    }
  }

  @override
  void dispose() {
    _previewTimer?.cancel();
    super.dispose();
  }

  List<String> get _previewSequence {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['previewSequence'];
    if (raw is List) {
      return raw.whereType<String>().toList();
    }
    return const <String>[];
  }

  List<String> get _options {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['optionKeys'];
    if (raw is List) {
      return raw.whereType<String>().toList();
    }
    return const <String>[];
  }

  int get _requiredLength {
    final int fromPreview = _previewSequence.length;
    if (fromPreview > 0) return fromPreview;
    return 3;
  }

  void _maybeStartPreviewTicker() {
    if (widget.challengeContext.challenge.roundPhase != RoundPhase.preview) {
      return;
    }
    final List<String> sequence = _previewSequence;
    if (sequence.isEmpty) return;
    final num? previewMsRaw =
        widget.challengeContext.challenge.clientConfig['previewMs'] as num?;
    final int previewMs = previewMsRaw?.toInt() ?? 1500;
    final int stepMs = (previewMs / sequence.length).floor().clamp(250, 2000);
    _previewTimer = Timer.periodic(Duration(milliseconds: stepMs), (Timer t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() {
        _previewIndex = (_previewIndex + 1) % sequence.length;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final PublicChallenge challenge = widget.challengeContext.challenge;
    final Map<String, dynamic> cfg = challenge.clientConfig;
    final bool preview = challenge.roundPhase == RoundPhase.preview;
    final String promptKey =
        (cfg['promptKey'] as String?) ?? challenge.promptKey;
    final List<String> sequence = _previewSequence;
    final List<String> options = _options;

    return Column(
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            preview
                ? resolver.resolve('challenge.memory.preview')
                : resolver.resolve(promptKey),
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
        ),
        if (preview)
          Expanded(
            child: Center(
              child: sequence.isEmpty
                  ? Text(
                      resolver.resolve('challenge.memory.preview'),
                      style: Theme.of(context).textTheme.headlineSmall,
                    )
                  : AnimatedSwitcher(
                      duration: const Duration(milliseconds: 200),
                      child: Container(
                        key: ValueKey<String>(
                          '${sequence[_previewIndex % sequence.length]}-$_previewIndex',
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 28,
                          vertical: 20,
                        ),
                        decoration: BoxDecoration(
                          color: LhColors.success.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: LhColors.success, width: 2),
                        ),
                        child: Text(
                          resolver.resolve(
                            sequence[_previewIndex % sequence.length],
                          ),
                          style: Theme.of(context).textTheme.headlineMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
            ),
          )
        else
          Expanded(
            child: Wrap(
              spacing: 12,
              runSpacing: 12,
              alignment: WrapAlignment.center,
              children: <Widget>[
                for (int i = 0; i < options.length; i++)
                  Semantics(
                    button: true,
                    label: options[i],
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _picked.contains(options[i])
                            ? LhColors.success
                            : LhColors.surface,
                      ),
                      onPressed: widget.challengeContext.isInteractionLocked
                          ? null
                          : () {
                              setState(() => _picked.add(options[i]));
                              if (_picked.length >= _requiredLength) {
                                widget.challengeContext.onSubmit(
                                  <String, dynamic>{
                                    'sequence': List<String>.from(_picked),
                                  },
                                );
                              }
                            },
                      child: Text(resolver.resolve(options[i])),
                    ),
                  ),
              ],
            ),
          ),
        if (!preview && _picked.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text('${_picked.length} / $_requiredLength'),
          ),
      ],
    );
  }
}
