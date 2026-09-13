import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import 'challenge_engine.dart';

class SocialPairSyncEngine implements ChallengeEngine {
  @override
  String get engineId => 'social.pair_sync';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _PairSyncWidget(challengeContext: challengeContext);
  }
}

class _PairSyncWidget extends StatefulWidget {
  const _PairSyncWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_PairSyncWidget> createState() => _PairSyncWidgetState();
}

class _PairSyncWidgetState extends State<_PairSyncWidget> {
  bool _submitted = false;

  bool get _hasPartner {
    final Object? raw =
        widget.challengeContext.challenge.clientConfig['pairAssignments'];
    return raw is Map && raw.isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String promptKey =
        (widget.challengeContext.challenge.clientConfig['promptKey']
            as String?) ??
        widget.challengeContext.challenge.promptKey;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            resolver.resolve(promptKey),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Text(
            resolver.resolve(
              _hasPartner
                  ? 'challenge.pair_sync.partner_ready'
                  : 'challenge.pair_sync.solo_fallback',
            ),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: LhColors.textMuted,
            ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            width: 180,
            height: 180,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: LhColors.success,
                foregroundColor: Colors.white,
                shape: const CircleBorder(),
              ),
              onPressed: widget.challengeContext.isInteractionLocked || _submitted
                  ? null
                  : () {
                      setState(() => _submitted = true);
                      widget.challengeContext.onSubmit(<String, dynamic>{
                        'synced': true,
                      });
                    },
              child: Text(
                resolver.resolve('challenge.pair_sync.action'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
