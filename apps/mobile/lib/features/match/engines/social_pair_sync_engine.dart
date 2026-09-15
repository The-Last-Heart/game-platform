import 'dart:async';

import 'package:flutter/material.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../protocol/realtime_messages.dart';
import '../ui/widgets/challenge_countdown.dart';
import 'challenge_engine.dart';

class SocialPairSyncEngine implements ChallengeEngine {
  @override
  String get engineId => 'social.pair_sync';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _PairSyncWidget(challengeContext: challengeContext);
  }
}

class _PairSyncWidget extends StatefulWidget {
  const _PairSyncWidget({required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_PairSyncWidget> createState() => _PairSyncWidgetState();
}

class _PairSyncWidgetState extends State<_PairSyncWidget>
    with TickerProviderStateMixin {
  /// Keep aligned with server SocialPairSyncEvaluator (75% of duration).
  static const double _minHoldRatio = 0.75;
  static const int _deadlineSuccessBufferMs = 120;

  bool _submitted = false;
  bool _holding = false;
  Stopwatch? _holdWatch;
  Timer? _holdTimer;
  DateTime _lastProgressEmit = DateTime.fromMillisecondsSinceEpoch(0);

  late final AnimationController _glowPulse;

  Map<String, dynamic> get _cfg =>
      widget.challengeContext.challenge.clientConfig;

  bool get _isParticipant {
    final Object? flag = _cfg['isParticipant'];
    if (flag is bool) return flag;
    // Legacy fallback: any pair map means this seat was in a shared broadcast.
    final Object? raw = _cfg['pairAssignments'];
    return raw is Map && raw.isNotEmpty;
  }

  String? get _partnerPlayerId {
    final Object? raw = _cfg['partnerPlayerId'];
    return raw is String && raw.isNotEmpty ? raw : null;
  }

  String? get _partnerDisplayName {
    final Object? overlay = _cfg['partnerDisplayName'];
    if (overlay is String && overlay.trim().isNotEmpty) return overlay.trim();
    final String? partnerId = _partnerPlayerId;
    if (partnerId == null) return null;
    for (final PlayerPublic p in widget.challengeContext.players) {
      if (p.playerId == partnerId) {
        final String? name = p.displayName?.trim();
        if (name != null && name.isNotEmpty) return name;
      }
    }
    return null;
  }

  double get _syncWindowSec {
    final num? ms = _cfg['syncWindowMs'] as num?;
    return ((ms?.toDouble() ?? 500) / 1000.0);
  }

  int get _durationMs {
    final int raw = widget.challengeContext.challenge.durationMs;
    return raw.clamp(1, 60000);
  }

  int get _heldMs => _holdWatch?.elapsedMilliseconds ?? 0;

  PlayerPublic? get _localPlayer {
    final String? id = widget.challengeContext.localPlayerId;
    if (id == null) return null;
    for (final PlayerPublic p in widget.challengeContext.players) {
      if (p.playerId == id) return p;
    }
    return null;
  }

  PlayerPublic? get _partnerPlayer {
    final String? id = _partnerPlayerId;
    if (id == null) return null;
    for (final PlayerPublic p in widget.challengeContext.players) {
      if (p.playerId == id) return p;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _glowPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 680),
    );
  }

  @override
  void dispose() {
    _holdTimer?.cancel();
    _glowPulse.dispose();
    super.dispose();
  }

  void _onPointerDown(PointerDownEvent event) {
    if (widget.challengeContext.isInteractionLocked || _submitted || _holding) {
      return;
    }
    setState(() => _holding = true);
    _holdWatch = Stopwatch()..start();
    unawaited(_glowPulse.repeat(reverse: true));
    _holdTimer?.cancel();
    _holdTimer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      _onHoldTick();
    });
  }

  void _onPointerUp() {
    if (!_holding || _submitted) return;
    final int heldMs = _heldMs;
    _endHoldAnimation();
    _submitEarlyRelease(heldMs: heldMs);
  }

  void _endHoldAnimation() {
    _holdTimer?.cancel();
    _holdTimer = null;
    _holdWatch?.stop();
    _glowPulse.stop();
    _glowPulse.reset();
    _holding = false;
  }

  void _onHoldTick() {
    if (!_holding || _submitted) return;

    final int heldMs = _heldMs;
    final int minHoldMs = (_durationMs * _minHoldRatio).round();
    final int preferSubmitMs = (_durationMs * 0.9).round();

    // Interaction lock (ACK in flight / confirmed) must not count as an early
    // release while the player is still holding toward a valid sync.
    if (widget.challengeContext.isInteractionLocked) {
      if (heldMs >= minHoldMs) {
        _submitSuccess(heldMs: heldMs);
      }
      return;
    }

    final int nowMs = widget.challengeContext.estimateServerNowMs();
    if (nowMs <= 0) {
      _emitProgress(heldMs: heldMs);
      return;
    }

    final int remainingMs =
        widget.challengeContext.challenge.deadlineAtMs - nowMs;

    // Only finalize once the server min-hold is met — never "succeed" early
    // near the deadline with a short press (that caused one-sided wins).
    if (heldMs >= minHoldMs &&
        (remainingMs < _deadlineSuccessBufferMs || heldMs >= preferSubmitMs)) {
      _submitSuccess(heldMs: heldMs);
      return;
    }

    _emitProgress(heldMs: heldMs);
    if (mounted) setState(() {});
  }

  void _emitProgress({required int heldMs}) {
    final DateTime now = DateTime.now();
    if (now.difference(_lastProgressEmit) < const Duration(milliseconds: 120)) {
      return;
    }
    _lastProgressEmit = now;
    widget.challengeContext.onSubmit(<String, dynamic>{
      'synced': true,
      'heldMs': heldMs,
      'final': false,
    });
  }

  void _submitSuccess({required int heldMs}) {
    if (_submitted) return;
    _submitted = true;
    _endHoldAnimation();
    if (mounted) setState(() {});
    widget.challengeContext.onSubmit(<String, dynamic>{
      'synced': true,
      'heldMs': heldMs,
      'final': true,
    });
  }

  void _submitEarlyRelease({required int heldMs}) {
    if (_submitted) return;
    _submitted = true;
    if (mounted) setState(() {});
    widget.challengeContext.onSubmit(<String, dynamic>{
      'synced': false,
      'releasedEarly': true,
      'heldMs': heldMs,
      'final': true,
    });
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    if (!_isParticipant) {
      return _WaitingForPairScreen(resolver: resolver);
    }

    final String? partnerName = _partnerDisplayName;
    final String prompt = partnerName == null
        ? resolver.resolve('challenge.pair_sync.prompt')
        : resolver.resolve(
            'challenge.pair_sync.prompt_with_partner',
            params: <String, String>{'name': partnerName},
          );

    final PlayerPublic? local = _localPlayer;
    final PlayerPublic? partner = _partnerPlayer;
    final bool partnerReady = partner?.submittedForCurrentChallenge == true;
    final bool interactionLocked =
        widget.challengeContext.isInteractionLocked || _submitted;

    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            ChallengeCountdown(
              challenge: widget.challengeContext.challenge,
              estimateServerNowMs: widget.challengeContext.estimateServerNowMs,
              size: 132,
              ringColor: LhColors.success,
            ),
            const SizedBox(height: 20),
            TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: 1),
              duration: const Duration(milliseconds: 320),
              curve: Curves.easeOut,
              builder: (BuildContext context, double t, Widget? child) {
                return Opacity(
                  opacity: t,
                  child: Transform.translate(
                    offset: Offset(0, (1 - t) * 10),
                    child: child,
                  ),
                );
              },
              child: Text(
                prompt,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                _AvatarChip(
                  label: partnerName ??
                      resolver.resolve('challenge.pair_sync.partner_label'),
                  initial: _initial(partnerName),
                  color: _avatarColor(partner),
                  status: partnerReady
                      ? resolver.resolve('challenge.pair_sync.status_ready')
                      : resolver.resolve('challenge.pair_sync.status_waiting'),
                  statusReady: partnerReady,
                ),
                Expanded(
                  child: Container(
                    height: 2,
                    margin: const EdgeInsets.symmetric(horizontal: 12),
                    color: LhColors.success.withValues(alpha: 0.55),
                  ),
                ),
                _AvatarChip(
                  label: resolver.resolve('challenge.pair_sync.you_label'),
                  initial: _initial(local?.displayName),
                  color: _avatarColor(local),
                  status: _submitted
                      ? resolver.resolve('challenge.pair_sync.status_ready')
                      : resolver.resolve(
                          'challenge.pair_sync.status_waiting_you',
                        ),
                  statusReady: _submitted,
                ),
              ],
            ),
            const SizedBox(height: 32),
            AnimatedBuilder(
              animation: _glowPulse,
              builder: (BuildContext context, Widget? child) {
                final double pulse = _holding ? _glowPulse.value : 0.0;
                final double scale = _holding ? 0.96 + pulse * 0.06 : 1.0;
                final double glowAlpha =
                    _holding ? 0.38 + pulse * 0.42 : 0.45;
                final double blurRadius = _holding ? 16 + pulse * 16 : 18;
                final double spreadRadius = _holding ? 1 + pulse * 2 : 1;

                return Transform.scale(
                  scale: scale,
                  child: SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(18),
                        boxShadow: <BoxShadow>[
                          BoxShadow(
                            color: LhColors.success.withValues(alpha: glowAlpha),
                            blurRadius: blurRadius,
                            spreadRadius: spreadRadius,
                          ),
                        ],
                        gradient: LinearGradient(
                          colors: _holding
                              ? const <Color>[
                                  Color(0xFF3DF0FA),
                                  Color(0xFF18D4E0),
                                ]
                              : const <Color>[
                                  Color(0xFF22E7F2),
                                  Color(0xFF14C8D4),
                                ],
                        ),
                      ),
                      child: child,
                    ),
                  ),
                );
              },
              child: Listener(
                behavior: HitTestBehavior.opaque,
                onPointerDown: interactionLocked ? null : _onPointerDown,
                onPointerUp: interactionLocked ? null : (_) => _onPointerUp(),
                onPointerCancel:
                    interactionLocked ? null : (_) => _onPointerUp(),
                child: Center(
                  child: Text(
                    resolver.resolve('challenge.pair_sync.action_hold'),
                    style: const TextStyle(
                      color: Color(0xFF031018),
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              resolver.resolve(
                'challenge.pair_sync.allowed_delta',
                params: <String, String>{
                  'seconds': _syncWindowSec == 0.5
                      ? resolver.resolve('challenge.pair_sync.half_second')
                      : _syncWindowSec.toStringAsFixed(1),
                },
              ),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: LhColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _initial(String? name) {
    final String trimmed = (name ?? '').trim();
    if (trimmed.isEmpty) return '?';
    return String.fromCharCodes(trimmed.runes.take(1));
  }

  Color _avatarColor(PlayerPublic? player) {
    if (player?.avatarColor != null) {
      final String raw = player!.avatarColor!;
      if (raw.startsWith('#') && raw.length == 7) {
        final int? v = int.tryParse(raw.substring(1), radix: 16);
        if (v != null) return Color(0xFF000000 | v);
      }
    }
    final int index = player == null
        ? 0
        : player.playerId.hashCode.abs() % kPlayerAvatarColors.length;
    return kPlayerAvatarColors[index];
  }
}

class _WaitingForPairScreen extends StatelessWidget {
  const _WaitingForPairScreen({required this.resolver});

  final TranslationResolver resolver;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.hourglass_top_rounded,
              size: 56,
              color: LhColors.success.withValues(alpha: 0.85),
            ),
            const SizedBox(height: 18),
            Text(
              resolver.resolve('challenge.pair_sync.waiting_pair'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 10),
            Text(
              resolver.resolve('challenge.pair_sync.waiting_pair_hint'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: LhColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AvatarChip extends StatelessWidget {
  const _AvatarChip({
    required this.label,
    required this.initial,
    required this.color,
    required this.status,
    required this.statusReady,
  });

  final String label;
  final String initial;
  final Color color;
  final String status;
  final bool statusReady;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Container(
          width: 64,
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withValues(alpha: 0.85),
            border: Border.all(color: LhColors.success.withValues(alpha: 0.5)),
          ),
          child: Text(
            initial,
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          status,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: statusReady ? LhColors.success : LhColors.text,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
