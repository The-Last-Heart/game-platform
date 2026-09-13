import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

class TacticalRiskChoiceEngine implements ChallengeEngine {
  @override
  String get engineId => 'tactical.risk_choice';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _RiskChoiceWidget(challengeContext: challengeContext);
  }
}

class _RiskChoiceWidget extends StatefulWidget {
  const _RiskChoiceWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_RiskChoiceWidget> createState() => _RiskChoiceWidgetState();
}

class _RiskChoiceWidgetState extends State<_RiskChoiceWidget> {
  bool _submitted = false;

  List<String> get _options {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['optionKeys'];
    if (raw is List) {
      return raw.whereType<String>().toList();
    }
    return const <String>['option.safe', 'option.risky'];
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String promptKey =
        (widget.challengeContext.challenge.clientConfig['promptKey']
            as String?) ??
        widget.challengeContext.challenge.promptKey;
    final List<String> options = _options;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(
              resolver.resolve(promptKey),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 24),
            for (int i = 0; i < options.length; i++) ...<Widget>[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: i == 0
                        ? LhColors.success
                        : LhColors.success,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 18),
                  ),
                  onPressed:
                      widget.challengeContext.isInteractionLocked || _submitted
                      ? null
                      : () {
                          setState(() => _submitted = true);
                          widget.challengeContext.onSubmit(<String, dynamic>{
                            'chosenOptionKey': options[i],
                          });
                        },
                  child: Text(
                    resolver.resolve(options[i]),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ],
        ),
      ),
    );
  }
}
