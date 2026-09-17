import 'package:flutter_test/flutter_test.dart';
import 'package:game/features/match/engines/audio_visualization.dart';

AudioVisualizationData sampleVis() {
  return AudioVisualizationData(
    schemaVersion: 1,
    audioContentHash: 'hash',
    durationMs: 2000,
    frameIntervalMs: 40,
    waveform: List<double>.generate(160, (int i) => i == 40 ? 0.9 : 0.05),
    spectrumFrames: List<List<double>>.generate(
      50,
      (int f) => List<double>.generate(
        32,
        (int b) => f == 10 && b == 4 ? 0.95 : (b == 4 ? 0.2 : 0.02),
      ),
    ),
  );
}

void main() {
  test('mocked playback position selects the expected analysis frame', () {
    final AudioVisualizationData vis = sampleVis();
    final List<double> at400 = bandsForPlaybackPosition(
      visualization: vis,
      playbackPosition: const Duration(milliseconds: 400),
    );
    final List<double> at401 = bandsForPlaybackPosition(
      visualization: vis,
      playbackPosition: const Duration(milliseconds: 401),
    );
    expect(at400[4], closeTo(0.95, 0.03));
    expect(at401[4], lessThan(at400[4]));
    expect(at400, isNot(equals(at401)));
  });

  test('interpolates between adjacent frames without randomness', () {
    final AudioVisualizationData vis = sampleVis();
    final List<double> a = bandsForPlaybackPosition(
      visualization: vis,
      playbackPosition: const Duration(milliseconds: 400),
    );
    final List<double> b = bandsForPlaybackPosition(
      visualization: vis,
      playbackPosition: const Duration(milliseconds: 440),
    );
    final List<double> mid = bandsForPlaybackPosition(
      visualization: vis,
      playbackPosition: const Duration(milliseconds: 420),
    );
    expect(mid[4], closeTo((a[4] + b[4]) / 2, 0.02));
    expect(
      bandsForPlaybackPosition(
        visualization: vis,
        playbackPosition: const Duration(milliseconds: 420),
      ),
      mid,
    );
  });

  test('waveform progress uses playbackPosition / decoded duration', () {
    expect(
      waveformProgress(
        playbackPosition: const Duration(milliseconds: 500),
        decodedAudioDurationMs: 2000,
      ),
      0.25,
    );
  });

  test('authoritative late join seeks into the clip instead of restarting', () {
    expect(
      authoritativePlaybackPosition(
        serverNowMs: 1300,
        playAtMs: 1000,
        audioDurationMs: 2000,
      ),
      const Duration(milliseconds: 300),
    );
  });

  test('pause/buffering decay reduces band energy', () {
    final List<double> decayed = decayBands(<double>[0.8, 0.6, 0.4], 0.5);
    expect(decayed[0], lessThan(0.8));
    expect(decayed.every((double v) => v >= 0 && v <= 1), isTrue);
  });
}
