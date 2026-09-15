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
              final bool hasLeft = player.status == PlayerStatus.left;
              final bool isEliminated =
                  player.status == PlayerStatus.spectator || hasLeft;
              final Color avatarColor =
                  kPlayerAvatarColors[index % kPlayerAvatarColors.length];
              final String name = _playerDisplayName(player);
              final String initial =
                  name.isNotEmpty && name != '—' ? name[0].toUpperCase() : '?';
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
                        name,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w600,
                          color: isEliminated
                              ? LhColors.textMuted
                              : LhColors.text,
                        ),
                      ),
                    ),
                    if (hasLeft)
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
                          resolver.resolve(TranslationKeys.playerStatusLeft),
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: LhColors.textMuted),
                        ),
                      )
                    else if (isEliminated)
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
        const SizedBox(height: 12),
      ],
    );
  }

  static String _playerDisplayName(PlayerPublic player) {
    final String? name = player.displayName?.trim();
    if (name != null && name.isNotEmpty) return name;
    return '—';
  }
}
