import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../content/content_asset_cache.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'challenge_engine.dart';
import 'cipher_symbols.dart';

/// Decode the Word — فكّ الشفرة (`trivia.symbol_cipher_word`).
///
/// Binding visual: Image A mockup. Background: content-pack
/// `symbol_cipher_word.background` (Image B). Correctness is server-only.
class SymbolCipherWordEngine implements ChallengeEngine {
  @override
  String get engineId => 'trivia.symbol_cipher_word';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _SymbolCipherWordWidget(
      key: ValueKey<String>(challengeContext.challenge.challengeInstanceId),
      challengeContext: challengeContext,
    );
  }
}

class _KeyMapping {
  const _KeyMapping({required this.symbolId, required this.letter});
  final CipherSymbolId symbolId;
  final String letter;
}

class _SymbolCipherWordWidget extends StatefulWidget {
  const _SymbolCipherWordWidget({
    super.key,
    required this.challengeContext,
  });

  final ChallengeContext challengeContext;

  @override
  State<_SymbolCipherWordWidget> createState() =>
      _SymbolCipherWordWidgetState();
}

class _SymbolCipherWordWidgetState extends State<_SymbolCipherWordWidget>
    with TickerProviderStateMixin {
  static final Set<String> _seenChallenges = <String>{};

  static const Color _cream = Color(0xFFF5F0E6);

  late final AnimationController _entrance;
  late final AnimationController _result;
  late final Ticker _ticker;
  late final ValueNotifier<double> _time;

  String? _pendingKey;
  String? _selectedKey;
  String? _pressedKey;
  bool _disposed = false;
  bool _reconnect = false;
  File? _bgFile;
  bool _bgFailed = false;
  bool _illuminateEncoded = false;

  ChallengeContext get _ctx => widget.challengeContext;
  Map<String, dynamic> get _cfg => _ctx.challenge.clientConfig;

  bool get _reduceMotion {
    try {
      return MediaQuery.disableAnimationsOf(context);
    } catch (_) {
      return false;
    }
  }

  String get _backgroundAssetId {
    final Object? raw = _cfg['backgroundAssetId'];
    if (raw is String && raw.trim().isNotEmpty) return raw.trim();
    return 'symbol_cipher_word.background';
  }

  List<_KeyMapping> get _keyMappings {
    final Object? raw = _cfg['keyMappings'];
    if (raw is! List) return const <_KeyMapping>[];
    final List<_KeyMapping> out = <_KeyMapping>[];
    for (final Object? item in raw) {
      if (item is! Map) continue;
      final CipherSymbolId? id = item['symbolId'] is String
          ? CipherSymbolId.tryParse(item['symbolId'] as String)
          : null;
      final String letter =
          item['letter'] is String ? item['letter'] as String : '';
      if (id == null || letter.isEmpty) continue;
      out.add(_KeyMapping(symbolId: id, letter: letter));
    }
    return out;
  }

  List<CipherSymbolId> get _encodedSymbols {
    final Object? raw = _cfg['encodedSymbols'];
    if (raw is! List) return const <CipherSymbolId>[];
    final List<CipherSymbolId> out = <CipherSymbolId>[];
    for (final Object? item in raw) {
      if (item is! String) continue;
      final CipherSymbolId? id = CipherSymbolId.tryParse(item);
      if (id != null) out.add(id);
    }
    return out;
  }

  List<String> get _optionKeys {
    final Object? raw = _cfg['optionKeys'];
    if (raw is List) {
      return raw.whereType<String>().toList(growable: false);
    }
    return const <String>[];
  }

  String? _optionText(String key) {
    final Object? raw = _cfg['optionTexts'];
    if (raw is Map && raw[key] is String) return raw[key] as String;
    return null;
  }

  String _resolved(
    TranslationResolver resolver,
    String key,
    Object? pinned,
  ) {
    if (pinned is String && pinned.trim().isNotEmpty) return pinned;
    if (key.isEmpty) return '';
    return resolver.resolve(key);
  }

  @override
  void initState() {
    super.initState();
    _reconnect = _seenChallenges.contains(_ctx.challenge.challengeInstanceId);
    _seenChallenges.add(_ctx.challenge.challengeInstanceId);
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _result = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 750),
    );
    _time = ValueNotifier<double>(0);
    _ticker = createTicker((Duration elapsed) {
      if (_disposed) return;
      _time.value = elapsed.inMilliseconds / 1000.0;
    })..start();
    if (_reconnect) {
      _entrance.value = 1;
    } else {
      _entrance.forward();
    }
    unawaited(_loadBackground());
  }

  Future<void> _loadBackground() async {
    final String assetId = _backgroundAssetId;
    final File? file = await ContentAssetCache.instance.ensureAsset(assetId);
    if (_disposed || !mounted) return;
    setState(() {
      _bgFile = file;
      _bgFailed = file == null;
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_reduceMotion && !_reconnect && _entrance.value < 1) {
      _entrance.value = 1;
    }
  }

  @override
  void didUpdateWidget(covariant _SymbolCipherWordWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    final AnswerSubmissionStatus prev = oldWidget.challengeContext.answerStatus;
    final AnswerSubmissionStatus next = _ctx.answerStatus;
    if (prev == AnswerSubmissionStatus.pending &&
        next == AnswerSubmissionStatus.confirmed) {
      _pendingKey = null;
    }
    final String? outcome = _ctx.localOutcome;
    if (outcome != null && !_result.isAnimating && _result.value == 0) {
      if (outcome == 'success') {
        _illuminateEncoded = true;
        unawaited(HapticFeedback.mediumImpact());
      } else {
        unawaited(HapticFeedback.heavyImpact());
      }
      if (_reduceMotion) {
        _result.value = 1;
      } else {
        _result.forward(from: 0);
      }
    }
    // Stale updates must not regress a confirmed selection.
    if (next == AnswerSubmissionStatus.confirmed &&
        _selectedKey != null &&
        _pendingKey != null) {
      _pendingKey = null;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _ticker.dispose();
    _entrance.dispose();
    _result.dispose();
    _time.dispose();
    super.dispose();
  }

  void _onSelect(String optionKey) {
    if (_ctx.isInteractionLocked || _pendingKey != null) return;
    setState(() {
      _pressedKey = null;
      _pendingKey = optionKey;
      _selectedKey = optionKey;
    });
    unawaited(HapticFeedback.selectionClick());
    _ctx.onSubmit(<String, dynamic>{'chosenOptionKey': optionKey});
  }

  double _phase(double start, double end) {
    final double t = _entrance.value;
    if (t <= start) return 0;
    if (t >= end) return 1;
    return ((t - start) / (end - start)).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final String title = _resolved(
      resolver,
      (_cfg['titleKey'] as String?) ?? '',
      _cfg['titleText'] ?? 'فكّ الشفرة',
    );
    final String instruction = _resolved(
      resolver,
      (_cfg['promptKey'] as String?) ?? '',
      _cfg['instructionText'] ?? 'استخدم المفتاح لاكتشاف الكلمة',
    );
    final List<_KeyMapping> keys = _keyMappings;
    final List<CipherSymbolId> encoded = _encodedSymbols;
    final List<String> options = _optionKeys;
    final String? outcome = _ctx.localOutcome;
    final bool timedOut = outcome == 'timeout';
    final bool success = outcome == 'success';
    final bool incorrect =
        outcome != null && outcome != 'success' && outcome != 'timeout';

    return LayoutBuilder(
      builder: (BuildContext context, BoxConstraints constraints) {
        final double maxW = math.min(constraints.maxWidth, 420);
        final double scale = (maxW / 390).clamp(0.78, 1.12);
        // ChallengePlayView overlays match HUD (hearts / energy / round).
        // MatchShell already applies SafeArea — clear the header, then center.
        const double matchHeaderClearance = 56;
        final double sidePad = 14 * scale;
        final double gridGap = 10 * scale;
        final double gridInnerW = maxW - sidePad * 2;
        final double cellW = (gridInnerW - gridGap) / 2;
        const double cellAspect = 2.15;
        final double answerGridH = 2 * (cellW / cellAspect) + gridGap;

        return Stack(
          fit: StackFit.expand,
          children: <Widget>[
            _BackgroundLayer(
              file: _bgFile,
              failed: _bgFailed,
              entrance: _reconnect || _reduceMotion ? 1 : _phase(0.0, 0.25),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(
                0,
                matchHeaderClearance,
                0,
                8 * scale,
              ),
              child: Align(
                alignment: Alignment.center,
                child: SizedBox(
                  width: maxW,
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: sidePad),
                    child: AnimatedBuilder(
                      animation: Listenable.merge(<Listenable>[
                        _entrance,
                        _result,
                        _time,
                      ]),
                      builder: (BuildContext context, Widget? child) {
                        final double breath =
                            _reduceMotion ? 0 : math.sin(_time.value * 1.2);
                        final Widget column = Column(
                          mainAxisSize: MainAxisSize.min,
                          children: <Widget>[
                            _fadeSlide(
                              progress: _phase(0.08, 0.28),
                              child: _TimerPanel(
                                challenge: _ctx.challenge,
                                estimateServerNowMs:
                                    _ctx.estimateServerNowMs,
                                time: _time.value,
                                scale: scale,
                              ),
                            ),
                            SizedBox(height: 10 * scale),
                            _fadeScale(
                              progress: _phase(0.18, 0.42),
                              child: _GoldTitle(text: title, scale: scale),
                            ),
                            SizedBox(height: 6 * scale),
                            _fadeSlide(
                              progress: _phase(0.28, 0.45),
                              child: _OrnamentalDivider(scale: scale),
                            ),
                            SizedBox(height: 6 * scale),
                            _fadeSlide(
                              progress: _phase(0.34, 0.52),
                              child: Semantics(
                                label: instruction,
                                child: Text(
                                  instruction,
                                  textAlign: TextAlign.center,
                                  textDirection: TextDirection.rtl,
                                  style: TextStyle(
                                    color: _cream.withValues(alpha: 0.92),
                                    fontSize: 13.5 * scale,
                                    height: 1.35,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                            ),
                            SizedBox(height: 14 * scale),
                            _KeyRow(
                              mappings: keys,
                              scale: scale,
                              breath: breath,
                              reduceMotion: _reduceMotion,
                              phase: _phase(0.42, 0.72),
                            ),
                            SizedBox(height: 14 * scale),
                            _fadeScale(
                              progress: _phase(0.55, 0.78),
                              child: _EncodedPanel(
                                symbols: encoded,
                                scale: scale,
                                breath: breath,
                                time: _time.value,
                                illuminate: _illuminateEncoded,
                                dim: incorrect || timedOut,
                                reduceMotion: _reduceMotion,
                                resultT: _result.value,
                              ),
                            ),
                            SizedBox(height: 16 * scale),
                            SizedBox(
                              height: answerGridH,
                              child: _AnswerGrid(
                                optionKeys: options,
                                optionText: (String k) => _resolved(
                                  resolver,
                                  k,
                                  _optionText(k),
                                ),
                                scale: scale,
                                phase: _phase(0.62, 0.95),
                                reduceMotion: _reduceMotion,
                                pressedKey: _pressedKey,
                                pendingKey: _pendingKey,
                                selectedKey: _selectedKey,
                                success: success,
                                incorrect: incorrect,
                                timedOut: timedOut,
                                resultT: _result.value,
                                locked: _ctx.isInteractionLocked ||
                                    _pendingKey != null,
                                onPressDown: (String k) {
                                  if (_ctx.isInteractionLocked ||
                                      _pendingKey != null) {
                                    return;
                                  }
                                  setState(() => _pressedKey = k);
                                },
                                onPressUp: _onSelect,
                                onPressCancel: () =>
                                    setState(() => _pressedKey = null),
                              ),
                            ),
                          ],
                        );
                        // Center the block; scale down on short viewports
                        // (no scroll during timed play).
                        return FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.center,
                          child: SizedBox(
                            width: maxW - sidePad * 2,
                            child: column,
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _fadeSlide({required double progress, required Widget child}) {
    final double t = _reduceMotion ? 1 : Curves.easeOutCubic.transform(progress);
    return Opacity(
      opacity: t,
      child: Transform.translate(
        offset: Offset(0, (1 - t) * 12),
        child: child,
      ),
    );
  }

  Widget _fadeScale({required double progress, required Widget child}) {
    final double t = _reduceMotion ? 1 : Curves.easeOutBack.transform(progress);
    return Opacity(
      opacity: t.clamp(0.0, 1.0),
      child: Transform.scale(
        scale: 0.96 + 0.04 * t,
        child: child,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

class _BackgroundLayer extends StatelessWidget {
  const _BackgroundLayer({
    required this.file,
    required this.failed,
    required this.entrance,
  });

  final File? file;
  final bool failed;
  final double entrance;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: entrance.clamp(0.0, 1.0),
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          if (file != null)
            FittedBox(
              fit: BoxFit.cover,
              alignment: const Alignment(0, -0.08),
              child: Image.file(
                file!,
                filterQuality: FilterQuality.high,
                gaplessPlayback: true,
              ),
            )
          else
            const ColoredBox(color: Color(0xFF050C18)),
          // Restrained readability scrim — does not flatten the scene.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: <Color>[
                  const Color(0xFF02060E).withValues(alpha: 0.28),
                  const Color(0xFF02060E).withValues(alpha: 0.12),
                  const Color(0xFF02060E).withValues(alpha: 0.38),
                ],
                stops: const <double>[0, 0.45, 1],
              ),
            ),
          ),
          if (failed)
            const Align(
              alignment: Alignment.bottomCenter,
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text(
                  '…',
                  style: TextStyle(color: Colors.white38, fontSize: 12),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

class _TimerPanel extends StatelessWidget {
  const _TimerPanel({
    required this.challenge,
    required this.estimateServerNowMs,
    required this.time,
    required this.scale,
  });

  final PublicChallenge challenge;
  final int Function() estimateServerNowMs;
  final double time;
  final double scale;

  @override
  Widget build(BuildContext context) {
    final int now = estimateServerNowMs();
    final int remainingMs =
        math.max(0, challenge.deadlineAtMs - now);
    final int totalSec = (remainingMs / 1000).ceil();
    final int mm = totalSec ~/ 60;
    final int ss = totalSec % 60;
    final String digits =
        '${mm.toString().padLeft(2, '0')}:${ss.toString().padLeft(2, '0')}';
    final double sweep = (time * 0.18) % 1.0;

    return Semantics(
      label: 'الوقت المتبقي $digits',
      child: CustomPaint(
        painter: _TimerFramePainter(sweep: sweep),
        child: Container(
          width: 148 * scale,
          padding: EdgeInsets.symmetric(
            horizontal: 14 * scale,
            vertical: 8 * scale,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                'الوقت المتبقي',
                textDirection: TextDirection.rtl,
                style: TextStyle(
                  color: const Color(0xFFF5F0E6).withValues(alpha: 0.85),
                  fontSize: 11 * scale,
                  fontWeight: FontWeight.w500,
                ),
              ),
              SizedBox(height: 2 * scale),
              Directionality(
                textDirection: TextDirection.ltr,
                child: Text(
                  digits,
                  style: TextStyle(
                    color: const Color(0xFF9AF6FF),
                    fontSize: 26 * scale,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                    shadows: <Shadow>[
                      Shadow(
                        color: const Color(0xFF3DE8FF).withValues(alpha: 0.55),
                        blurRadius: 10,
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimerFramePainter extends CustomPainter {
  _TimerFramePainter({required this.sweep});
  final double sweep;

  @override
  void paint(Canvas canvas, Size size) {
    final RRect rrect = RRect.fromRectAndRadius(
      Offset.zero & size,
      Radius.circular(size.height * 0.35),
    );
    final Paint fill = Paint()
      ..color = const Color(0xFF07101C).withValues(alpha: 0.82);
    canvas.drawRRect(rrect, fill);

    final Paint gold = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..shader = LinearGradient(
        colors: <Color>[
          const Color(0xFF8A6A28),
          const Color(0xFFF6E39A),
          const Color(0xFF8A6A28),
        ],
        stops: <double>[
          (sweep - 0.2).clamp(0.0, 1.0),
          sweep,
          (sweep + 0.2).clamp(0.0, 1.0),
        ],
      ).createShader(Offset.zero & size);
    canvas.drawRRect(rrect, gold);

    final Paint diamond = Paint()..color = const Color(0xFFE0C15A);
    void drawDiamond(Offset c) {
      final Path p = Path()
        ..moveTo(c.dx, c.dy - 3.5)
        ..lineTo(c.dx + 3, c.dy)
        ..lineTo(c.dx, c.dy + 3.5)
        ..lineTo(c.dx - 3, c.dy)
        ..close();
      canvas.drawPath(p, diamond);
    }

    drawDiamond(Offset(size.width / 2, 1.5));
    drawDiamond(Offset(size.width / 2, size.height - 1.5));
  }

  @override
  bool shouldRepaint(covariant _TimerFramePainter oldDelegate) =>
      oldDelegate.sweep != sweep;
}

// ---------------------------------------------------------------------------
// Title / divider
// ---------------------------------------------------------------------------

class _GoldTitle extends StatelessWidget {
  const _GoldTitle({required this.text, required this.scale});
  final String text;
  final double scale;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      header: true,
      label: text,
      child: ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (Rect bounds) {
          return const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: <Color>[
              Color(0xFFFFF3C2),
              Color(0xFFE0C15A),
              Color(0xFFB8892E),
            ],
          ).createShader(bounds);
        },
        child: Text(
          text,
          textAlign: TextAlign.center,
          textDirection: TextDirection.rtl,
          style: TextStyle(
            fontSize: 34 * scale,
            fontWeight: FontWeight.w800,
            height: 1.15,
            shadows: const <Shadow>[
              Shadow(color: Color(0x66000000), blurRadius: 8, offset: Offset(0, 2)),
              Shadow(color: Color(0x55E0C15A), blurRadius: 14),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrnamentalDivider extends StatelessWidget {
  const _OrnamentalDivider({required this.scale});
  final double scale;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(160 * scale, 10 * scale),
      painter: _DividerPainter(),
    );
  }
}

class _DividerPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final Paint line = Paint()
      ..shader = LinearGradient(
        colors: <Color>[
          const Color(0x00E0C15A),
          const Color(0xFFE0C15A),
          const Color(0x00E0C15A),
        ],
      ).createShader(Offset.zero & size)
      ..strokeWidth = 1.1
      ..style = PaintingStyle.stroke;
    final double y = size.height / 2;
    canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
    final Path diamond = Path()
      ..moveTo(size.width / 2, y - 3.2)
      ..lineTo(size.width / 2 + 3.2, y)
      ..lineTo(size.width / 2, y + 3.2)
      ..lineTo(size.width / 2 - 3.2, y)
      ..close();
    canvas.drawPath(diamond, Paint()..color = const Color(0xFFF6E39A));
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ---------------------------------------------------------------------------
// Key row
// ---------------------------------------------------------------------------

class _KeyRow extends StatelessWidget {
  const _KeyRow({
    required this.mappings,
    required this.scale,
    required this.breath,
    required this.reduceMotion,
    required this.phase,
  });

  final List<_KeyMapping> mappings;
  final double scale;
  final double breath;
  final bool reduceMotion;
  final double phase;

  @override
  Widget build(BuildContext context) {
    // RTL Row: index 0 appears on the right — keep server logical order.
    final List<_KeyMapping> logical = cipherLogicalOrderForRtlRow(mappings);
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Row(
        children: <Widget>[
          for (int i = 0; i < logical.length; i++) ...<Widget>[
            if (i > 0) SizedBox(width: 6 * scale),
            Expanded(
              child: _stagger(
                index: i,
                child: _KeyCard(
                  mapping: logical[i],
                  style: cipherKeySlotStyle(i),
                  scale: scale,
                  breath: reduceMotion ? 0 : breath,
                  illuminate: phase > 0.55,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _stagger({required int index, required Widget child}) {
    if (reduceMotion) return child;
    final double start = (index * 0.08).clamp(0.0, 0.5);
    final double local = ((phase - start) / (1 - start)).clamp(0.0, 1.0);
    final double t = Curves.easeOutCubic.transform(local);
    return Opacity(
      opacity: t,
      child: Transform.translate(
        offset: Offset(0, (1 - t) * 10),
        child: child,
      ),
    );
  }
}

class _KeyCard extends StatelessWidget {
  const _KeyCard({
    required this.mapping,
    required this.style,
    required this.scale,
    required this.breath,
    required this.illuminate,
  });

  final _KeyMapping mapping;
  final CipherSymbolStyle style;
  final double scale;
  final double breath;
  final bool illuminate;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '${mapping.symbolId.semanticLabel} = ${mapping.letter}',
      child: AspectRatio(
        aspectRatio: 0.72,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(6 * scale),
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: <Color>[Color(0xFF0C1A2E), Color(0xFF07101C)],
            ),
            border: Border.all(
              color: const Color(0xFF3DE8FF).withValues(alpha: 0.55),
              width: 1,
            ),
            boxShadow: <BoxShadow>[
              BoxShadow(
                color: const Color(0xFF3DE8FF).withValues(alpha: 0.12),
                blurRadius: 8,
              ),
            ],
          ),
          child: ClipPath(
            clipper: _ClippedCornerClipper(6 * scale),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                CipherSymbolView(
                  symbolId: mapping.symbolId,
                  style: style,
                  size: 22 * scale,
                  glow: illuminate ? 0.7 : 0.25,
                  breath: breath,
                ),
                SizedBox(height: 4 * scale),
                Text(
                  mapping.letter,
                  textDirection: TextDirection.rtl,
                  style: TextStyle(
                    color: const Color(0xFFF5F0E6),
                    fontSize: 16 * scale,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ClippedCornerClipper extends CustomClipper<Path> {
  _ClippedCornerClipper(this.cut);
  final double cut;

  @override
  Path getClip(Size size) {
    final Path p = Path()
      ..moveTo(cut, 0)
      ..lineTo(size.width - cut, 0)
      ..lineTo(size.width, cut)
      ..lineTo(size.width, size.height - cut)
      ..lineTo(size.width - cut, size.height)
      ..lineTo(cut, size.height)
      ..lineTo(0, size.height - cut)
      ..lineTo(0, cut)
      ..close();
    return p;
  }

  @override
  bool shouldReclip(covariant _ClippedCornerClipper oldClipper) =>
      oldClipper.cut != cut;
}

// ---------------------------------------------------------------------------
// Encoded sequence panel
// ---------------------------------------------------------------------------

class _EncodedPanel extends StatelessWidget {
  const _EncodedPanel({
    required this.symbols,
    required this.scale,
    required this.breath,
    required this.time,
    required this.illuminate,
    required this.dim,
    required this.reduceMotion,
    required this.resultT,
  });

  final List<CipherSymbolId> symbols;
  final double scale;
  final double breath;
  final double time;
  final bool illuminate;
  final bool dim;
  final bool reduceMotion;
  final double resultT;

  @override
  Widget build(BuildContext context) {
    final double opacity = dim ? 0.45 + 0.2 * (1 - resultT) : 1.0;
    return Semantics(
      label: 'encoded sequence, ${symbols.length} symbols',
      child: Opacity(
        opacity: opacity.clamp(0.35, 1.0),
        child: CustomPaint(
          painter: _EncodedFramePainter(
            sweep: reduceMotion ? 0.35 : (time * 0.12) % 1.0,
            pulse: illuminate ? resultT : 0,
          ),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: 16 * scale,
              vertical: 18 * scale,
            ),
            // RTL: logical index 0 (first letter) is rightmost.
            child: Directionality(
              textDirection: TextDirection.rtl,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: <Widget>[
                  for (int i = 0; i < symbols.length; i++)
                    CipherSymbolView(
                      key: ValueKey<String>('enc-$i-${symbols[i].wireId}'),
                      symbolId: symbols[i],
                      style: cipherKeySlotStyle(i),
                      size: 34 * scale,
                      glow: illuminate
                          ? 0.55 + 0.45 * resultT
                          : 0.6 + (reduceMotion ? 0 : breath.abs() * 0.15),
                      breath: reduceMotion ? 0 : breath,
                      semanticLabel:
                          'symbol ${i + 1} ${symbols[i].semanticLabel}',
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _EncodedFramePainter extends CustomPainter {
  _EncodedFramePainter({required this.sweep, required this.pulse});
  final double sweep;
  final double pulse;

  @override
  void paint(Canvas canvas, Size size) {
    final RRect outer = RRect.fromRectAndRadius(
      Offset.zero & size,
      const Radius.circular(10),
    );
    canvas.drawRRect(
      outer,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[Color(0xE00A1628), Color(0xE0050C18)],
        ).createShader(Offset.zero & size),
    );

    final Paint border = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..shader = LinearGradient(
        colors: <Color>[
          Color.lerp(const Color(0xFF8A6A28), const Color(0xFFF6E39A), pulse)!,
          const Color(0xFFF6E39A),
          Color.lerp(const Color(0xFF8A6A28), const Color(0xFF3DE8FF), pulse)!,
        ],
        stops: <double>[
          (sweep - 0.25).clamp(0.0, 1.0),
          sweep,
          (sweep + 0.25).clamp(0.0, 1.0),
        ],
      ).createShader(Offset.zero & size);
    canvas.drawRRect(outer.deflate(1), border);
    canvas.drawRRect(
      outer.deflate(4),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8
        ..color = const Color(0xFFB8892E).withValues(alpha: 0.55),
    );

    final Paint diamond = Paint()..color = const Color(0xFFE0C15A);
    void drawDiamond(Offset c) {
      final Path p = Path()
        ..moveTo(c.dx, c.dy - 4)
        ..lineTo(c.dx + 3.5, c.dy)
        ..lineTo(c.dx, c.dy + 4)
        ..lineTo(c.dx - 3.5, c.dy)
        ..close();
      canvas.drawPath(p, diamond);
    }

    drawDiamond(Offset(size.width / 2, 2));
    drawDiamond(Offset(size.width / 2, size.height - 2));
  }

  @override
  bool shouldRepaint(covariant _EncodedFramePainter oldDelegate) =>
      oldDelegate.sweep != sweep || oldDelegate.pulse != pulse;
}

// ---------------------------------------------------------------------------
// Answer grid
// ---------------------------------------------------------------------------

class _AnswerGrid extends StatelessWidget {
  const _AnswerGrid({
    required this.optionKeys,
    required this.optionText,
    required this.scale,
    required this.phase,
    required this.reduceMotion,
    required this.pressedKey,
    required this.pendingKey,
    required this.selectedKey,
    required this.success,
    required this.incorrect,
    required this.timedOut,
    required this.resultT,
    required this.locked,
    required this.onPressDown,
    required this.onPressUp,
    required this.onPressCancel,
  });

  final List<String> optionKeys;
  final String Function(String key) optionText;
  final double scale;
  final double phase;
  final bool reduceMotion;
  final String? pressedKey;
  final String? pendingKey;
  final String? selectedKey;
  final bool success;
  final bool incorrect;
  final bool timedOut;
  final double resultT;
  final bool locked;
  final void Function(String key) onPressDown;
  final void Function(String key) onPressUp;
  final VoidCallback onPressCancel;

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: TextDirection.rtl,
      child: GridView.builder(
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 10 * scale,
          mainAxisSpacing: 10 * scale,
          childAspectRatio: 2.15,
        ),
        itemCount: optionKeys.length,
        itemBuilder: (BuildContext context, int index) {
          final String key = optionKeys[index];
          final double start = reduceMotion ? 0 : index * 0.06;
          final double local =
              ((phase - start) / math.max(0.01, 1 - start)).clamp(0.0, 1.0);
          final double t =
              reduceMotion ? 1 : Curves.easeOutCubic.transform(local);
          final bool selected = selectedKey == key;
          final bool pending = pendingKey == key;
          final bool isCorrect = success && selected;
          final bool isIncorrect = incorrect && selected;
          return Opacity(
            opacity: t,
            child: Transform.translate(
              offset: Offset(0, (1 - t) * 16),
              child: _AnswerButton(
                label: optionText(key),
                scale: scale,
                pressed: pressedKey == key,
                pending: pending,
                selected: selected,
                correct: isCorrect,
                incorrect: isIncorrect,
                timedOut: timedOut,
                resultT: resultT,
                enabled: !locked,
                dimmed: locked && !selected,
                onTapDown: () => onPressDown(key),
                onTapUp: () => onPressUp(key),
                onTapCancel: onPressCancel,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _AnswerButton extends StatelessWidget {
  const _AnswerButton({
    required this.label,
    required this.scale,
    required this.pressed,
    required this.pending,
    required this.selected,
    required this.correct,
    required this.incorrect,
    required this.timedOut,
    required this.resultT,
    required this.enabled,
    required this.dimmed,
    required this.onTapDown,
    required this.onTapUp,
    required this.onTapCancel,
  });

  final String label;
  final double scale;
  final bool pressed;
  final bool pending;
  final bool selected;
  final bool correct;
  final bool incorrect;
  final bool timedOut;
  final double resultT;
  final bool enabled;
  final bool dimmed;
  final VoidCallback onTapDown;
  final VoidCallback onTapUp;
  final VoidCallback onTapCancel;

  @override
  Widget build(BuildContext context) {
    final bool highlighted = (selected || pending) && !incorrect && !timedOut;
    Color border = const Color(0xFFE0C15A).withValues(alpha: 0.75);
    Color fillTop = const Color(0xFF0C1A2E);
    Color fillBottom = const Color(0xFF060E1A);
    Color motif = const Color(0xFF3DE8FF).withValues(alpha: 0.25);
    Color textColor = const Color(0xFFF5F0E6);
    double shake = 0;
    double glow = 0.18;

    if (highlighted) {
      // Solid cyan fill — same language as common-word / audio MC so the
      // player's choice is obvious on the dark library background.
      border = const Color(0xFFB8FBFF);
      fillTop = const Color(0xFF4DF0FF);
      fillBottom = const Color(0xFF22E7F2);
      motif = const Color(0xFF03141C).withValues(alpha: 0.35);
      textColor = const Color(0xFF03141C);
      glow = pending ? 0.7 : 0.55;
    }
    if (correct) {
      border = Color.lerp(
        const Color(0xFFFFFFFF),
        const Color(0xFF7DFFC4),
        resultT,
      )!;
      fillTop = Color.lerp(
        fillTop,
        const Color(0xFF7DFFC4),
        resultT,
      )!;
      fillBottom = Color.lerp(
        fillBottom,
        const Color(0xFF22E7F2),
        resultT,
      )!;
      motif = const Color(0xFF03141C).withValues(alpha: 0.35);
      textColor = const Color(0xFF03141C);
      glow = 0.7;
    }
    if (incorrect) {
      border = Color.lerp(
        const Color(0xFFE0C15A),
        const Color(0xFFE07A4A),
        resultT,
      )!;
      fillTop = Color.lerp(
        const Color(0xFF0C1A2E),
        const Color(0xFF2A140C),
        resultT,
      )!;
      fillBottom = Color.lerp(
        const Color(0xFF060E1A),
        const Color(0xFF1A0C08),
        resultT,
      )!;
      motif = Color.lerp(
        const Color(0xFF3DE8FF).withValues(alpha: 0.25),
        const Color(0xFFE07A4A).withValues(alpha: 0.55),
        resultT,
      )!;
      textColor = const Color(0xFFF5F0E6);
      shake = math.sin(resultT * math.pi * 6) * 3 * (1 - resultT);
      glow = 0.35;
    }
    if (timedOut && selected) {
      border = border.withValues(alpha: 0.45);
      glow = 0.1;
    }
    if (dimmed) {
      border = border.withValues(alpha: 0.35);
      fillTop = fillTop.withValues(alpha: 0.55);
      fillBottom = fillBottom.withValues(alpha: 0.55);
      motif = motif.withValues(alpha: 0.12);
      textColor = textColor.withValues(alpha: 0.45);
      glow = 0.06;
    }

    String state = 'idle';
    if (pending) state = 'pending';
    if (selected && !pending && !correct && !incorrect) state = 'selected';
    if (correct) state = 'correct';
    if (incorrect) state = 'incorrect';
    if (timedOut) state = 'timeout';

    return Semantics(
      button: true,
      label: label,
      selected: selected || pending,
      enabled: enabled,
      value: state,
      child: GestureDetector(
        onTapDown: enabled ? (_) => onTapDown() : null,
        onTapUp: enabled ? (_) => onTapUp() : null,
        onTapCancel: enabled ? onTapCancel : null,
        child: Transform.translate(
          offset: Offset(shake, 0),
          child: AnimatedScale(
            scale: pressed ? 0.97 : 1,
            duration: const Duration(milliseconds: 90),
            curve: Curves.easeOut,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              curve: Curves.easeOut,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8 * scale),
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: <Color>[fillTop, fillBottom],
                ),
                border: Border.all(
                  color: border,
                  width: highlighted || correct ? 2.2 : 1.4,
                ),
                boxShadow: <BoxShadow>[
                  BoxShadow(
                    color: border.withValues(alpha: glow),
                    blurRadius: highlighted || correct ? 18 : 8,
                    spreadRadius: highlighted ? 0.6 : 0,
                  ),
                ],
              ),
              child: Stack(
                children: <Widget>[
                  Positioned.fill(
                    child: CustomPaint(
                      painter: _CornerMotifPainter(color: motif),
                    ),
                  ),
                  Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8 * scale),
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        textDirection: TextDirection.rtl,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: textColor,
                          fontSize: 18 * scale,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CornerMotifPainter extends CustomPainter {
  _CornerMotifPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint p = Paint()
      ..color = color
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    const double m = 7;
    canvas.drawLine(const Offset(m, 2), const Offset(2, 2), p);
    canvas.drawLine(const Offset(2, 2), const Offset(2, m), p);
    canvas.drawLine(Offset(size.width - m, 2), Offset(size.width - 2, 2), p);
    canvas.drawLine(Offset(size.width - 2, 2), Offset(size.width - 2, m), p);
    canvas.drawLine(
      Offset(m, size.height - 2),
      Offset(2, size.height - 2),
      p,
    );
    canvas.drawLine(
      Offset(2, size.height - 2),
      Offset(2, size.height - m),
      p,
    );
    canvas.drawLine(
      Offset(size.width - m, size.height - 2),
      Offset(size.width - 2, size.height - 2),
      p,
    );
    canvas.drawLine(
      Offset(size.width - 2, size.height - 2),
      Offset(size.width - 2, size.height - m),
      p,
    );
  }

  @override
  bool shouldRepaint(covariant _CornerMotifPainter oldDelegate) =>
      oldDelegate.color != color;
}
