import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_catalog.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'widgets/countdown_ring.dart';
import 'widgets/energy_display.dart';
import 'widgets/hearts_display.dart';
import 'widgets/lh_buttons.dart';
import 'widgets/lh_heart_logo.dart';
import 'widgets/challenge_sfx.dart';
import 'widgets/power_narrative_banner.dart';

/// Incoming Danger Pulse defense window.
class PowerDefenseView extends StatefulWidget {
  const PowerDefenseView({
    required this.state,
    required this.estimateServerNowMs,
    required this.onDefend,
    super.key,
  });

  final MatchViewState state;
  final int Function() estimateServerNowMs;
  final void Function(PowerDefenseChoice choice) onDefend;

  @override
  State<PowerDefenseView> createState() => _PowerDefenseViewState();
}

class _PowerDefenseViewState extends State<PowerDefenseView> {
  Timer? _timer;
  int _secondsLabel = 0;
  double _progress = 1.0;
  int? _deadlineMs;
  int _totalMs = 5000;
  bool _acted = false;

  @override
  void initState() {
    super.initState();
    _computeRemaining();
    _timer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      _computeRemaining();
    });
    // Only the targeted seat hears the strike alarm.
    if (_localIsTarget) {
      unawaited(ChallengeSfx.instance.strike());
    }
  }

  @override
  void didUpdateWidget(covariant PowerDefenseView oldWidget) {
    super.didUpdateWidget(oldWidget);
    final String? oldId = oldWidget.state.tactical?.pendingAttack?.attackId;
    final String? newId = widget.state.tactical?.pendingAttack?.attackId;
    if (oldId != newId) {
      _acted = false;
      if (newId != null && _localIsTarget) {
        unawaited(ChallengeSfx.instance.strike());
      } else {
        unawaited(ChallengeSfx.instance.stop());
      }
    }
  }

  void _computeRemaining() {
    final int? deadline =
        widget.state.tactical?.pendingAttack?.defenseDeadlineAtMs ??
        widget.state.phaseDeadlineAtMs ??
        widget.state.nextPhaseAtMs;
    if (deadline == null) return;
    final int nowMs = widget.estimateServerNowMs();
    if (nowMs <= 0) return;
    if (_deadlineMs != deadline) {
      _deadlineMs = deadline;
      _totalMs = (deadline - nowMs).clamp(1, 30000);
    }
    final int remainingMs = (deadline - nowMs).clamp(0, _totalMs);
    setState(() {
      _progress = remainingMs / _totalMs;
      _secondsLabel = (remainingMs / 1000).ceil().clamp(0, 99);
    });
  }

  bool get _localIsTarget {
    final PendingPowerAttack? pending = widget.state.tactical?.pendingAttack;
    return pending != null &&
        widget.state.playerId != null &&
        pending.targetId == widget.state.playerId;
  }

  void _defend(PowerDefenseChoice choice) {
    if (_acted) return;
    setState(() => _acted = true);
    unawaited(ChallengeSfx.instance.stop());
    widget.onDefend(choice);
  }

  @override
  void dispose() {
    _timer?.cancel();
    unawaited(ChallengeSfx.instance.stop());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final PlayerPublic? local = widget.state.localPlayer;
    final PendingPowerAttack? pending = widget.state.tactical?.pendingAttack;
    final bool isTarget =
        pending != null &&
        widget.state.playerId != null &&
        pending.targetId == widget.state.playerId;
    final PlayerPowerInventory inventory =
        local?.inventory ?? const PlayerPowerInventory();
    final bool canShield = inventory.shield > 0;
    final bool canReflect = inventory.reflection > 0 && pending?.reflected != true;

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
                      resolver.resolve(TranslationKeys.powerDefenseTitle),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      resolver.resolve('power.danger_pulse.name'),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              HeartsDisplay(hearts: local?.hearts ?? 0),
            ],
          ),
          const SizedBox(height: 12),
          EnergyDisplay(energy: local?.energy ?? 0),
          const SizedBox(height: 16),
          PowerNarrativeBanner(state: widget.state, resolver: resolver),
          const SizedBox(height: 12),
          CountdownRing(
            progress: _progress,
            label: '$_secondsLabel',
            size: 120,
          ),
          const SizedBox(height: 20),
          if (!isTarget)
            Text(
              widget.state.tactical?.lastNarrative != null
                  ? resolver.resolve(TranslationKeys.powerDefenseWatching)
                  : resolver.resolve(TranslationKeys.powerDefenseWaiting),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: LhColors.textMuted,
              ),
              textAlign: TextAlign.center,
            )
          else ...<Widget>[
            Text(
              resolver.resolve(
                pending.reflected
                    ? TranslationKeys.powerDefenseReflectedIncoming
                    : TranslationKeys.powerDefenseIncoming,
              ),
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: LhColors.primary,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              _attackerLabel(resolver, pending.attackerId),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: LhColors.textMuted,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            if (canShield)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: LhPrimaryButton(
                  label: resolver.resolve('power.shield.name'),
                  icon: Icons.shield,
                  onPressed: _acted
                      ? null
                      : () => _defend(PowerDefenseChoice.shield),
                ),
              ),
            if (canReflect)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: LhPrimaryButton(
                  label: resolver.resolve('power.reflection.name'),
                  icon: Icons.sync,
                  onPressed: _acted
                      ? null
                      : () => _defend(PowerDefenseChoice.reflect),
                ),
              ),
            LhSecondaryButton(
              label: resolver.resolve(TranslationKeys.powerDefenseNone),
              onPressed: _acted
                  ? null
                  : () => _defend(PowerDefenseChoice.none),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  String _attackerLabel(TranslationResolver resolver, String attackerId) {
    for (final PlayerPublic p in widget.state.players) {
      if (p.playerId != attackerId) continue;
      final String? name = p.displayName?.trim();
      if (name != null && name.isNotEmpty) {
        return resolver.resolve(
          TranslationKeys.powerDefenseFrom,
          params: <String, String>{'name': name},
        );
      }
    }
    return resolver.resolve(TranslationKeys.powerDefenseIncoming);
  }
}
