import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/lh_heart_logo.dart';

/// Spectator view for eliminated players watching the match.
class SpectatorView extends StatelessWidget {
  const SpectatorView({required this.state, super.key});

  final MatchViewState state;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final int activePlayers = state.players
        .where((PlayerPublic p) => p.status == PlayerStatus.active)
        .length;

    return Column(
      children: <Widget>[
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
          child: Row(
            children: <Widget>[
              const LhHeartLogo(size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      resolver.resolve(TranslationKeys.spectatorMatchOngoing),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      resolver.resolve(
                        TranslationKeys.introRound,
                        params: <String, String>{
                          'round': '${state.roundNumber}',
                        },
                      ),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.settings_outlined,
                color: LhColors.textMuted,
                size: 22,
              ),
              const SizedBox(width: 8),
              const Icon(
                Icons.notifications_outlined,
                color: LhColors.textMuted,
                size: 22,
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Red X ring
        Container(
          width: 120,
          height: 120,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: LhColors.primary, width: 4),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: LhColors.primary.withValues(alpha: 0.3),
                blurRadius: 20,
                spreadRadius: 2,
              ),
            ],
          ),
          child: const Icon(Icons.close, color: LhColors.primary, size: 56),
        ),
        const SizedBox(height: 20),

        // Lost last heart text
        Text(
          resolver.resolve(TranslationKeys.spectatorLostLastHeart),
          style: Theme.of(context).textTheme.displayLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Text(
            resolver.resolve(TranslationKeys.spectatorEliminatedMsg),
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: 20),

        // Standings header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Text(
                resolver.resolve(TranslationKeys.spectatorCurrentStandings),
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              Text(
                resolver.resolve(
                  TranslationKeys.spectatorRemainingPlayers,
                  params: <String, String>{'count': '$activePlayers'},
                ),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Standings list
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: state.players.length,
            itemBuilder: (BuildContext context, int index) {
              final PlayerPublic player = state.players[index];
              final bool isEliminated = player.status == PlayerStatus.spectator;
              final Color avatarColor =
                  kPlayerAvatarColors[index % kPlayerAvatarColors.length];
              final String initial = player.playerId.isNotEmpty
                  ? player.playerId[0].toUpperCase()
                  : '?';
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: isEliminated
                      ? LhColors.surface.withValues(alpha: 0.5)
                      : LhColors.elevated,
                  borderRadius: LhRadii.mdAll,
                ),
                child: Row(
                  children: <Widget>[
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: isEliminated ? LhColors.disabled : avatarColor,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          initial,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        player.playerId.length > 8
                            ? player.playerId.substring(0, 8)
                            : player.playerId,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: isEliminated
                              ? LhColors.textMuted
                              : LhColors.text,
                        ),
                      ),
                    ),
                    if (isEliminated)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: const BoxDecoration(
                          color: LhColors.surface,
                          borderRadius: LhRadii.pillAll,
                        ),
                        child: Text(
                          resolver.resolve(
                            TranslationKeys.spectatorEliminatedBadge,
                          ),
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: LhColors.textMuted),
                        ),
                      )
                    else
                      // Hearts
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: List<Widget>.generate(
                          3,
                          (int i) => Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 1),
                            child: Icon(
                              i < player.hearts
                                  ? Icons.favorite
                                  : Icons.favorite_border,
                              color: i < player.hearts
                                  ? LhColors.primary
                                  : LhColors.disabled,
                              size: 18,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
        ),

        // Watch match button
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () {},
              icon: const Icon(Icons.visibility, size: 20),
              label: Text(
                resolver.resolve(TranslationKeys.spectatorWatchMatch),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              style: FilledButton.styleFrom(
                backgroundColor: LhColors.elevated,
                foregroundColor: LhColors.text,
                shape: const RoundedRectangleBorder(
                  borderRadius: LhRadii.mdAll,
                ),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
