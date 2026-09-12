import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/hearts_display.dart';
import 'widgets/lh_buttons.dart';
import 'widgets/lh_heart_logo.dart';

/// Match completion view showing the winner and full standings.
///
/// Must not invent challenge counts, rewards, XP, or other progression values
/// that the server has not supplied. Energy is the authoritative score field.
class WinnerView extends StatelessWidget {
  const WinnerView({
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
    final bool isWinner = state.winnerId == state.playerId;
    final String winnerLabel = _winnerDisplayName(state);
    final List<PlayerPublic> standings = _sortedStandings(state);

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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      resolver.resolve(TranslationKeys.winnerMatchEnded),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    if (isWinner)
                      Text(
                        resolver.resolve(TranslationKeys.winnerFirstPlace),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Container(
            width: 140,
            height: 140,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: isWinner ? LhColors.warning : LhColors.textMuted,
                width: 3,
              ),
              boxShadow: isWinner
                  ? <BoxShadow>[
                      BoxShadow(
                        color: LhColors.warning.withValues(alpha: 0.35),
                        blurRadius: 28,
                        spreadRadius: 2,
                      ),
                    ]
                  : null,
            ),
            child: Icon(
              Icons.emoji_events,
              size: 64,
              color: isWinner ? LhColors.warning : LhColors.textMuted,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            isWinner
                ? resolver.resolve(TranslationKeys.winnerYouLastHeart)
                : resolver.resolve(TranslationKeys.winnerOther),
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
              color: isWinner ? LhColors.warning : LhColors.text,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          if (winnerLabel.isNotEmpty)
            Text(
              resolver.resolve(
                TranslationKeys.winnerPlayerWins,
                params: <String, String>{'name': winnerLabel},
              ),
              style: Theme.of(context).textTheme.titleMedium,
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
            _StandingRow(
              player: player,
              isWinner: player.playerId == state.winnerId,
              resolver: resolver,
            ),
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

  static List<PlayerPublic> _sortedStandings(MatchViewState state) {
    final List<PlayerPublic> players = List<PlayerPublic>.from(state.players);
    players.sort((PlayerPublic a, PlayerPublic b) {
      final bool aWin = a.playerId == state.winnerId;
      final bool bWin = b.playerId == state.winnerId;
      if (aWin != bWin) return aWin ? -1 : 1;
      if (a.hearts != b.hearts) return b.hearts.compareTo(a.hearts);
      return b.energy.compareTo(a.energy);
    });
    return players;
  }

  /// Prefer server-provided displayName; never show a truncated playerId.
  static String _winnerDisplayName(MatchViewState state) {
    final String? winnerId = state.winnerId;
    if (winnerId == null || winnerId.isEmpty) return '';
    for (final PlayerPublic player in state.players) {
      if (player.playerId != winnerId) continue;
      final String? name = player.displayName?.trim();
      if (name != null && name.isNotEmpty) return name;
      break;
    }
    final String? local = state.localPlayer?.displayName?.trim();
    if (state.playerId == winnerId && local != null && local.isNotEmpty) {
      return local;
    }
    return '';
  }
}

class _StandingRow extends StatelessWidget {
  const _StandingRow({
    required this.player,
    required this.isWinner,
    required this.resolver,
  });

  final PlayerPublic player;
  final bool isWinner;
  final TranslationResolver resolver;

  @override
  Widget build(BuildContext context) {
    final String name = () {
      final String? trimmed = player.displayName?.trim();
      if (trimmed != null && trimmed.isNotEmpty) return trimmed;
      return '—';
    }();

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: LhColors.elevated,
        borderRadius: LhRadii.mdAll,
        border: Border.all(
          color: isWinner ? LhColors.warning : LhColors.border,
        ),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              name,
              style: Theme.of(context).textTheme.titleMedium,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (player.hearts > 0) ...<Widget>[
            HeartsDisplay(hearts: player.hearts),
            const SizedBox(width: 12),
          ],
          Text(
            '${resolver.resolve(TranslationKeys.winnerEnergyScore)} ${player.energy}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
