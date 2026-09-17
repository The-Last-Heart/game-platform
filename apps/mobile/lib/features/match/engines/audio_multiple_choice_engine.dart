import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../l10n/app_localization.dart';
import '../../../l10n/translation_resolver.dart';
import '../../../theme/lh_tokens.dart';
import '../../content/content_asset_cache.dart';
import '../protocol/realtime_messages.dart';
import '../state/match_snapshot.dart';
import 'audio_visualization.dart';
import 'challenge_engine.dart';

const Color _cyan = Color(0xFF22E7F2);
const Color _cyanSoft = Color(0xFF4DF0FF);
const Color _navyDeep = Color(0xFF020814);
const Color _purple = Color(0xFF6B5CFF);
const Color _amber = Color(0xFFFF8A4C);

const Set<String> _audioTrackQuestionTexts = <String>{
  'ما اسم الأغنية؟',
  'What is the name of the song?',
};

const Set<String> _audioArtistQuestionTexts = <String>{
  'من صاحب هذا الصوت؟',
  'Who is the owner of this voice?',
};

bool _audioKeyLooksLikeTarget(String key, String target) {
  if (key == 'challenge.audio_mc.prompt_$target') {
    return true;
  }
  return RegExp('(^|[._])$target([._]|\$)', caseSensitive: false).hasMatch(key);
}

/// Badge/target for this round follows the pinned question, not a stale
/// template `targetBadgeKey` (catalog clientConfig is often artist-only).
String resolveAudioMcAnswerTarget(Map<String, dynamic> cfg) {
  final String declared = cfg['answerTarget'] as String? ?? '';
  final String questionKey = (cfg['questionKey'] as String?) ?? '';
  final Object? pinnedText = cfg['questionText'];
  final String questionText = pinnedText is String ? pinnedText.trim() : '';
  if (_audioTrackQuestionTexts.contains(questionText)) {
    return 'track';
  }
  if (_audioArtistQuestionTexts.contains(questionText)) {
    return 'artist';
  }
  final bool looksTrack = _audioKeyLooksLikeTarget(questionKey, 'track');
  final bool looksArtist = _audioKeyLooksLikeTarget(questionKey, 'artist');
  if (looksTrack && !looksArtist) {
    return 'track';
  }
  if (looksArtist && !looksTrack) {
    return 'artist';
  }
  if (declared == 'track' || declared == 'artist') {
    return declared;
  }
  return 'artist';
}

class AudioMultipleChoiceEngine implements ChallengeEngine {
  @override
  String get engineId => 'audio.multiple_choice';

  @override
  Widget build(BuildContext context, ChallengeContext challengeContext) {
    return _AudioMultipleChoiceWidget(
      key: ValueKey<String>(challengeContext.challenge.challengeInstanceId),
      challengeContext: challengeContext,
    );
  }
}

class _AudioMultipleChoiceWidget extends StatefulWidget {
  const _AudioMultipleChoiceWidget({super.key, required this.challengeContext});

  final ChallengeContext challengeContext;

  @override
  State<_AudioMultipleChoiceWidget> createState() =>
      _AudioMultipleChoiceWidgetState();
}

class _VizFrame {
  const _VizFrame({
    required this.bands,
    required this.progress,
    required this.energy,
    required this.playing,
    required this.buffering,
  });

  final List<double> bands;
  final double progress;
  final double energy;
  final bool playing;
  final bool buffering;
}

class _AudioMultipleChoiceWidgetState extends State<_AudioMultipleChoiceWidget>
    with TickerProviderStateMixin {
  late final AnimationController _entrance;
  late final AnimationController _motion;
  late final AnimationController _feedback;
  late final AnimationController _shake;
  final ValueNotifier<_VizFrame> _viz = ValueNotifier<_VizFrame>(
    const _VizFrame(
      bands: <double>[],
      progress: 0,
      energy: 0,
      playing: false,
      buffering: true,
    ),
  );

  AudioPlayer? _player;
  StreamSubscription<Duration>? _positionSub;
  StreamSubscription<PlayerState>? _stateSub;
  Timer? _playTimer;
  Timer? _reanchorTimer;

  AudioVisualizationData? _visualization;
  String? _chosenKey;
  bool _submitted = false;
  int? _pressedIndex;
  bool _assetFailed = false;
  bool _completed = false;
  bool _skipEntrance = false;
  bool _userPaused = false;
  bool _userControlsClock = false;
  int _playbackEpoch = 0;
  List<double> _smoothed = const <double>[];
  Duration _position = Duration.zero;
  Duration _stablePosition = Duration.zero;

  ChallengeContext get _ctx => widget.challengeContext;

  Map<String, dynamic> get _cfg => _ctx.challenge.clientConfig;

  int get _playAtMs {
    final Object? raw = _cfg['playAtMs'];
    if (raw is num) return raw.toInt();
    return _ctx.challenge.startsAtMs;
  }

  int get _audioDurationMs {
    final Object? raw = _cfg['audioDurationMs'];
    if (raw is num) return raw.toInt();
    return _visualization?.durationMs ?? 0;
  }

  String get _audioAssetId => (_cfg['audioAssetId'] as String?) ?? '';

  String get _visualizationAssetId =>
      (_cfg['visualizationAssetId'] as String?) ?? '';

  List<String> get _optionKeys {
    final Object? raw = _cfg['optionKeys'];
    if (raw is List) {
      return raw.whereType<String>().toList(growable: false);
    }
    return const <String>[];
  }

  @override
  void initState() {
    super.initState();
    final int now = _ctx.estimateServerNowMs();
    _skipEntrance = now >= _playAtMs;
    _entrance = AnimationController(
      vsync: this,
      duration: _skipEntrance
          ? Duration.zero
          : const Duration(milliseconds: 720),
    );
    _motion = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 8),
    );
    _feedback = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
    _shake = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
    );
    if (_skipEntrance) {
      _entrance.value = 1;
    } else {
      _entrance.forward();
    }
    final bool reduce = WidgetsBinding
        .instance
        .platformDispatcher
        .accessibilityFeatures
        .disableAnimations;
    if (!reduce) {
      _motion.repeat();
    }
    _restoreSubmission();
    unawaited(_bootstrap());
  }

  @override
  void didUpdateWidget(covariant _AudioMultipleChoiceWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    final AnswerSubmissionStatus next = _ctx.answerStatus;
    if (_submitted && next == AnswerSubmissionStatus.idle) {
      // Ignore stale idle that would regress a confirmed/pending result.
      return;
    }
    if (next == AnswerSubmissionStatus.confirmed) {
      _submitted = true;
    }
    if (oldWidget.challengeContext.localOutcome != _ctx.localOutcome) {
      _playOutcomeFeedback();
    }
    _restoreSubmission();
  }

  @override
  void dispose() {
    _playTimer?.cancel();
    _reanchorTimer?.cancel();
    unawaited(_positionSub?.cancel());
    unawaited(_stateSub?.cancel());
    unawaited(_player?.dispose());
    _entrance.dispose();
    _motion.dispose();
    _feedback.dispose();
    _shake.dispose();
    _viz.dispose();
    super.dispose();
  }

  void _restoreSubmission() {
    if (_ctx.answerStatus == AnswerSubmissionStatus.confirmed ||
        _ctx.answerStatus == AnswerSubmissionStatus.pending) {
      _submitted = true;
    }
  }

  Future<void> _bootstrap() async {
    _visualization = _parseInlineVisualization();
    if (_visualization == null && _visualizationAssetId.isNotEmpty) {
      try {
        final File? file = await ContentAssetCache.instance.ensureAsset(
          _visualizationAssetId,
        );
        if (file != null) {
          final Map<String, dynamic> json =
              jsonDecode(await file.readAsString()) as Map<String, dynamic>;
          _visualization = AudioVisualizationData.fromJson(json);
        }
      } catch (_) {
        _assetFailed = true;
      }
    }

    File? audioFile;
    if (_audioAssetId.isNotEmpty) {
      try {
        audioFile = await ContentAssetCache.instance.ensureAsset(_audioAssetId);
      } catch (_) {
        audioFile = null;
      }
    }
    if (!mounted) return;
    if (audioFile == null) {
      _assetFailed = _audioAssetId.isNotEmpty;
      _pushViz(playing: false, buffering: _assetFailed);
      _scheduleAuthoritativeStart(null);
      return;
    }
    try {
      final AudioPlayer player = AudioPlayer();
      _player = player;
      await player.setSource(DeviceFileSource(audioFile.path));
      await player.setReleaseMode(ReleaseMode.stop);
      _positionSub = player.onPositionChanged.listen(_onPlayerPosition);
      _stateSub = player.onPlayerStateChanged.listen(_onPlayerState);
      _scheduleAuthoritativeStart(player);
    } catch (_) {
      _assetFailed = true;
      _pushViz(playing: false, buffering: true);
    }
  }

  AudioVisualizationData? _parseInlineVisualization() {
    final Object? raw = _cfg['visualization'];
    if (raw is Map<String, dynamic>) {
      return AudioVisualizationData.fromJson(raw);
    }
    if (raw is Map) {
      return AudioVisualizationData.fromJson(Map<String, dynamic>.from(raw));
    }
    return null;
  }

  void _scheduleAuthoritativeStart(AudioPlayer? player) {
    final int now = _ctx.estimateServerNowMs();
    final int delay = _playAtMs - now;
    Future<void> start() async {
      if (!mounted || _userPaused) return;
      final int epoch = _playbackEpoch;
      final Duration seekTo = authoritativePlaybackPosition(
        serverNowMs: _ctx.estimateServerNowMs(),
        playAtMs: _playAtMs,
        audioDurationMs: _audioDurationMs,
      );
      if (seekTo.inMilliseconds >= _audioDurationMs && _audioDurationMs > 0) {
        _completed = true;
        _position = Duration(milliseconds: _audioDurationMs);
        _pushViz(playing: false, buffering: false);
        return;
      }
      if (player != null) {
        try {
          if (seekTo > Duration.zero) {
            await player.seek(seekTo);
          }
          if (!mounted || _userPaused || epoch != _playbackEpoch) {
            return;
          }
          await player.resume();
          if (!mounted || _userPaused || epoch != _playbackEpoch) {
            await player.pause();
            return;
          }
          if (!_userControlsClock) {
            _reanchorTimer?.cancel();
            _reanchorTimer = Timer.periodic(const Duration(milliseconds: 250), (
              _,
            ) {
              _reanchor(player);
            });
          }
        } catch (_) {
          _assetFailed = true;
          _pushViz(playing: false, buffering: true);
        }
      } else {
        _pushViz(playing: false, buffering: _assetFailed);
      }
    }

    if (delay <= 0) {
      unawaited(start());
    } else {
      _playTimer = Timer(Duration(milliseconds: delay), () {
        unawaited(start());
      });
    }
  }

  Future<void> _reanchor(AudioPlayer player) async {
    if (!mounted || _completed || _userPaused || _userControlsClock) return;
    try {
      final Duration expected = authoritativePlaybackPosition(
        serverNowMs: _ctx.estimateServerNowMs(),
        playAtMs: _playAtMs,
        audioDurationMs: _audioDurationMs,
      );
      final Duration actual = _position;
      if ((actual - expected).inMilliseconds.abs() > 180) {
        await player.seek(expected);
        _position = expected;
        _stablePosition = expected;
        _emitFromPosition(expected, playing: true);
      }
    } catch (_) {}
  }

  Future<void> _togglePlayback() async {
    if (!mounted) return;
    unawaited(HapticFeedback.selectionClick());
    final AudioPlayer? player = _player;
    final int epoch = ++_playbackEpoch;
    if (_viz.value.playing) {
      _userPaused = true;
      _userControlsClock = true;
      _playTimer?.cancel();
      _reanchorTimer?.cancel();
      try {
        await player?.pause();
      } catch (_) {}
      if (!mounted || epoch != _playbackEpoch) return;
      _emitFromPosition(_position, playing: false);
      return;
    }

    _userPaused = false;
    _userControlsClock = true;
    _playTimer?.cancel();
    _reanchorTimer?.cancel();
    if (_completed ||
        (_audioDurationMs > 0 &&
            _position.inMilliseconds >= _audioDurationMs)) {
      _completed = false;
      _position = Duration.zero;
      _stablePosition = Duration.zero;
      try {
        await player?.seek(Duration.zero);
      } catch (_) {}
    }
    try {
      await player?.resume();
    } catch (_) {}
    if (!mounted || epoch != _playbackEpoch || _userPaused) {
      try {
        await player?.pause();
      } catch (_) {}
      return;
    }
    _emitFromPosition(_position, playing: true);
  }

  void _onPlayerPosition(Duration position) {
    if (_userPaused) return;
    if (position < _stablePosition &&
        (_stablePosition - position).inMilliseconds < 120) {
      return;
    }
    if (position + const Duration(milliseconds: 400) < _stablePosition) {
      _stablePosition = position;
    } else if (position >= _stablePosition) {
      _stablePosition = position;
    }
    _position = _stablePosition;
    _emitFromPosition(_stablePosition, playing: !_completed && !_userPaused);
  }

  void _onPlayerState(PlayerState state) {
    if (state == PlayerState.completed) {
      _completed = true;
      _userPaused = false;
      _emitFromPosition(_position, playing: false, decay: true);
    } else if (state == PlayerState.paused || state == PlayerState.stopped) {
      _emitFromPosition(_position, playing: false);
    } else if (state == PlayerState.playing && !_userPaused) {
      _emitFromPosition(_position, playing: true);
    }
  }

  void _emitFromPosition(
    Duration position, {
    required bool playing,
    bool decay = false,
  }) {
    final AudioVisualizationData? vis = _visualization;
    List<double> bands = vis == null
        ? const <double>[]
        : bandsForPlaybackPosition(
            visualization: vis,
            playbackPosition: position,
          );
    if (decay || !playing) {
      bands = decayBands(_smoothed.isEmpty ? bands : _smoothed, 0.28);
    } else {
      bands = smoothBands(
        previous: _smoothed,
        next: bands,
        attack: 0.55,
        release: 0.22,
      );
    }
    _smoothed = bands;
    _pushViz(
      playing: playing && !decay,
      buffering: false,
      bands: bands,
      position: position,
    );
  }

  void _pushViz({
    required bool playing,
    required bool buffering,
    List<double>? bands,
    Duration? position,
  }) {
    final Duration pos = position ?? _position;
    final AudioVisualizationData? vis = _visualization;
    _viz.value = _VizFrame(
      bands: bands ?? _smoothed,
      progress: waveformProgress(
        playbackPosition: pos,
        decodedAudioDurationMs: vis?.durationMs ?? _audioDurationMs,
      ),
      energy: clipEnergy(bands ?? _smoothed),
      playing: playing,
      buffering: buffering,
    );
  }

  void _playOutcomeFeedback() {
    final String? outcome = _ctx.localOutcome;
    if (outcome == 'success') {
      _feedback.forward(from: 0);
      unawaited(HapticFeedback.mediumImpact());
    } else if (outcome == 'failure' || outcome == 'timeout') {
      _shake.forward(from: 0);
      unawaited(HapticFeedback.heavyImpact());
    }
  }

  void _select(int index) {
    if (_ctx.isInteractionLocked || _submitted) return;
    final List<String> options = _optionKeys;
    if (index < 0 || index >= options.length) return;
    setState(() {
      _pressedIndex = null;
      _chosenKey = options[index];
      _submitted = true;
    });
    unawaited(HapticFeedback.selectionClick());
    _ctx.onSubmit(<String, dynamic>{'chosenOptionKey': options[index]});
  }

  Object? _optionText(String key) {
    final Object? raw = _cfg['optionTexts'];
    if (raw is Map) return raw[key];
    return null;
  }

  String _resolved(TranslationResolver resolver, String key, Object? pinned) {
    if (pinned is String && pinned.trim().isNotEmpty) return pinned;
    if (key.isEmpty) return '';
    return resolver.resolve(key);
  }

  @override
  Widget build(BuildContext context) {
    final TranslationResolver resolver = AppLocalization.of(context);
    final MediaQueryData media = MediaQuery.of(context);
    final bool reduce = media.disableAnimations;
    final Map<String, dynamic> cfg = _cfg;
    final String answerTarget = resolveAudioMcAnswerTarget(cfg);
    final String title = resolver.resolve(
      (cfg['titleKey'] as String?) ?? 'challenge.audio_mc.intro',
    );
    final String questionKey =
        (cfg['questionKey'] as String?) ?? (cfg['promptKey'] as String?) ?? '';
    final String prompt = _resolved(resolver, questionKey, cfg['questionText']);
    final String badgeKey = answerTarget == 'track'
        ? 'challenge.audio_mc.badge_track'
        : 'challenge.audio_mc.badge_artist';
    final String badge = resolver.resolve(badgeKey);
    final List<String> options = _optionKeys;
    final bool timedOut =
        _ctx.localOutcome == 'timeout' ||
        (_ctx.estimateServerNowMs() >= _ctx.challenge.deadlineAtMs &&
            !_submitted);

    return Directionality(
      textDirection: TextDirection.rtl,
      child: LayoutBuilder(
        builder: (BuildContext context, BoxConstraints constraints) {
          final double h = constraints.maxHeight;
          final double reactorSize = (h * 0.32).clamp(148.0, 236.0);
          final String footerKey =
              (cfg['footerKey'] as String?) ?? 'challenge.audio_mc.footer';
          final String instruction = resolver.resolve(footerKey);
          return AnimatedBuilder(
            animation: Listenable.merge(<Listenable>[
              _entrance,
              _motion,
              _feedback,
              _shake,
            ]),
            builder: (BuildContext context, Widget? child) {
              final double enter = Curves.easeOutCubic.transform(
                _entrance.value,
              );
              return Stack(
                fit: StackFit.expand,
                children: <Widget>[
                  RepaintBoundary(
                    child: CustomPaint(
                      painter: _AudioMcBackgroundPainter(
                        t: reduce ? 0 : _motion.value,
                        energy: _viz.value.energy,
                        reduce: reduce,
                      ),
                    ),
                  ),
                  Opacity(
                    opacity: enter,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(4, 52, 4, 10),
                      child: Column(
                        children: <Widget>[
                          _RemainingTimeBar(
                            challenge: _ctx.challenge,
                            estimateServerNowMs: _ctx.estimateServerNowMs,
                            label: resolver.resolve(
                              'challenge.audio_mc.time_remaining',
                            ),
                            pulse: reduce ? 0 : _motion.value,
                          ),
                          const SizedBox(height: 10),
                          Text(
                            title,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.headlineLarge
                                ?.copyWith(
                                  color: Colors.white,
                                  fontSize: 32,
                                  height: 1.05,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: 0.6,
                                  shadows: const <Shadow>[
                                    Shadow(
                                      color: Color(0xCC22E7F2),
                                      blurRadius: 28,
                                    ),
                                    Shadow(
                                      color: Color(0x886B5CFF),
                                      blurRadius: 42,
                                    ),
                                  ],
                                ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            instruction,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: const Color(0xFFB7E7F2),
                                  fontSize: 13.5,
                                  height: 1.3,
                                ),
                          ),
                          if (prompt.isNotEmpty &&
                              prompt != instruction) ...<Widget>[
                            const SizedBox(height: 4),
                            Text(
                              prompt,
                              textAlign: TextAlign.center,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: const Color(0xFF7FB4C4),
                                    fontSize: 12.5,
                                  ),
                            ),
                          ],
                          const SizedBox(height: 10),
                          Semantics(
                            label: resolver.resolve(
                              'challenge.audio_mc.a11y_target',
                            ),
                            child: _TargetBadge(label: badge),
                          ),
                          const SizedBox(height: 8),
                          Expanded(
                            child: LayoutBuilder(
                              builder:
                                  (
                                    BuildContext context,
                                    BoxConstraints reactorConstraints,
                                  ) {
                                    final double side = math.min(
                                      reactorSize,
                                      math.min(
                                            reactorConstraints.maxWidth,
                                            reactorConstraints.maxHeight,
                                          ) *
                                          0.98,
                                    );
                                    return Center(
                                      child: Transform.scale(
                                        scale: 0.92 + 0.08 * enter,
                                        child: ValueListenableBuilder<_VizFrame>(
                                          valueListenable: _viz,
                                          builder: (BuildContext context, _VizFrame frame, _) {
                                            final String audioState =
                                                frame.buffering
                                                ? resolver.resolve(
                                                    'challenge.audio_mc.buffering',
                                                  )
                                                : frame.playing
                                                ? resolver.resolve(
                                                    'challenge.audio_mc.playing',
                                                  )
                                                : resolver.resolve(
                                                    'challenge.audio_mc.paused',
                                                  );
                                            final String playbackAction =
                                                frame.playing
                                                ? resolver.resolve(
                                                    'challenge.audio_mc.a11y_pause',
                                                  )
                                                : resolver.resolve(
                                                    'challenge.audio_mc.a11y_play',
                                                  );
                                            return Semantics(
                                              button: true,
                                              label:
                                                  '${resolver.resolve('challenge.audio_mc.a11y_reactor')}. $audioState. $playbackAction',
                                              child: GestureDetector(
                                                behavior:
                                                    HitTestBehavior.opaque,
                                                onTap: _togglePlayback,
                                                child: RepaintBoundary(
                                                  child: CustomPaint(
                                                    size: Size.square(side),
                                                    painter: _ReactorPainter(
                                                      bands: frame.bands,
                                                      energy: frame.energy,
                                                      sweep: reduce
                                                          ? 0
                                                          : _motion.value,
                                                      pulse: _feedback.value,
                                                      dim:
                                                          timedOut ||
                                                          _ctx.localOutcome ==
                                                              'failure',
                                                      playing: frame.playing,
                                                      reduce: reduce,
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            );
                                          },
                                        ),
                                      ),
                                    );
                                  },
                            ),
                          ),
                          ValueListenableBuilder<_VizFrame>(
                            valueListenable: _viz,
                            builder:
                                (BuildContext context, _VizFrame frame, _) {
                                  return _WaveformPanel(
                                    visualization: _visualization,
                                    progress: frame.progress,
                                    playing: frame.playing,
                                    buffering: frame.buffering,
                                    elapsed: Duration(
                                      milliseconds:
                                          (frame.progress * _audioDurationMs)
                                              .round(),
                                    ),
                                    total: Duration(
                                      milliseconds: _audioDurationMs,
                                    ),
                                    reduce: reduce,
                                    label: resolver.resolve(
                                      'challenge.audio_mc.a11y_waveform',
                                    ),
                                  );
                                },
                          ),
                          const SizedBox(height: 12),
                          _OptionGrid(
                            options: options,
                            resolver: resolver,
                            optionText: _optionText,
                            resolved: _resolved,
                            chosenKey: _chosenKey,
                            pressedIndex: _pressedIndex,
                            submitted: _submitted,
                            locked:
                                _ctx.isInteractionLocked ||
                                _submitted ||
                                timedOut,
                            outcome: _ctx.localOutcome,
                            answerStatus: _ctx.answerStatus,
                            entrance: enter,
                            shake: _shake.value,
                            onTapDown: (int i) =>
                                setState(() => _pressedIndex = i),
                            onTapCancel: () =>
                                setState(() => _pressedIndex = null),
                            onSelect: _select,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _TargetBadge extends StatelessWidget {
  const _TargetBadge({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 6, 12, 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: _cyan.withValues(alpha: 0.9), width: 1.5),
        gradient: const LinearGradient(
          colors: <Color>[Color(0x5522E7F2), Color(0x22408BFF)],
        ),
        boxShadow: const <BoxShadow>[
          BoxShadow(color: Color(0x6622E7F2), blurRadius: 18),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const Icon(Icons.graphic_eq_rounded, size: 16, color: _cyanSoft),
          const SizedBox(width: 6),
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: _cyanSoft,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _RemainingTimeBar extends StatefulWidget {
  const _RemainingTimeBar({
    required this.challenge,
    required this.estimateServerNowMs,
    required this.label,
    required this.pulse,
  });

  final PublicChallenge challenge;
  final int Function() estimateServerNowMs;
  final String label;
  final double pulse;

  @override
  State<_RemainingTimeBar> createState() => _RemainingTimeBarState();
}

class _RemainingTimeBarState extends State<_RemainingTimeBar> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 200), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final int now = widget.estimateServerNowMs();
    final int start = widget.challenge.startsAtMs;
    final int deadline = widget.challenge.deadlineAtMs;
    final int duration = (deadline - start).clamp(1, 60000);
    final double remaining = ((deadline - now) / 1000).clamp(0.0, 99.0);
    final double progress = ((now - start) / duration).clamp(0.0, 1.0);
    return Semantics(
      label: '${widget.label} ${remaining.toStringAsFixed(0)}',
      child: Container(
        height: 38,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: _cyan.withValues(alpha: 0.55), width: 1.2),
          boxShadow: const <BoxShadow>[
            BoxShadow(color: Color(0x4422E7F2), blurRadius: 16),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(999),
          child: Stack(
            children: <Widget>[
              const ColoredBox(
                color: Color(0xFF061525),
                child: SizedBox.expand(),
              ),
              CustomPaint(
                painter: _TimerBarPainter(
                  progress: 1 - progress,
                  pulse: widget.pulse,
                ),
                child: const SizedBox.expand(),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Row(
                  children: <Widget>[
                    Text(
                      widget.label,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: const Color(0xFFE7FBFF),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    Directionality(
                      textDirection: TextDirection.ltr,
                      child: Text(
                        formatAudioClock(
                          Duration(milliseconds: (remaining * 1000).round()),
                        ),
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontFeatures: const <FontFeature>[
                            FontFeature.tabularFigures(),
                          ],
                          shadows: const <Shadow>[
                            Shadow(color: Color(0xAA22E7F2), blurRadius: 10),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _WaveformPanel extends StatelessWidget {
  const _WaveformPanel({
    required this.visualization,
    required this.progress,
    required this.playing,
    required this.buffering,
    required this.elapsed,
    required this.total,
    required this.reduce,
    required this.label,
  });

  final AudioVisualizationData? visualization;
  final double progress;
  final bool playing;
  final bool buffering;
  final Duration elapsed;
  final Duration total;
  final bool reduce;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      value: '${formatAudioClock(elapsed)} / ${formatAudioClock(total)}',
      child: Container(
        height: 86,
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: _cyan.withValues(alpha: 0.72), width: 1.6),
          gradient: const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: <Color>[Color(0xFF071A2E), Color(0xFF04101C)],
          ),
          boxShadow: const <BoxShadow>[
            BoxShadow(color: Color(0x5522E7F2), blurRadius: 22),
            BoxShadow(color: Color(0x336B5CFF), blurRadius: 28),
          ],
        ),
        child: Column(
          children: <Widget>[
            Expanded(
              child: RepaintBoundary(
                child: CustomPaint(
                  painter: _WaveformPainter(
                    samples: visualization?.waveform ?? const <double>[],
                    progress: progress,
                    playing: playing && !buffering,
                    reduce: reduce,
                  ),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
            Directionality(
              textDirection: TextDirection.ltr,
              child: Row(
                children: <Widget>[
                  Text(
                    formatAudioClock(elapsed),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: const Color(0xFFB7E7F2),
                      fontFeatures: const <FontFeature>[
                        FontFeature.tabularFigures(),
                      ],
                    ),
                  ),
                  const Spacer(),
                  Text(
                    formatAudioClock(total),
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: const Color(0xFFB7E7F2),
                      fontFeatures: const <FontFeature>[
                        FontFeature.tabularFigures(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OptionGrid extends StatelessWidget {
  const _OptionGrid({
    required this.options,
    required this.resolver,
    required this.optionText,
    required this.resolved,
    required this.chosenKey,
    required this.pressedIndex,
    required this.submitted,
    required this.locked,
    required this.outcome,
    required this.answerStatus,
    required this.entrance,
    required this.shake,
    required this.onTapDown,
    required this.onTapCancel,
    required this.onSelect,
  });

  final List<String> options;
  final TranslationResolver resolver;
  final Object? Function(String key) optionText;
  final String Function(TranslationResolver, String, Object?) resolved;
  final String? chosenKey;
  final int? pressedIndex;
  final bool submitted;
  final bool locked;
  final String? outcome;
  final AnswerSubmissionStatus answerStatus;
  final double entrance;
  final double shake;
  final void Function(int index) onTapDown;
  final VoidCallback onTapCancel;
  final void Function(int index) onSelect;

  @override
  Widget build(BuildContext context) {
    final int count = options.length;
    final int columns = count == 4 || count > 3 ? 2 : 1;
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: count,
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: count == 4 ? 2.05 : 2.45,
      ),
      itemBuilder: (BuildContext context, int index) {
        final String key = options[index];
        final bool selected = chosenKey == key;
        final double dx = selected && outcome == 'failure'
            ? math.sin(shake * 18) * 5
            : 0;
        final double slide = (1 - entrance) * (8.0 + index * 4);
        return Transform.translate(
          offset: Offset(dx, slide),
          child: Opacity(
            opacity: entrance,
            child: _AudioMcOption(
              label: resolved(resolver, key, optionText(key)),
              selected: selected,
              pressed: pressedIndex == index,
              pending:
                  selected && answerStatus == AnswerSubmissionStatus.pending,
              confirmed:
                  selected && answerStatus == AnswerSubmissionStatus.confirmed,
              correct: selected && outcome == 'success',
              incorrect:
                  selected && (outcome == 'failure' || outcome == 'timeout'),
              disabled: locked && !selected,
              onTapDown: locked ? null : () => onTapDown(index),
              onTapUp: locked ? null : () => onSelect(index),
              onTapCancel: onTapCancel,
            ),
          ),
        );
      },
    );
  }
}

class _AudioMcOption extends StatelessWidget {
  const _AudioMcOption({
    required this.label,
    required this.selected,
    required this.pressed,
    required this.pending,
    required this.confirmed,
    required this.correct,
    required this.incorrect,
    required this.disabled,
    required this.onTapDown,
    required this.onTapUp,
    required this.onTapCancel,
  });

  final String label;
  final bool selected;
  final bool pressed;
  final bool pending;
  final bool confirmed;
  final bool correct;
  final bool incorrect;
  final bool disabled;
  final VoidCallback? onTapDown;
  final VoidCallback? onTapUp;
  final VoidCallback onTapCancel;

  @override
  Widget build(BuildContext context) {
    final bool filled = (selected && !incorrect) || confirmed;
    Color border = _cyan.withValues(alpha: 0.92);
    Color fillTop = const Color(0xFF071A2E);
    Color fillBottom = const Color(0xFF04101C);
    Color textColor = disabled ? LhColors.textMuted : Colors.white;
    if (filled) {
      fillTop = const Color(0xFF4DF0FF);
      fillBottom = const Color(0xFF22E7F2);
      textColor = const Color(0xFF03141C);
      border = const Color(0xFFB8FBFF);
    }
    if (correct) {
      border = const Color(0xFF7DFFC4);
      fillTop = const Color(0xFF7DFFC4);
      fillBottom = const Color(0xFF22E7F2);
      textColor = const Color(0xFF03141C);
    }
    if (incorrect) {
      border = _amber;
      fillTop = const Color(0xFF2A140C);
      fillBottom = const Color(0xFF1A0C08);
      textColor = Colors.white;
    }
    if (pending && !filled) {
      border = Colors.white;
    }
    return Semantics(
      button: true,
      selected: selected,
      enabled: !disabled,
      label: label,
      child: GestureDetector(
        onTapDown: onTapDown == null ? null : (_) => onTapDown!(),
        onTapUp: onTapUp == null ? null : (_) => onTapUp!(),
        onTapCancel: onTapCancel,
        child: AnimatedScale(
          scale: pressed ? 0.97 : 1,
          duration: const Duration(milliseconds: 90),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: border, width: 2.1),
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: <Color>[fillTop, fillBottom],
              ),
              boxShadow: <BoxShadow>[
                BoxShadow(
                  color: border.withValues(alpha: filled ? 0.55 : 0.38),
                  blurRadius: filled || correct || pending ? 22 : 16,
                  spreadRadius: 0.4,
                ),
                BoxShadow(
                  color: _purple.withValues(alpha: 0.16),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                color: textColor,
                fontWeight: FontWeight.w800,
                height: 1.15,
                letterSpacing: 0.1,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AudioMcBackgroundPainter extends CustomPainter {
  _AudioMcBackgroundPainter({
    required this.t,
    required this.energy,
    required this.reduce,
  });

  final double t;
  final double energy;
  final bool reduce;

  void _drawSideWave(
    Canvas canvas,
    Size size, {
    required double x,
    required double phase,
    required bool flip,
  }) {
    final Path path = Path();
    final double mid = size.height * 0.46;
    path.moveTo(x, mid - size.height * 0.28);
    for (
      double y = mid - size.height * 0.28;
      y <= mid + size.height * 0.28;
      y += 3
    ) {
      final double n = (y - mid) / (size.height * 0.28);
      final double envelope = math.cos(n * math.pi / 2).clamp(0.0, 1.0);
      final double amp =
          (10 + energy * 16) *
          envelope *
          (0.45 + 0.55 * (0.5 + 0.5 * math.sin(y * 0.045 + phase)));
      path.lineTo(x + (flip ? -amp : amp), y);
    }
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8)
        ..shader = ui.Gradient.linear(
          Offset(x, 0),
          Offset(x, size.height),
          <Color>[
            _purple.withValues(alpha: 0.0),
            _purple.withValues(alpha: 0.55),
            _cyan.withValues(alpha: 0.7),
            _purple.withValues(alpha: 0.0),
          ],
          <double>[0, 0.32, 0.62, 1],
        ),
    );
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.15
        ..color = _cyanSoft.withValues(alpha: 0.55 + energy * 0.2),
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    final Rect rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()
        ..shader = const RadialGradient(
          center: Alignment(0, -0.12),
          radius: 1.15,
          colors: <Color>[Color(0xFF0A2748), Color(0xFF04101C), _navyDeep],
          stops: <double>[0, 0.55, 1],
        ).createShader(rect),
    );
    canvas.drawRect(
      rect,
      Paint()
        ..shader = RadialGradient(
          center: const Alignment(0, 0.05),
          radius: 0.55,
          colors: <Color>[
            _cyan.withValues(alpha: 0.10 + energy * 0.08),
            const Color(0x00000000),
          ],
        ).createShader(rect),
    );
    canvas.drawRect(
      rect,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[
            Color(0x66020814),
            Color(0x00000000),
            Color(0xAA020814),
          ],
          stops: <double>[0, 0.35, 1],
        ).createShader(rect),
    );
    final Paint tunnel = Paint()
      ..color = const Color(0x1222E7F2)
      ..strokeWidth = 0.8;
    final Offset focus = Offset(size.width / 2, size.height * 0.38);
    for (int i = 1; i <= 8; i += 1) {
      final double y = size.height * (0.18 + i * 0.09);
      canvas.drawLine(Offset(0, y), focus, tunnel);
      canvas.drawLine(Offset(size.width, y), focus, tunnel);
    }
    if (!reduce) {
      _drawSideWave(canvas, size, x: 18, phase: t * math.pi * 2, flip: false);
      _drawSideWave(
        canvas,
        size,
        x: size.width - 18,
        phase: t * math.pi * 2 + 0.8,
        flip: true,
      );
    }
    final RRect frame = RRect.fromRectAndRadius(
      rect.deflate(6),
      const Radius.circular(30),
    );
    canvas.drawRRect(
      frame,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3.2
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10)
        ..color = _cyan.withValues(alpha: 0.22 + 0.08 * energy),
    );
    canvas.drawRRect(
      frame,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.35
        ..color = _cyan.withValues(
          alpha: 0.55 + 0.2 * math.sin(t * math.pi * 2),
        ),
    );
  }

  @override
  bool shouldRepaint(covariant _AudioMcBackgroundPainter oldDelegate) =>
      oldDelegate.t != t || oldDelegate.energy != energy;
}

class _ReactorPainter extends CustomPainter {
  _ReactorPainter({
    required this.bands,
    required this.energy,
    required this.sweep,
    required this.pulse,
    required this.dim,
    required this.playing,
    required this.reduce,
  });

  final List<double> bands;
  final double energy;
  final double sweep;
  final double pulse;
  final bool dim;
  final bool playing;
  final bool reduce;

  List<double> _bars(int count) {
    if (bands.isEmpty) {
      return List<double>.generate(count, (int i) {
        final double wave =
            0.22 + 0.1 * math.sin(i / count * math.pi * 6 + sweep * 8);
        return playing ? wave : 0.12;
      });
    }
    return List<double>.generate(count, (int i) {
      final double t = i / count * bands.length;
      final int i0 = t.floor() % bands.length;
      final int i1 = (i0 + 1) % bands.length;
      final double f = t - t.floor();
      final double mag = bands[i0] * (1 - f) + bands[i1] * f;
      return mag.clamp(0.08, 1.0);
    });
  }

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double radius = size.shortestSide / 2;
    final double dimFactor = dim ? 0.45 : 1;
    canvas.drawCircle(
      c,
      radius * 1.02,
      Paint()
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 22)
        ..color = _cyan.withValues(alpha: (0.18 + energy * 0.28) * dimFactor),
    );
    canvas.drawCircle(
      c,
      radius * 0.94,
      Paint()
        ..shader = RadialGradient(
          colors: <Color>[
            Color.lerp(const Color(0xFF082033), _cyan, 0.12 + energy * 0.16)!,
            const Color(0xFF020814),
          ],
        ).createShader(Rect.fromCircle(center: c, radius: radius)),
    );
    for (int i = 0; i < 5; i += 1) {
      canvas.drawCircle(
        c,
        radius * (0.30 + i * 0.12) + energy * 4,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = i == 0 ? 2.6 : 1.15
          ..color = _cyan.withValues(
            alpha: (0.38 + energy * 0.28 - i * 0.05) * dimFactor,
          ),
      );
    }
    const int ticks = 48;
    for (int i = 0; i < ticks; i += 1) {
      final double ang = -math.pi / 2 + (i / ticks) * math.pi * 2;
      final double innerT = radius * 0.90;
      final double outerT = radius * (i % 4 == 0 ? 0.97 : 0.94);
      canvas.drawLine(
        Offset(c.dx + math.cos(ang) * innerT, c.dy + math.sin(ang) * innerT),
        Offset(c.dx + math.cos(ang) * outerT, c.dy + math.sin(ang) * outerT),
        Paint()
          ..strokeWidth = i % 4 == 0 ? 1.6 : 0.8
          ..strokeCap = StrokeCap.round
          ..color = _cyanSoft.withValues(alpha: 0.35 * dimFactor),
      );
    }
    canvas.drawCircle(
      c,
      radius * (0.82 + energy * 0.05 + pulse * 0.04),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 14
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10)
        ..color = _cyan.withValues(alpha: (0.12 + energy * 0.22) * dimFactor),
    );
    final List<double> bars = _bars(48);
    final int n = bars.length;
    final double inner = radius * 0.40;
    final double outer = radius * 0.86;
    final double core = radius * 0.22;
    for (int i = 0; i < n; i += 1) {
      final double mag = bars[i];
      final double ang = -math.pi / 2 + (i / n) * math.pi * 2;
      final double len = inner + (outer - inner) * mag;
      final Offset a = Offset(
        c.dx + math.cos(ang) * inner,
        c.dy + math.sin(ang) * inner,
      );
      final Offset b = Offset(
        c.dx + math.cos(ang) * len,
        c.dy + math.sin(ang) * len,
      );
      canvas.drawLine(
        a,
        b,
        Paint()
          ..strokeWidth = 4.4
          ..strokeCap = StrokeCap.round
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3)
          ..shader = ui.Gradient.linear(a, b, <Color>[
            _purple.withValues(alpha: 0.15 * dimFactor),
            _cyanSoft.withValues(alpha: 0.95 * dimFactor),
          ]),
      );
      canvas.drawLine(
        a,
        b,
        Paint()
          ..strokeWidth = 2.6
          ..strokeCap = StrokeCap.round
          ..shader = ui.Gradient.linear(a, b, <Color>[
            _purple.withValues(alpha: 0.85 * dimFactor),
            _cyanSoft.withValues(alpha: dimFactor),
          ]),
      );
      final Offset coreA = Offset(
        c.dx + math.cos(ang) * core,
        c.dy + math.sin(ang) * core,
      );
      final Offset coreB = Offset(
        c.dx + math.cos(ang) * (core + (inner - core) * mag * 0.7),
        c.dy + math.sin(ang) * (core + (inner - core) * mag * 0.7),
      );
      canvas.drawLine(
        coreA,
        coreB,
        Paint()
          ..strokeWidth = 2.1
          ..strokeCap = StrokeCap.round
          ..color = _cyan.withValues(alpha: 0.55 * dimFactor),
      );
    }
    if (!reduce) {
      canvas.save();
      canvas.translate(c.dx, c.dy);
      canvas.rotate(sweep * math.pi * 2);
      canvas.drawArc(
        Rect.fromCircle(center: Offset.zero, radius: radius * 0.72),
        0,
        0.7,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.4
          ..color = _cyanSoft.withValues(alpha: 0.28 * dimFactor),
      );
      canvas.restore();
    }
    canvas.drawCircle(
      c,
      radius * 0.16,
      Paint()
        ..shader = RadialGradient(
          colors: <Color>[
            const Color(0xFF16324A).withValues(alpha: dimFactor),
            const Color(0xFF071018).withValues(alpha: dimFactor),
          ],
        ).createShader(Rect.fromCircle(center: c, radius: radius * 0.16)),
    );
    canvas.drawCircle(
      c,
      radius * 0.16,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.4
        ..color = _cyan.withValues(alpha: 0.7 * dimFactor),
    );
    final Color glyph = Colors.white.withValues(alpha: 0.95 * dimFactor);
    if (playing) {
      final double w = radius * 0.045;
      final double h = radius * 0.16;
      final double gap = radius * 0.05;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(c.dx - gap, c.dy),
            width: w,
            height: h,
          ),
          Radius.circular(w),
        ),
        Paint()..color = glyph,
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset(c.dx + gap, c.dy),
            width: w,
            height: h,
          ),
          Radius.circular(w),
        ),
        Paint()..color = glyph,
      );
    } else {
      final Path triangle = Path()
        ..moveTo(c.dx - radius * 0.04, c.dy - radius * 0.09)
        ..lineTo(c.dx + radius * 0.1, c.dy)
        ..lineTo(c.dx - radius * 0.04, c.dy + radius * 0.09)
        ..close();
      canvas.drawPath(triangle, Paint()..color = glyph);
    }
  }

  @override
  bool shouldRepaint(covariant _ReactorPainter oldDelegate) =>
      oldDelegate.bands != bands ||
      oldDelegate.energy != energy ||
      oldDelegate.sweep != sweep ||
      oldDelegate.pulse != pulse ||
      oldDelegate.playing != playing ||
      oldDelegate.dim != dim;
}

class _WaveformPainter extends CustomPainter {
  _WaveformPainter({
    required this.samples,
    required this.progress,
    required this.playing,
    required this.reduce,
  });

  final List<double> samples;
  final double progress;
  final bool playing;
  final bool reduce;

  Path _envelope(Size size, {required int end}) {
    final Path path = Path();
    if (samples.isEmpty || end <= 0) {
      return path;
    }
    final double mid = size.height / 2;
    final double step = size.width / math.max(samples.length - 1, 1);
    path.moveTo(0, mid);
    for (int i = 0; i < end; i += 1) {
      final double amp = math.max(2.0, samples[i] * size.height * 0.46);
      path.lineTo(i * step, mid - amp);
    }
    for (int i = end - 1; i >= 0; i -= 1) {
      final double amp = math.max(2.0, samples[i] * size.height * 0.46);
      path.lineTo(i * step, mid + amp);
    }
    path.close();
    return path;
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (samples.isEmpty) return;
    final double mid = size.height / 2;
    final int played = (samples.length * progress.clamp(0.0, 1.0))
        .round()
        .clamp(1, samples.length);
    final Path future = _envelope(size, end: samples.length);
    final Path past = _envelope(size, end: played);
    canvas.drawPath(
      future,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, mid - size.height / 2),
          Offset(0, mid + size.height / 2),
          const <Color>[
            Color(0x33408CA4),
            Color(0x55408CA4),
            Color(0x33408CA4),
          ],
          <double>[0, 0.5, 1],
        ),
    );
    canvas.drawPath(
      past,
      Paint()
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6)
        ..color = (playing ? _cyanSoft : _cyan).withValues(alpha: 0.35),
    );
    canvas.drawPath(
      past,
      Paint()
        ..shader = ui.Gradient.linear(
          Offset(0, mid - size.height / 2),
          Offset(0, mid + size.height / 2),
          <Color>[
            _cyanSoft.withValues(alpha: playing ? 0.95 : 0.7),
            _cyan.withValues(alpha: 0.85),
            _cyanSoft.withValues(alpha: playing ? 0.95 : 0.7),
          ],
          <double>[0, 0.5, 1],
        ),
    );
    final double x = (progress.clamp(0.0, 1.0)) * size.width;
    canvas.drawLine(
      Offset(x, 2),
      Offset(x, size.height - 2),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.92)
        ..strokeWidth = 1.8
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2),
    );
    canvas.drawLine(
      Offset(x, 2),
      Offset(x, size.height - 2),
      Paint()
        ..color = _cyanSoft
        ..strokeWidth = 1.2,
    );
    if (playing && !reduce) {
      canvas.drawCircle(
        Offset(x, mid),
        4.2,
        Paint()
          ..color = _cyanSoft.withValues(alpha: 0.45)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
      );
      canvas.drawCircle(Offset(x, mid), 2.6, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(covariant _WaveformPainter oldDelegate) =>
      oldDelegate.progress != progress ||
      oldDelegate.playing != playing ||
      oldDelegate.samples != samples;
}

class _TimerBarPainter extends CustomPainter {
  _TimerBarPainter({required this.progress, required this.pulse});

  final double progress;
  final double pulse;

  @override
  void paint(Canvas canvas, Size size) {
    final RRect track = RRect.fromLTRBR(
      0,
      0,
      size.width,
      size.height,
      Radius.circular(size.height),
    );
    canvas.drawRRect(track, Paint()..color = const Color(0xFF071525));
    final double remaining = progress.clamp(0.0, 1.0);
    final double left = size.width * (1 - remaining);
    canvas.drawRRect(
      RRect.fromLTRBR(
        left,
        0,
        size.width,
        size.height,
        Radius.circular(size.height),
      ),
      Paint()
        ..shader = const LinearGradient(
          colors: <Color>[_cyan, _cyanSoft, Color(0xFFB8FBFF)],
        ).createShader(Rect.fromLTWH(left, 0, size.width - left, size.height)),
    );
    canvas.drawRRect(
      RRect.fromLTRBR(
        left,
        0,
        size.width,
        size.height,
        Radius.circular(size.height),
      ),
      Paint()
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8)
        ..color = _cyan.withValues(alpha: 0.28),
    );
    final double hx = (left + (size.width - left) * ((pulse * 1.4) % 1)).clamp(
      left,
      size.width,
    );
    canvas.drawCircle(
      Offset(hx, size.height / 2),
      size.height * 0.22,
      Paint()..color = Colors.white.withValues(alpha: 0.45),
    );
  }

  @override
  bool shouldRepaint(covariant _TimerBarPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.pulse != pulse;
}
