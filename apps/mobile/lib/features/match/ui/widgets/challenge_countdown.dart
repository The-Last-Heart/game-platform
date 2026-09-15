import 'dart:async';

import 'package:flutter/material.dart';

import '../../protocol/realtime_messages.dart';
import 'countdown_ring.dart';

/// Server-time challenge countdown ring (never uses DateTime.now()).
class ChallengeCountdown extends StatefulWidget {
  const ChallengeCountdown({
    required this.challenge,
    required this.estimateServerNowMs,
    this.size = 120,
    this.ringColor,
    this.glow = true,
    this.deadlineOverrideMs,
    super.key,
  });

  final PublicChallenge challenge;
  final int Function() estimateServerNowMs;
  final double size;
  final Color? ringColor;
  final bool glow;

  /// Optional alternate deadline (e.g. memory preview end).
  final int? deadlineOverrideMs;

  @override
  State<ChallengeCountdown> createState() => _ChallengeCountdownState();
}

class _ChallengeCountdownState extends State<ChallengeCountdown> {
  Timer? _timer;
  double _progress = 1;
  String _label = '0.0';

  @override
  void initState() {
    super.initState();
    _tick();
    _timer = Timer.periodic(const Duration(milliseconds: 50), (_) => _tick());
  }

  @override
  void didUpdateWidget(covariant ChallengeCountdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.challenge.challengeInstanceId !=
            widget.challenge.challengeInstanceId ||
        oldWidget.deadlineOverrideMs != widget.deadlineOverrideMs) {
      _tick();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _tick() {
    final int nowMs = widget.estimateServerNowMs();
    if (nowMs <= 0) return;
    final int deadline =
        widget.deadlineOverrideMs ?? widget.challenge.deadlineAtMs;
    final int startsAt = widget.challenge.startsAtMs;
    final int durationMs = (deadline - startsAt).clamp(1, 60000);
    final double prog = 1.0 - ((nowMs - startsAt) / durationMs);
    final double remaining = ((deadline - nowMs) / 1000.0).clamp(0.0, 99.0);
    if (!mounted) return;
    setState(() {
      _progress = prog.clamp(0.0, 1.0);
      _label = remaining.toStringAsFixed(1);
    });
  }

  @override
  Widget build(BuildContext context) {
    return CountdownRing(
      progress: _progress,
      label: _label,
      size: widget.size,
      ringColor: widget.ringColor,
      glow: widget.glow,
    );
  }
}
