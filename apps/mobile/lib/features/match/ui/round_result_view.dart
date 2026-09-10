import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/hearts_display.dart';
import 'widgets/lh_heart_logo.dart';

/// Displays round results — survived (22) or lost heart (23).
class RoundResultView extends StatefulWidget {
  const RoundResultView({
    required this.state,
    required this.estimateServerNowMs,
    super.key,
  });

  final MatchViewState state;
  final int Function() estimateServerNowMs;

  @override
  State<RoundResultView> createState() => _RoundResultViewState();
}

class _RoundResultViewState extends State<RoundResultView> {
  Timer? _timer;
  int _nextChallengeSeconds = 3;

  @override
  void initState() {
    super.initState();
    _computeNext();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _computeNext());
  }

  void _computeNext() {
    final int? deadline =
        widget.state.nextPhaseAtMs ?? widget.state.phaseDeadlineAtMs;
    if (deadline != null) {
      final int nowMs = widget.estimateServerNowMs();
      setState(() {
        _nextChallengeSeconds = nowMs > 0
            ? ((deadline - nowMs) / 1000).ceil().clamp(0, 99)
            : 0;
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
    final LastRoundResult? result = widget.state.lastRoundResult;

    if (result == null) {
      return Center(
        child: Text(
          resolver.resolve(TranslationKeys.resultWaiting),
          style: Theme.of(context).textTheme.titleMedium,
        ),
      );
    }

    PlayerChallengeResolution? localResolution;
    for (final PlayerChallengeResolution r in result.resolutions) {
      if (r.playerId == widget.state.playerId) {
        localResolution = r;
        break;
      }
    }

    final bool survived = localResolution?.outcome == 'success';

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: <Widget>[
          const SizedBox(height: 8),
          // Header
          _buildHeader(context, resolver),
          const SizedBox(height: 24),
          // Icon ring
          _buildIconRing(survived),
          const SizedBox(height: 20),
          // Title
          Text(
            survived
                ? resolver.resolve(TranslationKeys.resultSurvived)
                : _failureTitle(resolver, localResolution?.outcome),
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
              color: survived ? LhColors.success : LhColors.primary,
              shadows: <Shadow>[
                Shadow(
                  color: (survived ? LhColors.success : LhColors.primary)
                      .withValues(alpha: 0.5),
                  blurRadius: 20,
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),

          if (survived) ..._buildSurvivedContent(context, resolver, result),
          if (!survived && localResolution != null)
            ..._buildFailedContent(context, resolver, localResolution),

          const SizedBox(height: 24),
          // Footer
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 16),
            decoration: BoxDecoration(
              color: LhColors.surface,
              borderRadius: LhRadii.mdAll,
              border: Border.all(color: LhColors.border),
            ),
            child: Text(
              survived
                  ? resolver.resolve(
                      TranslationKeys.resultNextChallengeIn,
                      params: <String, String>{
                        'seconds': '$_nextChallengeSeconds',
                      },
                    )
                  : resolver.resolve(TranslationKeys.resultAutoContinue),
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: LhColors.textMuted),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context, TranslationResolver resolver) {
    return Row(
      children: <Widget>[
        const LhHeartLogo(size: 36),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                resolver.resolve(TranslationKeys.resultChallengeTitle),
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              Text(
                resolver.resolve(
                  TranslationKeys.introRound,
                  params: <String, String>{
                    'round': '${widget.state.roundNumber}',
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
    );
  }

  Widget _buildIconRing(bool survived) {
    final Color color = survived ? LhColors.success : LhColors.primary;
    return Container(
      width: 120,
      height: 120,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 4),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: color.withValues(alpha: 0.3),
            blurRadius: 20,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Icon(survived ? Icons.check : Icons.close, color: color, size: 56),
    );
  }

  List<Widget> _buildSurvivedContent(
    BuildContext context,
    TranslationResolver resolver,
    LastRoundResult result,
  ) {
    return <Widget>[
      const SizedBox(height: 20),
      // Player ranking cards
      for (int i = 0; i < result.resolutions.length; i++)
        _PlayerResultRow(
          resolution: result.resolutions[i],
          index: i,
          isLocal: result.resolutions[i].playerId == widget.state.playerId,
        ),
      const SizedBox(height: 16),
      // Energy bar
      _buildEnergyBar(context, resolver),
    ];
  }

  List<Widget> _buildFailedContent(
    BuildContext context,
    TranslationResolver resolver,
    PlayerChallengeResolution resolution,
  ) {
    return <Widget>[
      // Reason text
      Text(
        resolver.resolve(TranslationKeys.resultPressedEarlyReason),
        style: Theme.of(context).textTheme.titleMedium,
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 24),
      // Hearts panel
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: LhColors.surface,
          borderRadius: LhRadii.mdAll,
          border: Border.all(color: LhColors.primary.withValues(alpha: 0.4)),
        ),
        child: Column(
          children: <Widget>[
            Text(
              resolver.resolve(TranslationKeys.resultLostHeartLabel),
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(color: LhColors.text),
            ),
            const SizedBox(height: 16),
            HeartsDisplay(hearts: resolution.heartsAfter),
            const SizedBox(height: 12),
            Text(
              resolver.resolve(
                TranslationKeys.resultHeartsRemaining,
                params: <String, String>{'count': '${resolution.heartsAfter}'},
              ),
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: LhColors.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    ];
  }

  Widget _buildEnergyBar(BuildContext context, TranslationResolver resolver) {
    final int energy = widget.state.localPlayer?.energy ?? 0;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: LhColors.surface,
        borderRadius: LhRadii.mdAll,
        border: Border.all(color: LhColors.border),
      ),
      child: Column(
        children: <Widget>[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: <Widget>[
              Text(
                resolver.resolve(TranslationKeys.resultPowerEnergy),
                style: Theme.of(context).textTheme.labelLarge,
              ),
              Text(
                '$energy / 4',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: LhColors.warning),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: LhRadii.pillAll,
            child: LinearProgressIndicator(
              value: (energy / 4.0).clamp(0.0, 1.0),
              minHeight: 8,
              backgroundColor: LhColors.border,
              valueColor: const AlwaysStoppedAnimation<Color>(LhColors.success),
            ),
          ),
        ],
      ),
    );
  }

  String _failureTitle(TranslationResolver resolver, String? outcome) {
    return switch (outcome) {
      'failure' => resolver.resolve(TranslationKeys.resultTooEarlyTitle),
      'timeout' => resolver.resolve(TranslationKeys.resultTimeout),
      _ => resolver.resolve(TranslationKeys.resultFailure),
    };
  }
}

class _PlayerResultRow extends StatelessWidget {
  const _PlayerResultRow({
    required this.resolution,
    required this.index,
    required this.isLocal,
  });

  final PlayerChallengeResolution resolution;
  final int index;
  final bool isLocal;

  @override
  Widget build(BuildContext context) {
    final Color avatarColor =
        kPlayerAvatarColors[index % kPlayerAvatarColors.length];
    final String initial = resolution.playerId.isNotEmpty
        ? resolution.playerId[0].toUpperCase()
        : '?';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: isLocal ? LhColors.elevated : LhColors.surface,
        borderRadius: LhRadii.mdAll,
        border: Border.all(
          color: isLocal ? LhColors.success : LhColors.border,
          width: isLocal ? 1.5 : 1,
        ),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 36,
            height: 36,
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
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              resolution.playerId.length > 8
                  ? resolution.playerId.substring(0, 8)
                  : resolution.playerId,
              style: Theme.of(
                context,
              ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          Text(
            resolution.outcome == 'success' ? '✓' : resolution.outcome,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: resolution.outcome == 'success'
                  ? LhColors.success
                  : LhColors.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}
