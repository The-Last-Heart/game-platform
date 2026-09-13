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

/// Between-round offensive window: target selection / no targets / skip.
class PowerActionView extends StatefulWidget {
  const PowerActionView({
    required this.state,
    required this.estimateServerNowMs,
    required this.onUseDangerPulse,
    required this.onSkip,
    super.key,
  });

  final MatchViewState state;
  final int Function() estimateServerNowMs;
  final void Function(String targetPlayerId) onUseDangerPulse;
  final VoidCallback onSkip;

  @override
  State<PowerActionView> createState() => _PowerActionViewState();
}

class _PowerActionViewState extends State<PowerActionView> {
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
  }

  @override
  void didUpdateWidget(covariant PowerActionView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.state.phaseDeadlineAtMs != widget.state.phaseDeadlineAtMs) {
      _acted = false;
    }
  }

  void _computeRemaining() {
    final int? deadline =
        widget.state.phaseDeadlineAtMs ?? widget.state.nextPhaseAtMs;
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

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  bool get _localCanAct {
    final String? localId = widget.state.playerId;
    if (localId == null) return false;
    final MatchTacticalState? tactical = widget.state.tactical;
    if (tactical == null) return false;
    if (!tactical.actorsWithOffensiveCharge.contains(localId)) return false;
    final int pulse = widget.state.localPlayer?.inventory?.dangerPulse ?? 0;
    return pulse > 0 && !_acted;
  }

  /// Client-side eligibility mirrors server rules (self / spectator / protected /
  /// consecutive-target). Snapshot `eligibleTargetIds` may be viewer-biased.
  List<String> _eligibleTargetsForLocal() {
    final PlayerPublic? local = widget.state.localPlayer;
    final String? localId = widget.state.playerId;
    if (local == null || localId == null) return const <String>[];
    final int round = widget.state.roundNumber;
    final String? lastTarget = local.lastDangerPulseTargetId;
    final List<String> out = <String>[];
    for (final PlayerPublic p in widget.state.players) {
      if (p.playerId == localId) continue;
      if (p.status != PlayerStatus.active) continue;
      final int? protectedThrough = p.protectedThroughRound;
      if (protectedThrough != null && protectedThrough >= round) continue;
      if (lastTarget == p.playerId) continue;
      out.add(p.playerId);
    }
    out.sort();
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final PlayerPublic? local = widget.state.localPlayer;
    final List<String> eligible = _eligibleTargetsForLocal();
    final bool canAct = _localCanAct;
    final bool noTargets = canAct && eligible.isEmpty;

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
                      resolver.resolve(TranslationKeys.powerActionTitle),
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    Text(
                      resolver.resolve('power.danger_pulse.name'),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              HeartsDisplay(hearts: local?.hearts ?? 0, maxHearts: 3),
            ],
          ),
          const SizedBox(height: 12),
          EnergyDisplay(energy: local?.energy ?? 0),
          const SizedBox(height: 28),
          CountdownRing(
            progress: _progress,
            label: '$_secondsLabel',
            size: 120,
          ),
          const SizedBox(height: 24),
          if (!canAct)
            Text(
              resolver.resolve(TranslationKeys.powerActionWaiting),
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: LhColors.textMuted,
              ),
              textAlign: TextAlign.center,
            )
          else if (noTargets) ...<Widget>[
            Text(
              resolver.resolve('power.no_targets'),
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                color: LhColors.warning,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              resolver.resolve('power.danger_pulse.explanation'),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: LhColors.textMuted,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            LhSecondaryButton(
              label: resolver.resolve(TranslationKeys.powerActionSkip),
              onPressed: _acted
                  ? null
                  : () {
                      setState(() => _acted = true);
                      widget.onSkip();
                    },
            ),
          ] else ...<Widget>[
            Text(
              resolver.resolve(TranslationKeys.powerActionChooseTarget),
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            for (final String targetId in eligible)
              _TargetRow(
                player: _playerFor(targetId),
                enabled: !_acted,
                onTap: () {
                  setState(() => _acted = true);
                  widget.onUseDangerPulse(targetId);
                },
              ),
            const SizedBox(height: 16),
            LhSecondaryButton(
              label: resolver.resolve(TranslationKeys.powerActionSkip),
              onPressed: _acted
                  ? null
                  : () {
                      setState(() => _acted = true);
                      widget.onSkip();
                    },
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  PlayerPublic? _playerFor(String playerId) {
    for (final PlayerPublic p in widget.state.players) {
      if (p.playerId == playerId) return p;
    }
    return null;
  }
}

class _TargetRow extends StatelessWidget {
  const _TargetRow({
    required this.player,
    required this.enabled,
    required this.onTap,
  });

  final PlayerPublic? player;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final String name = player?.displayName?.trim().isNotEmpty == true
        ? player!.displayName!.trim()
        : '—';
    final Color avatar = _parseColor(player?.avatarColor) ?? LhColors.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: LhColors.elevated,
        borderRadius: LhRadii.mdAll,
        child: InkWell(
          borderRadius: LhRadii.mdAll,
          onTap: enabled ? onTap : null,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              borderRadius: LhRadii.mdAll,
              border: Border.all(color: LhColors.border),
            ),
            child: Row(
              children: <Widget>[
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: avatar,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      name.isNotEmpty && name != '—'
                          ? name[0].toUpperCase()
                          : '?',
                      style: const TextStyle(
                        color: Colors.white,
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
                      HeartsDisplay(hearts: player?.hearts ?? 0),
                    ],
                  ),
                ),
                Icon(
                  Icons.bolt,
                  color: enabled ? LhColors.warning : LhColors.disabled,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Color? _parseColor(String? hex) {
    if (hex == null || hex.length != 7 || !hex.startsWith('#')) return null;
    final int? value = int.tryParse(hex.substring(1), radix: 16);
    if (value == null) return null;
    return Color(0xFF000000 | value);
  }
}
