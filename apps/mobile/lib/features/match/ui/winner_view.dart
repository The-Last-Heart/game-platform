import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../state/match_snapshot.dart';
import 'widgets/lh_heart_logo.dart';

/// Match completion view showing the winner.
class WinnerView extends StatelessWidget {
  const WinnerView({required this.state, required this.onBackHome, super.key});

  final MatchViewState state;
  final VoidCallback onBackHome;

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final bool isWinner = state.winnerId == state.playerId;

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
                      resolver.resolve(TranslationKeys.winnerMatchEnded),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      isWinner
                          ? resolver.resolve(TranslationKeys.winnerFirstPlace)
                          : '',
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
          const SizedBox(height: 24),

          // Trophy circle
          Container(
            width: 140,
            height: 140,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: isWinner ? LhColors.warning : LhColors.textMuted,
                width: 3,
              ),
            ),
            child: Icon(
              Icons.emoji_events,
              size: 64,
              color: isWinner ? LhColors.warning : LhColors.textMuted,
            ),
          ),
          const SizedBox(height: 24),

          // Winner title
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
          if (isWinner)
            Text(
              resolver.resolve(
                TranslationKeys.winnerPlayerWins,
                params: <String, String>{'name': _shortId(state.playerId)},
              ),
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
          const SizedBox(height: 24),

          // Stats row (decorative)
          if (isWinner) _buildStatsRow(context, resolver),
          if (isWinner) const SizedBox(height: 16),

          // Reward card (decorative)
          if (isWinner) _buildRewardCard(context, resolver),
          const SizedBox(height: 32),

          // Play again button
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton.icon(
              onPressed: onBackHome,
              icon: const Icon(Icons.play_arrow, size: 24),
              label: Text(
                resolver.resolve(TranslationKeys.winnerPlayAgain),
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),

          // Share button (decorative)
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: null,
              icon: const Icon(Icons.share, size: 18),
              label: Text(resolver.resolve(TranslationKeys.winnerShareResult)),
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
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  static String _shortId(String? id) {
    if (id == null || id.isEmpty) return '';
    return id.length > 8 ? id.substring(0, 8) : id;
  }

  Widget _buildStatsRow(BuildContext context, TranslationResolver resolver) {
    return Row(
      children: <Widget>[
        Expanded(
          child: _StatCard(
            value: '٧',
            label: resolver.resolve(TranslationKeys.winnerChallengesWon),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatCard(
            value: '${state.localPlayer?.hearts ?? 0}',
            label: resolver.resolve(TranslationKeys.winnerHeartsLeft),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatCard(
            value: '٢',
            label: resolver.resolve(TranslationKeys.winnerChallengesWon),
          ),
        ),
      ],
    );
  }

  Widget _buildRewardCard(BuildContext context, TranslationResolver resolver) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: LhColors.surface,
        borderRadius: LhRadii.mdAll,
        border: Border.all(color: LhColors.warning.withValues(alpha: 0.5)),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  resolver.resolve(TranslationKeys.winnerRewardTitle),
                  style: Theme.of(
                    context,
                  ).textTheme.labelLarge?.copyWith(color: LhColors.warning),
                ),
                const SizedBox(height: 2),
                Text(
                  resolver.resolve(TranslationKeys.winnerRewardDesc),
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          Text(
            '+ ٨٥٠',
            style: Theme.of(
              context,
            ).textTheme.headlineLarge?.copyWith(color: LhColors.warning),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: LhColors.surface,
        borderRadius: LhRadii.mdAll,
        border: Border.all(color: LhColors.border),
      ),
      child: Column(
        children: <Widget>[
          Text(value, style: Theme.of(context).textTheme.headlineLarge),
          const SizedBox(height: 4),
          Text(
            label,
            style: Theme.of(context).textTheme.bodySmall,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
