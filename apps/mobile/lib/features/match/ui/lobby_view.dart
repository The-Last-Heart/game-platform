import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/lh_heart_logo.dart';

/// Lobby view showing player list (6 max), room code, and status.
class LobbyView extends StatelessWidget {
  const LobbyView({required this.state, super.key});

  final MatchViewState state;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final int playerCount = state.players.length;
    final int emptySlots = (6 - playerCount).clamp(0, 6);

    return Column(
      children: <Widget>[
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
          child: Row(
            children: <Widget>[
              const LhHeartLogo(size: 40),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      resolver.resolve(TranslationKeys.lobbyPrivateRoom),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      resolver.resolve(
                        TranslationKeys.lobbyPlayersOfMax,
                        params: <String, String>{'count': '$playerCount'},
                      ),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_left, color: LhColors.textMuted),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Room code card
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: LhColors.surface,
              borderRadius: LhRadii.mdAll,
              border: Border.all(color: LhColors.warning, width: 1.5),
            ),
            child: Row(
              children: <Widget>[
                // Room code (short matchId)
                Text(
                  _shortCode(state.matchId),
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                    fontSize: 32,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 4,
                  ),
                ),
                const Spacer(),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: <Widget>[
                    Text(
                      resolver.resolve(TranslationKeys.lobbyRoomCode),
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      resolver.resolve(TranslationKeys.lobbyShareCode),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),

        // Players header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Text(
                resolver.resolve(TranslationKeys.lobbyTitle),
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              if (playerCount > 0)
                Text(
                  '${resolver.resolve(TranslationKeys.lobbyHostLabel)}: ${_displayName(state.players.first.playerId)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Players list
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            children: <Widget>[
              for (int i = 0; i < playerCount; i++)
                _PlayerRow(
                  player: state.players[i],
                  index: i,
                  isHost: i == 0,
                  resolver: resolver,
                ),
              if (emptySlots > 0)
                _EmptySlotRow(count: emptySlots, resolver: resolver),
            ],
          ),
        ),

        // Bottom section
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Column(
            children: <Widget>[
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: null,
                  icon: const Icon(Icons.share, size: 18),
                  label: Text(
                    resolver.resolve(TranslationKeys.lobbyInviteFriend),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: LhColors.text,
                    side: const BorderSide(color: LhColors.border),
                    shape: const RoundedRectangleBorder(
                      borderRadius: LhRadii.mdAll,
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: null,
                  style: FilledButton.styleFrom(
                    backgroundColor: LhColors.success,
                    disabledBackgroundColor: LhColors.border,
                    shape: const RoundedRectangleBorder(
                      borderRadius: LhRadii.mdAll,
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text(
                    resolver.resolve(TranslationKeys.lobbyStartWhenFull),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  static String _shortCode(String? matchId) {
    if (matchId == null || matchId.isEmpty) return '----';
    final String digits = matchId.replaceAll(RegExp(r'[^0-9a-zA-Z]'), '');
    return digits.length >= 4
        ? digits.substring(digits.length - 4).toUpperCase()
        : digits.toUpperCase();
  }

  static String _displayName(String playerId) {
    if (playerId.length > 8) return playerId.substring(0, 8);
    return playerId;
  }
}

class _PlayerRow extends StatelessWidget {
  const _PlayerRow({
    required this.player,
    required this.index,
    required this.isHost,
    required this.resolver,
  });

  final PlayerPublic player;
  final int index;
  final bool isHost;
  final TranslationResolver resolver;

  @override
  Widget build(BuildContext context) {
    final Color avatarColor =
        kPlayerAvatarColors[index % kPlayerAvatarColors.length];
    final String initial = player.playerId.isNotEmpty
        ? player.playerId[0].toUpperCase()
        : '?';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: const BoxDecoration(
        color: LhColors.elevated,
        borderRadius: LhRadii.mdAll,
      ),
      child: Row(
        children: <Widget>[
          // Avatar
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: avatarColor,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                initial,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Name + status
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  LobbyView._displayName(player.playerId),
                  style: Theme.of(
                    context,
                  ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
                Text(
                  resolver.resolve(TranslationKeys.lobbyReady),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          // Host pill
          if (isHost)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: LhColors.surface,
                borderRadius: LhRadii.pillAll,
                border: Border.all(color: LhColors.border),
              ),
              child: Text(
                resolver.resolve(TranslationKeys.lobbyHostLabel),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            )
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: const BoxDecoration(
                color: LhColors.surface,
                borderRadius: LhRadii.pillAll,
              ),
              child: Text(
                resolver.resolve(TranslationKeys.lobbyReady),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
        ],
      ),
    );
  }
}

class _EmptySlotRow extends StatelessWidget {
  const _EmptySlotRow({required this.count, required this.resolver});

  final int count;
  final TranslationResolver resolver;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: BoxDecoration(
        color: Colors.transparent,
        borderRadius: LhRadii.mdAll,
        border: Border.all(color: LhColors.border, style: BorderStyle.solid),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Expanded(
            child: Column(
              children: <Widget>[
                Text(
                  resolver.resolve(
                    TranslationKeys.lobbyEmptySlots,
                    params: <String, String>{'count': '$count'},
                  ),
                  style: Theme.of(
                    context,
                  ).textTheme.bodyLarge?.copyWith(color: LhColors.textMuted),
                ),
                const SizedBox(height: 2),
                Text(
                  resolver.resolve(TranslationKeys.lobbyWaitingPlayers),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: LhColors.border),
            ),
            child: const Icon(Icons.add, color: LhColors.textMuted, size: 20),
          ),
        ],
      ),
    );
  }
}
