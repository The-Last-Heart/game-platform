import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/lh_heart_logo.dart';

/// Lobby view: authoritative seats, room code, ready / leave / share.
class LobbyView extends StatelessWidget {
  const LobbyView({
    required this.state,
    this.onReady,
    this.onLeave,
    super.key,
  });

  final MatchViewState state;
  final VoidCallback? onReady;
  final VoidCallback? onLeave;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final int capacity = state.mode == MatchMode.training ? 1 : 6;
    final int playerCount = state.players.length;
    final int emptySlots = (capacity - playerCount).clamp(0, capacity);
    final String? code = state.roomCode;
    final bool showRoomCode =
        code != null && code.isNotEmpty && state.mode == MatchMode.privateRoom;
    final PlayerPublic? local = state.localPlayer;
    final bool localReady = local?.ready == true;
    final String hostId = () {
      if (state.hostPlayerId != null && state.hostPlayerId!.isNotEmpty) {
        return state.hostPlayerId!;
      }
      for (final PlayerPublic p in state.players) {
        if (p.isHost == true) return p.playerId;
      }
      return state.players.isNotEmpty ? state.players.first.playerId : '';
    }();

    return Column(
      children: <Widget>[
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
                      resolver.resolve(
                        state.mode == MatchMode.privateRoom
                            ? TranslationKeys.lobbyPrivateRoom
                            : TranslationKeys.lobbyTitle,
                      ),
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
              IconButton(
                onPressed: onLeave,
                icon: const Icon(Icons.close, color: LhColors.textMuted),
                tooltip: resolver.resolve(TranslationKeys.privateLeave),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (showRoomCode)
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
                  Expanded(
                    child: Text(
                      code,
                      style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                        fontSize: 28,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 3,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: code));
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            resolver.resolve(TranslationKeys.privateCodeCopied),
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.copy, color: LhColors.text),
                    tooltip: resolver.resolve(TranslationKeys.privateShare),
                  ),
                ],
              ),
            ),
          ),
        if (showRoomCode) const SizedBox(height: 20),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Text(
                resolver.resolve(TranslationKeys.lobbyTitle),
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              if (hostId.isNotEmpty)
                Text(
                  '${resolver.resolve(TranslationKeys.lobbyHostLabel)}: ${_labelForHost(hostId)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            children: <Widget>[
              for (final PlayerPublic player in state.players)
                _PlayerRow(
                  player: player,
                  isHost: player.playerId == hostId || player.isHost == true,
                  resolver: resolver,
                ),
              if (emptySlots > 0)
                _EmptySlotRow(count: emptySlots, resolver: resolver),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Column(
            children: <Widget>[
              if (showRoomCode) ...<Widget>[
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: code));
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            resolver.resolve(TranslationKeys.privateCodeCopied),
                          ),
                        ),
                      );
                    },
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
              ],
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: localReady ? null : onReady,
                  style: FilledButton.styleFrom(
                    backgroundColor: LhColors.success,
                    disabledBackgroundColor: LhColors.border,
                    shape: const RoundedRectangleBorder(
                      borderRadius: LhRadii.mdAll,
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text(
                    resolver.resolve(
                      localReady
                          ? TranslationKeys.lobbyReady
                          : TranslationKeys.privateReady,
                    ),
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: onLeave,
                  child: Text(resolver.resolve(TranslationKeys.privateLeave)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  String _labelForHost(String hostId) {
    for (final PlayerPublic p in state.players) {
      if (p.playerId == hostId) {
        return _displayName(p);
      }
    }
    return hostId.length > 8 ? hostId.substring(0, 8) : hostId;
  }

  static String _displayName(PlayerPublic player) {
    final String? name = player.displayName;
    if (name != null && name.isNotEmpty) return name;
    if (player.playerId.length > 8) return player.playerId.substring(0, 8);
    return player.playerId;
  }
}

class _PlayerRow extends StatelessWidget {
  const _PlayerRow({
    required this.player,
    required this.isHost,
    required this.resolver,
  });

  final PlayerPublic player;
  final bool isHost;
  final TranslationResolver resolver;

  @override
  Widget build(BuildContext context) {
    final Color avatarColor = _parseColor(player.avatarColor) ??
        kPlayerAvatarColors[player.playerId.hashCode.abs() %
            kPlayerAvatarColors.length];
    final String name = LobbyView._displayName(player);
    final String initial = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final bool disconnected = player.presence == Presence.disconnected;
    final bool ready = player.ready == true;
    final bool bot = player.isBot == true;

    String statusLabel;
    if (bot) {
      statusLabel = resolver.resolve(TranslationKeys.lobbyBot);
    } else if (disconnected) {
      statusLabel = resolver.resolve(TranslationKeys.lobbyWaiting);
    } else if (ready) {
      statusLabel = resolver.resolve(TranslationKeys.lobbyReady);
    } else {
      statusLabel = resolver.resolve(TranslationKeys.lobbyWaitingPlayers);
    }

    return Opacity(
      opacity: disconnected ? 0.55 : 1,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: const BoxDecoration(
          color: LhColors.elevated,
          borderRadius: LhRadii.mdAll,
        ),
        child: Row(
          children: <Widget>[
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
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    name,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    statusLabel,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
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
            else if (bot)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: const BoxDecoration(
                  color: LhColors.surface,
                  borderRadius: LhRadii.pillAll,
                ),
                child: Text(
                  resolver.resolve(TranslationKeys.lobbyBot),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              )
            else if (ready)
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
      ),
    );
  }

  static Color? _parseColor(String? hex) {
    if (hex == null || hex.isEmpty) return null;
    final String raw = hex.startsWith('#') ? hex.substring(1) : hex;
    if (raw.length != 6) return null;
    return Color(int.parse(raw, radix: 16) + 0xFF000000);
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
        border: Border.all(color: LhColors.border),
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
