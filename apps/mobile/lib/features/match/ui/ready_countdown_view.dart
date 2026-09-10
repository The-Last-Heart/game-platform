import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/countdown_ring.dart';
import 'widgets/lh_heart_logo.dart';

/// Ready countdown view — 2×3 player grid, countdown ring, tips.
class ReadyCountdownView extends StatefulWidget {
  const ReadyCountdownView({
    required this.state,
    required this.estimateServerNowMs,
    super.key,
  });

  final MatchViewState state;
  final int Function() estimateServerNowMs;

  @override
  State<ReadyCountdownView> createState() => _ReadyCountdownViewState();
}

class _ReadyCountdownViewState extends State<ReadyCountdownView> {
  Timer? _timer;
  int _secondsRemaining = 3;

  @override
  void initState() {
    super.initState();
    _computeRemaining();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      _computeRemaining();
    });
  }

  void _computeRemaining() {
    final int? deadline = widget.state.phaseDeadlineAtMs;
    if (deadline != null) {
      final int nowMs = widget.estimateServerNowMs();
      final int remaining = nowMs > 0
          ? ((deadline - nowMs) / 1000).ceil().clamp(0, 10)
          : 0;
      setState(() {
        _secondsRemaining = remaining;
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final double progress = _secondsRemaining / 3.0;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: <Widget>[
          const SizedBox(height: 8),
          // Header
          Row(
            children: <Widget>[
              const LhHeartLogo(size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      resolver.resolve(TranslationKeys.countdownAllReady),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      resolver.resolve(TranslationKeys.countdownMatchStarts),
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
          const SizedBox(height: 20),

          // 2×3 player grid
          _buildPlayerGrid(context),
          const SizedBox(height: 28),

          // Countdown ring
          CountdownRing(
            progress: progress,
            label: _toArabicDigit(_secondsRemaining),
            size: 160,
            ringColor: LhColors.primary,
            glow: true,
          ),
          const SizedBox(height: 16),

          // Get ready text
          Text(
            resolver.resolve(TranslationKeys.countdownGetReady),
            style: Theme.of(context).textTheme.displayLarge,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),

          // Tip cards
          _TipCard(
            number: '١',
            title: resolver.resolve(TranslationKeys.countdownTip1Title),
            description: resolver.resolve(TranslationKeys.countdownTip1Desc),
          ),
          const SizedBox(height: 10),
          _TipCard(
            number: '٢',
            title: resolver.resolve(TranslationKeys.countdownTip2Title),
            description: resolver.resolve(TranslationKeys.countdownTip2Desc),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildPlayerGrid(BuildContext context) {
    final List<PlayerPublic> players = widget.state.players;
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 0.85,
      ),
      itemCount: players.length.clamp(0, 6),
      itemBuilder: (BuildContext context, int index) {
        final PlayerPublic player = players[index];
        final Color avatarColor =
            kPlayerAvatarColors[index % kPlayerAvatarColors.length];
        final String initial = player.playerId.isNotEmpty
            ? player.playerId[0].toUpperCase()
            : '?';
        return Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
          decoration: const BoxDecoration(
            color: LhColors.elevated,
            borderRadius: LhRadii.smAll,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: avatarColor,
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
              const SizedBox(height: 6),
              Text(
                player.playerId.length > 6
                    ? player.playerId.substring(0, 6)
                    : player.playerId,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: LhColors.text),
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List<Widget>.generate(
                  player.hearts.clamp(0, 3),
                  (_) => const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 1),
                    child: Icon(
                      Icons.favorite,
                      color: LhColors.primary,
                      size: 14,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  static String _toArabicDigit(int n) {
    const List<String> digits = <String>[
      '٠',
      '١',
      '٢',
      '٣',
      '٤',
      '٥',
      '٦',
      '٧',
      '٨',
      '٩',
    ];
    return n.toString().split('').map((String c) {
      final int? d = int.tryParse(c);
      return d != null && d < 10 ? digits[d] : c;
    }).join();
  }
}

class _TipCard extends StatelessWidget {
  const _TipCard({
    required this.number,
    required this.title,
    required this.description,
  });

  final String number;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: LhColors.elevated,
        borderRadius: LhRadii.mdAll,
        border: Border.all(color: LhColors.border),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: LhColors.success.withValues(alpha: 0.15),
              borderRadius: LhRadii.smAll,
            ),
            child: Center(
              child: Text(
                number,
                style: const TextStyle(
                  color: LhColors.success,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(title, style: Theme.of(context).textTheme.labelLarge),
                const SizedBox(height: 2),
                Text(description, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
