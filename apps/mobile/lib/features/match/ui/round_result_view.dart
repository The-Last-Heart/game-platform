import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/energy_display.dart';
import 'widgets/hearts_display.dart';
import 'widgets/lh_buttons.dart';
import 'widgets/lh_heart_logo.dart';
import 'widgets/power_narrative_banner.dart';

/// Displays round results — survived (22) or lost heart (23).
class RoundResultView extends StatefulWidget {
  const RoundResultView({
    required this.state,
    required this.estimateServerNowMs,
    this.onBackHome,
    this.onRetry,
    super.key,
  });

  final MatchViewState state;
  final int Function() estimateServerNowMs;
  final VoidCallback? onBackHome;
  final VoidCallback? onRetry;

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
    final PowerNarrative? narrative = widget.state.tactical?.lastNarrative;
    // After a strike resolves we briefly reuse round_result — never show the
    // prior challenge "Survived!" copy on top of a power outcome.
    if (narrative != null && _isTerminalPowerNarrative(narrative.kind)) {
      return _buildPowerOutcome(context, resolver, narrative);
    }

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

    // Pair-sync waiters / skipped seats are not failures — they keep energy.
    final bool localFailed = localResolution != null &&
        (localResolution.outcome == 'failure' ||
            localResolution.outcome == 'timeout');
    final bool survived = !localFailed;
    final bool isTraining = widget.state.mode == MatchMode.training;
    final int localEnergy = localResolution?.energyAfter ??
        widget.state.localPlayer?.energy ??
        0;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: <Widget>[
          const SizedBox(height: 8),
          // Header — brand + title only (no fake settings/notifications chrome).
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

          if (_localGrantBanner(resolver) case final Widget banner) ...<Widget>[
            banner,
            const SizedBox(height: 16),
          ],

          PowerNarrativeBanner(state: widget.state, resolver: resolver),

          if (survived)
            ..._buildSurvivedContent(
              context,
              resolver,
              result,
              localEnergy,
            ),
          if (!survived && localResolution != null)
            ..._buildFailedContent(
              context,
              resolver,
              localResolution,
              localEnergy,
            ),

          const SizedBox(height: 24),
          if (isTraining)
            _buildTrainingActions(resolver)
          else
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

  bool _isTerminalPowerNarrative(PowerNarrativeKind kind) {
    return kind == PowerNarrativeKind.hit ||
        kind == PowerNarrativeKind.shielded ||
        kind == PowerNarrativeKind.expired;
  }

  Widget _buildPowerOutcome(
    BuildContext context,
    TranslationResolver resolver,
    PowerNarrative narrative,
  ) {
    final String? localId = widget.state.playerId;
    final bool localIsTarget =
        localId != null && narrative.targetId == localId;
    final bool localLostHeart = localIsTarget &&
        (narrative.kind == PowerNarrativeKind.hit ||
            narrative.kind == PowerNarrativeKind.expired);
    final bool localDefended =
        localIsTarget && narrative.kind == PowerNarrativeKind.shielded;

    final String title;
    final bool positive;
    if (localLostHeart) {
      title = resolver.resolve(TranslationKeys.powerResultYouLostHeart);
      positive = false;
    } else if (localDefended) {
      title = resolver.resolve(TranslationKeys.powerResultYouDefended);
      positive = true;
    } else {
      title = resolver.resolve(TranslationKeys.powerResultTitle);
      positive = narrative.kind == PowerNarrativeKind.shielded;
    }

    final PlayerPublic? local = widget.state.localPlayer;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: <Widget>[
          const SizedBox(height: 8),
          _buildHeader(context, resolver),
          const SizedBox(height: 24),
          _buildIconRing(positive),
          const SizedBox(height: 20),
          Text(
            title,
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
              color: positive ? LhColors.success : LhColors.primary,
              shadows: <Shadow>[
                Shadow(
                  color: (positive ? LhColors.success : LhColors.primary)
                      .withValues(alpha: 0.5),
                  blurRadius: 20,
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          PowerNarrativeBanner(state: widget.state, resolver: resolver),
          const SizedBox(height: 8),
          HeartsDisplay(hearts: local?.hearts ?? 0, maxHearts: 3),
          const SizedBox(height: 12),
          EnergyDisplay(energy: local?.energy ?? 0),
          const SizedBox(height: 24),
          if (widget.state.mode == MatchMode.training)
            _buildTrainingActions(resolver)
          else
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 16),
              decoration: BoxDecoration(
                color: LhColors.surface,
                borderRadius: LhRadii.mdAll,
                border: Border.all(color: LhColors.border),
              ),
              child: Text(
                resolver.resolve(
                  TranslationKeys.resultNextChallengeIn,
                  params: <String, String>{
                    'seconds': '$_nextChallengeSeconds',
                  },
                ),
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

  Widget? _localGrantBanner(TranslationResolver resolver) {
    final PowerGrantInfo? grant =
        widget.state.tactical?.grantFor(widget.state.playerId);
    if (grant == null) return null;
    final bool full = grant.outcome == 'inventory_full';
    final String title = resolver.resolve(
      full ? 'power.inventory_full' : 'power.granted',
    );
    final String? powerName = grant.powerId == null
        ? null
        : resolver.resolve('power.${grant.powerId}.name');
    final String? nextHint = full
        ? null
        : grant.powerId == PowerIds.dangerPulse
            ? resolver.resolve('power.granted.strike_next')
            : resolver.resolve('power.granted.meter_ready');
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: LhColors.elevated,
        borderRadius: LhRadii.mdAll,
        border: Border.all(
          color: full
              ? LhColors.warning.withValues(alpha: 0.7)
              : LhColors.success.withValues(alpha: 0.7),
        ),
      ),
      child: Column(
        children: <Widget>[
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              color: full ? LhColors.warning : LhColors.success,
            ),
            textAlign: TextAlign.center,
          ),
          if (powerName != null) ...<Widget>[
            const SizedBox(height: 4),
            Text(
              powerName,
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
          ],
          if (nextHint != null) ...<Widget>[
            const SizedBox(height: 6),
            Text(
              nextHint,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: LhColors.textMuted,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTrainingActions(TranslationResolver resolver) {
    final String? errorKey = widget.state.connectionError;
    return Column(
      children: <Widget>[
        if (errorKey != null && errorKey.isNotEmpty) ...<Widget>[
          Text(
            resolver.resolve(errorKey),
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: LhColors.primary,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
        ],
        if (widget.onRetry != null)
          LhPrimaryButton(
            label: resolver.resolve(TranslationKeys.trainingRetry),
            icon: Icons.replay,
            onPressed: widget.onRetry!,
          ),
        if (widget.onRetry != null && widget.onBackHome != null)
          const SizedBox(height: 10),
        if (widget.onBackHome != null)
          LhSecondaryButton(
            label: resolver.resolve(TranslationKeys.winnerBackHome),
            onPressed: widget.onBackHome!,
          ),
      ],
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
    int localEnergy,
  ) {
    return <Widget>[
      const SizedBox(height: 20),
      for (int i = 0; i < result.resolutions.length; i++)
        _PlayerResultRow(
          resolution: result.resolutions[i],
          index: i,
          isLocal: result.resolutions[i].playerId == widget.state.playerId,
          displayName: _resolvePlayerName(result.resolutions[i].playerId),
          outcomeLabel: _outcomeLabel(resolver, result.resolutions[i].outcome),
        ),
      const SizedBox(height: 16),
      _buildEnergyBar(context, resolver, localEnergy),
    ];
  }

  List<Widget> _buildFailedContent(
    BuildContext context,
    TranslationResolver resolver,
    PlayerChallengeResolution resolution,
    int localEnergy,
  ) {
    return <Widget>[
      Text(
        _failureReason(resolver, resolution),
        style: Theme.of(context).textTheme.titleMedium,
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 24),
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
      const SizedBox(height: 16),
      // Failure costs a heart, never energy — keep the meter visible.
      _buildEnergyBar(context, resolver, localEnergy),
    ];
  }

  Widget _buildEnergyBar(
    BuildContext context,
    TranslationResolver resolver,
    int energy,
  ) {
    final PowerGrantInfo? grant =
        widget.state.tactical?.grantFor(widget.state.playerId);
    final bool meterReadyWithPower =
        grant != null &&
        grant.outcome == 'granted' &&
        energy >= 4;
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
                meterReadyWithPower
                    ? resolver.resolve('power.granted.meter_ready_short')
                    : '$energy / 4',
                style: Theme.of(
                  context,
                ).textTheme.bodyMedium?.copyWith(color: LhColors.warning),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: EnergyDisplay(energy: energy),
          ),
        ],
      ),
    );
  }

  String _resolvePlayerName(String playerId) {
    for (final PlayerPublic player in widget.state.players) {
      if (player.playerId != playerId) continue;
      final String? name = player.displayName?.trim();
      if (name != null && name.isNotEmpty) return name;
      break;
    }
    if (playerId == widget.state.playerId) {
      final String? local = widget.state.localPlayer?.displayName?.trim();
      if (local != null && local.isNotEmpty) return local;
    }
    return '—';
  }

  String _failureTitle(TranslationResolver resolver, String? outcome) {
    return switch (outcome) {
      'failure' => resolver.resolve(TranslationKeys.resultTooEarlyTitle),
      'timeout' => resolver.resolve(TranslationKeys.resultTimeout),
      _ => resolver.resolve(TranslationKeys.resultFailure),
    };
  }

  String _failureReason(
    TranslationResolver resolver,
    PlayerChallengeResolution? resolution,
  ) {
    final String? key = resolution?.reasonKey;
    if (key != null && key.isNotEmpty) {
      return resolver.resolve(key);
    }
    return switch (resolution?.outcome) {
      'timeout' => resolver.resolve(TranslationKeys.resultTimeoutReason),
      'failure' => resolver.resolve(TranslationKeys.resultPressedEarlyReason),
      _ => resolver.resolve(TranslationKeys.resultFailureReason),
    };
  }

  String _outcomeLabel(TranslationResolver resolver, String outcome) {
    return switch (outcome) {
      'success' => resolver.resolve(TranslationKeys.resultOutcomeSuccess),
      'failure' => resolver.resolve(TranslationKeys.resultOutcomeFailure),
      'timeout' => resolver.resolve(TranslationKeys.resultOutcomeTimeout),
      'skipped_spectator' => resolver.resolve(
        TranslationKeys.resultOutcomeSkipped,
      ),
      'left' => resolver.resolve(TranslationKeys.playerStatusLeft),
      _ => resolver.resolve(TranslationKeys.resultFailure),
    };
  }
}

class _PlayerResultRow extends StatelessWidget {
  const _PlayerResultRow({
    required this.resolution,
    required this.index,
    required this.isLocal,
    required this.displayName,
    required this.outcomeLabel,
  });

  final PlayerChallengeResolution resolution;
  final int index;
  final bool isLocal;
  final String displayName;
  final String outcomeLabel;

  @override
  Widget build(BuildContext context) {
    final Color avatarColor =
        kPlayerAvatarColors[index % kPlayerAvatarColors.length];
    final String initial = displayName.isNotEmpty && displayName != '—'
        ? displayName[0].toUpperCase()
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
              displayName,
              style: Theme.of(
                context,
              ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
          Text(
            resolution.outcome == 'success' ? '✓ $outcomeLabel' : outcomeLabel,
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
