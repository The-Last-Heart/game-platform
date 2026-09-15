import 'package:flutter/material.dart';

import '../../../../l10n/translation_catalog.dart';
import '../../../../l10n/translation_resolver.dart';
import '../../../../theme/lh_tokens.dart';
import '../../protocol/realtime_messages.dart';
import 'hearts_display.dart';

/// Shared standings row for terminal result screens (winner / draw).
class PlayerStandingRow extends StatelessWidget {
  const PlayerStandingRow({
    required this.player,
    required this.resolver,
    this.isWinner = false,
    super.key,
  });

  final PlayerPublic player;
  final TranslationResolver resolver;
  final bool isWinner;

  static bool isLeft(PlayerPublic player) {
    return player.status == PlayerStatus.left ||
        player.presence == Presence.disconnected;
  }

  static List<PlayerPublic> sortedStandings(
    List<PlayerPublic> source, {
    String? winnerId,
  }) {
    final List<PlayerPublic> players = List<PlayerPublic>.from(source);
    players.sort((PlayerPublic a, PlayerPublic b) {
      final bool aLeft = isLeft(a);
      final bool bLeft = isLeft(b);
      if (aLeft != bLeft) return aLeft ? 1 : -1;
      final bool aWin = a.playerId == winnerId;
      final bool bWin = b.playerId == winnerId;
      if (aWin != bWin) return aWin ? -1 : 1;
      if (a.hearts != b.hearts) return b.hearts.compareTo(a.hearts);
      return b.energy.compareTo(a.energy);
    });
    return players;
  }

  @override
  Widget build(BuildContext context) {
    final String name = () {
      final String? trimmed = player.displayName?.trim();
      if (trimmed != null && trimmed.isNotEmpty) return trimmed;
      return '—';
    }();
    final bool left = isLeft(player);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: left
            ? LhColors.surface.withValues(alpha: 0.5)
            : LhColors.elevated,
        borderRadius: LhRadii.mdAll,
        border: Border.all(
          color: isWinner && !left ? LhColors.warning : LhColors.border,
        ),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              name,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: left ? LhColors.textMuted : null,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (left)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: const BoxDecoration(
                color: LhColors.surface,
                borderRadius: LhRadii.pillAll,
              ),
              child: Text(
                resolver.resolve(TranslationKeys.playerStatusLeft),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: LhColors.textMuted,
                ),
              ),
            )
          else ...<Widget>[
            if (player.hearts > 0) ...<Widget>[
              HeartsDisplay(hearts: player.hearts),
              const SizedBox(width: 12),
            ],
            Text(
              '${resolver.resolve(TranslationKeys.winnerEnergyScore)} ${player.energy}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }
}
