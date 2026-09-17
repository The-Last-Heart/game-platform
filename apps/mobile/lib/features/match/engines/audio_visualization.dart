import 'dart:math' as math;

/// Deterministic visualization frames generated on the server from decoded PCM.
class AudioVisualizationData {
  const AudioVisualizationData({
    required this.schemaVersion,
    required this.audioContentHash,
    required this.durationMs,
    required this.frameIntervalMs,
    required this.waveform,
    required this.spectrumFrames,
  });

  final int schemaVersion;
  final String audioContentHash;
  final int durationMs;
  final int frameIntervalMs;
  final List<double> waveform;
  final List<List<double>> spectrumFrames;

  factory AudioVisualizationData.fromJson(Map<String, dynamic> json) {
    final List<double> waveform = _numberList(json['waveform']);
    final List<List<double>> frames = <List<double>>[];
    final Object? rawFrames = json['spectrumFrames'];
    if (rawFrames is List) {
      for (final Object? frame in rawFrames) {
        if (frame is List) {
          frames.add(
            frame
                .map(
                  (Object? v) => v is num ? v.toDouble().clamp(0.0, 1.0) : 0.0,
                )
                .toList(growable: false),
          );
        }
      }
    }
    return AudioVisualizationData(
      schemaVersion: (json['schemaVersion'] as num?)?.toInt() ?? 1,
      audioContentHash: json['audioContentHash'] as String? ?? '',
      durationMs: (json['durationMs'] as num?)?.toInt() ?? 0,
      frameIntervalMs: (json['frameIntervalMs'] as num?)?.toInt() ?? 40,
      waveform: waveform,
      spectrumFrames: frames,
    );
  }
}

List<double> _numberList(Object? raw) {
  if (raw is! List) return const <double>[];
  return raw
      .map((Object? v) => v is num ? v.toDouble().clamp(0.0, 1.0) : 0.0)
      .toList(growable: false);
}

List<double> lerpBands(List<double> a, List<double> b, double t) {
  final int count = math.max(a.length, b.length);
  if (count == 0) return const <double>[];
  final double clamped = t.clamp(0.0, 1.0);
  return List<double>.generate(count, (int i) {
    final double lo = i < a.length ? a[i] : 0;
    final double hi = i < b.length ? b[i] : 0;
    return lo + (hi - lo) * clamped;
  }, growable: false);
}

/// Selects interpolated spectrum bands for a mocked or real playback position.
List<double> bandsForPlaybackPosition({
  required AudioVisualizationData visualization,
  required Duration playbackPosition,
}) {
  final List<List<double>> frames = visualization.spectrumFrames;
  if (frames.isEmpty) {
    return const <double>[];
  }
  final int interval = visualization.frameIntervalMs <= 0
      ? 40
      : visualization.frameIntervalMs;
  final double framePosition =
      playbackPosition.inMilliseconds.clamp(0, 1 << 30) / interval;
  final int lowerIndex = framePosition.floor().clamp(0, frames.length - 1);
  final int upperIndex = math.min(lowerIndex + 1, frames.length - 1);
  final double interpolation = framePosition - lowerIndex;
  return lerpBands(frames[lowerIndex], frames[upperIndex], interpolation);
}

double waveformProgress({
  required Duration playbackPosition,
  required int decodedAudioDurationMs,
}) {
  if (decodedAudioDurationMs <= 0) return 0;
  return (playbackPosition.inMilliseconds / decodedAudioDurationMs).clamp(
    0.0,
    1.0,
  );
}

double clipEnergy(List<double> bands) {
  if (bands.isEmpty) return 0;
  double acc = 0;
  for (final double v in bands) {
    acc += v * v;
  }
  return math.sqrt(acc / bands.length).clamp(0.0, 1.0);
}

List<double> smoothBands({
  required List<double> previous,
  required List<double> next,
  required double attack,
  required double release,
}) {
  if (previous.isEmpty) return next;
  final int count = math.max(previous.length, next.length);
  return List<double>.generate(count, (int i) {
    final double from = i < previous.length ? previous[i] : 0;
    final double to = i < next.length ? next[i] : 0;
    final double coeff = to > from ? attack : release;
    return from + (to - from) * coeff;
  }, growable: false);
}

List<double> decayBands(List<double> bands, double amount) {
  if (bands.isEmpty) return bands;
  final double keep = (1 - amount).clamp(0.0, 1.0);
  return <double>[
    for (final double v in bands) (v * keep).clamp(0.0, 1.0),
  ];
}

Duration authoritativePlaybackPosition({
  required int serverNowMs,
  required int playAtMs,
  required int audioDurationMs,
}) {
  if (serverNowMs <= playAtMs) {
    return Duration.zero;
  }
  final int elapsed = serverNowMs - playAtMs;
  if (audioDurationMs <= 0) {
    return Duration(milliseconds: elapsed);
  }
  return Duration(milliseconds: elapsed.clamp(0, audioDurationMs));
}

String formatAudioClock(Duration duration) {
  final int totalSec = duration.inMilliseconds.clamp(0, 3599999) ~/ 1000;
  final int minutes = totalSec ~/ 60;
  final int seconds = totalSec % 60;
  return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
}
