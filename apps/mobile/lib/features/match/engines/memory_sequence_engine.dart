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

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final PublicChallenge challenge = widget.challengeContext.challenge;
    final Map<String, dynamic> cfg = challenge.clientConfig;
    final List<String> options =
        ((cfg['optionKeys'] as List<dynamic>?) ?? <dynamic>[])
            .whereType<String>()
            .toList();
    final bool preview = challenge.roundPhase == RoundPhase.preview;
    final String promptKey =
        (cfg['promptKey'] as String?) ?? challenge.promptKey;

    return Column(
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            resolver.resolve(promptKey),
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
        ),
        if (preview)
          Expanded(
            child: Center(
              child: Text(
                resolver.resolve('challenge.memory.preview'),
                style: Theme.of(context).textTheme.headlineSmall,
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
                for (final String key in options)
                  Semantics(
                    button: true,
                    label: key,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _picked.contains(key)
                            ? LhColors.success
                            : LhColors.surface,
                      ),
                      onPressed: widget.challengeContext.isInteractionLocked
                          ? null
                          : () {
                              setState(() => _picked.add(key));
                              // Submit when player has picked 3 (matches seed sequence length).
                              if (_picked.length >= 3) {
                                widget.challengeContext.onSubmit(
                                  <String, dynamic>{
                                    'sequence': List<String>.from(_picked),
                                  },
                                );
                              }
                            },
                      child: Text(resolver.resolve(key)),
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
