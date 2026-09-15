import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/lh_buttons.dart';
import 'widgets/lh_heart_logo.dart';
import 'widgets/player_standing_row.dart';

/// Terminal draw: tied top hearts after the catalog is exhausted.
class DrawView extends StatelessWidget {
  const DrawView({
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
    final List<PlayerPublic> standings = PlayerStandingRow.sortedStandings(
      state.players,
    );

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
          Icon(
            Icons.handshake_outlined,
            size: 64,
            color: LhColors.textMuted,
          ),
          const SizedBox(height: 24),
          Text(
            resolver.resolve(TranslationKeys.resultEqual),
            style: Theme.of(context).textTheme.headlineSmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 28),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              resolver.resolve(TranslationKeys.winnerStandings),
              style: Theme.of(context).textTheme.headlineMedium,
            ),
          ),
          const SizedBox(height: 12),
          for (final PlayerPublic player in standings)
            PlayerStandingRow(player: player, resolver: resolver),
          const SizedBox(height: 32),
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
