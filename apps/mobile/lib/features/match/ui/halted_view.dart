import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../state/match_snapshot.dart';
import 'widgets/lh_buttons.dart';
import 'widgets/lh_heart_logo.dart';

/// Neutral terminal view for a halted match (no sole survivor / standings tie).
///
/// Must not claim a winner, trophy, reward, or fabricated standings.
class HaltedView extends StatelessWidget {
  const HaltedView({
    required this.state,
    required this.onBackHome,
    this.onRematch,
    super.key,
  });

  final MatchViewState state;
  final VoidCallback onBackHome;
  final VoidCallback? onRematch;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: <Widget>[
          const SizedBox(height: 8),
          Row(
            children: <Widget>[
              const LhHeartLogo(size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  resolver.resolve(TranslationKeys.winnerMatchEnded),
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
              ),
            ],
          ),
          const SizedBox(height: 48),
          const Icon(Icons.info_outline, size: 64, color: LhColors.textMuted),
          const SizedBox(height: 24),
          Text(
            resolver.resolve(TranslationKeys.errorsContentUnavailable),
            style: Theme.of(context).textTheme.titleLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 48),
          LhPrimaryButton(
            label: resolver.resolve(
              onRematch != null
                  ? TranslationKeys.rematchRequest
                  : TranslationKeys.winnerPlayAgain,
            ),
            icon: Icons.play_arrow,
            onPressed: onRematch ?? onBackHome,
          ),
          if (onRematch != null) ...<Widget>[
            const SizedBox(height: 10),
            LhSecondaryButton(
              label: resolver.resolve(TranslationKeys.winnerBackHome),
              onPressed: onBackHome,
            ),
          ],
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
