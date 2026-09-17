import {
  AUDIO_ANALYSIS_SAMPLE_RATE,
  AUDIO_FFT_SIZE,
  AUDIO_FRAME_INTERVAL_MS,
  AUDIO_SPECTRUM_BANDS,
  AUDIO_VIS_SCHEMA_VERSION,
  AUDIO_WAVEFORM_BINS,
  AudioIngestError,
  type AudioVisualizationData,
  type DecodedPcm,
} from './audio-constants';

function mixToMono(decoded: DecodedPcm): Float32Array {
  const first = decoded.channelData[0];
  if (!first) {
    throw new AudioIngestError('empty_stream', 'no PCM channels to analyze');
  }
  if (decoded.channelData.length === 1) {
    return first;
  }
  const frames = first.length;
  const mixed = new Float32Array(frames);
  const n = decoded.channelData.length;
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let ch = 0; ch < n; ch += 1) {
      sum += decoded.channelData[ch]![i] ?? 0;
    }
    mixed[i] = sum / n;
  }
  return mixed;
}

function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) {
    return input;
  }
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = (input[i0] ?? 0) * (1 - t) + (input[i1] ?? 0) * t;
  }
  return out;
}

function hann(n: number, size: number): number {
  if (size <= 1) return 1;
  return 0.5 * (1 - Math.cos((2 * Math.PI * n) / (size - 1)));
}

/** In-place radix-2 iterative FFT. `real`/`imag` length must be a power of two. */
export function fftRadix2(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    if (i < j) {
      const tr = real[j]!;
      const ti = imag[j]!;
      real[j] = real[i]!;
      imag[j] = imag[i]!;
      real[i] = tr;
      imag[i] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const theta = (-2 * Math.PI) / size;
    const wpr = Math.cos(theta);
    const wpi = Math.sin(theta);
    for (let i = 0; i < n; i += size) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < half; k += 1) {
        const evenR = real[i + k]!;
        const evenI = imag[i + k]!;
        const oddR = real[i + k + half]!;
        const oddI = imag[i + k + half]!;
        const tr = wr * oddR - wi * oddI;
        const ti = wr * oddI + wi * oddR;
        real[i + k] = evenR + tr;
        imag[i + k] = evenI + ti;
        real[i + k + half] = evenR - tr;
        imag[i + k + half] = evenI - ti;
        const nextWr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr;
        wr = nextWr;
      }
    }
  }
}

function logBandEdges(nyquist: number, bands: number): number[] {
  const lo = 40;
  const hi = nyquist;
  const edges: number[] = [];
  for (let i = 0; i <= bands; i += 1) {
    const t = i / bands;
    edges.push(lo * Math.pow(hi / lo, t));
  }
  return edges;
}

function finite01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? 1 : value;
}

/**
 * Deterministic visualization from decoded PCM.
 * Clip-level normalization so quiet sections stay quiet.
 */
export function analyzeDecodedAudio(
  decoded: DecodedPcm,
  audioContentHash: string,
): AudioVisualizationData {
  try {
    const mono = mixToMono(decoded);
    const samples = resampleLinear(
      mono,
      decoded.sampleRate,
      AUDIO_ANALYSIS_SAMPLE_RATE,
    );

    const waveform: number[] = [];
    const binSize = Math.max(
      1,
      Math.floor(samples.length / AUDIO_WAVEFORM_BINS),
    );
    for (let b = 0; b < AUDIO_WAVEFORM_BINS; b += 1) {
      const start = b * binSize;
      const end =
        b === AUDIO_WAVEFORM_BINS - 1
          ? samples.length
          : Math.min(samples.length, start + binSize);
      if (end <= start) {
        waveform.push(0);
        continue;
      }
      let acc = 0;
      for (let i = start; i < end; i += 1) {
        const s = samples[i] ?? 0;
        acc += s * s;
      }
      waveform.push(Math.sqrt(acc / (end - start)));
    }

    const hop = Math.max(
      1,
      Math.round((AUDIO_ANALYSIS_SAMPLE_RATE * AUDIO_FRAME_INTERVAL_MS) / 1000),
    );
    const nyquist = AUDIO_ANALYSIS_SAMPLE_RATE / 2;
    const edges = logBandEdges(nyquist, AUDIO_SPECTRUM_BANDS);
    const binHz = AUDIO_ANALYSIS_SAMPLE_RATE / AUDIO_FFT_SIZE;
    const spectrumFrames: number[][] = [];
    const real = new Float64Array(AUDIO_FFT_SIZE);
    const imag = new Float64Array(AUDIO_FFT_SIZE);

    const frameCount = Math.max(1, Math.ceil(samples.length / hop));
    for (let f = 0; f < frameCount; f += 1) {
      const origin = f * hop;
      real.fill(0);
      imag.fill(0);
      for (let n = 0; n < AUDIO_FFT_SIZE; n += 1) {
        const s = samples[origin + n] ?? 0;
        real[n] = s * hann(n, AUDIO_FFT_SIZE);
      }
      fftRadix2(real, imag);
      const bands = new Array<number>(AUDIO_SPECTRUM_BANDS).fill(0);
      const counts = new Array<number>(AUDIO_SPECTRUM_BANDS).fill(0);
      const half = AUDIO_FFT_SIZE / 2;
      for (let bin = 1; bin < half; bin += 1) {
        const mag = Math.hypot(real[bin]!, imag[bin]!) / half;
        const hz = bin * binHz;
        let band = AUDIO_SPECTRUM_BANDS - 1;
        for (let b = 0; b < AUDIO_SPECTRUM_BANDS; b += 1) {
          if (hz < edges[b + 1]!) {
            band = b;
            break;
          }
        }
        bands[band] = (bands[band] ?? 0) + mag * mag;
        counts[band] = (counts[band] ?? 0) + 1;
      }
      const compressed: number[] = [];
      for (let b = 0; b < AUDIO_SPECTRUM_BANDS; b += 1) {
        const rms = counts[b]! > 0 ? Math.sqrt(bands[b]! / counts[b]!) : 0;
        // Stable log compression (not per-frame peak normalize).
        compressed.push(Math.log10(1 + 12 * rms) / Math.log10(13));
      }
      spectrumFrames.push(compressed);
    }

    let peak = 0;
    for (const v of waveform) peak = Math.max(peak, v);
    for (const frame of spectrumFrames) {
      for (const v of frame) peak = Math.max(peak, v);
    }
    if (peak >= 1e-6) {
      for (let i = 0; i < waveform.length; i += 1) {
        waveform[i] = finite01(waveform[i]! / peak);
      }
      for (const frame of spectrumFrames) {
        for (let i = 0; i < frame.length; i += 1) {
          frame[i] = finite01(frame[i]! / peak);
        }
      }
    } else {
      for (let i = 0; i < waveform.length; i += 1) {
        waveform[i] = finite01(waveform[i]!);
      }
      for (const frame of spectrumFrames) {
        for (let i = 0; i < frame.length; i += 1) {
          frame[i] = finite01(frame[i]!);
        }
      }
    }

    const vis: AudioVisualizationData = {
      schemaVersion: AUDIO_VIS_SCHEMA_VERSION,
      audioContentHash,
      durationMs: Math.round(decoded.durationMs),
      frameIntervalMs: AUDIO_FRAME_INTERVAL_MS,
      waveform,
      spectrumFrames,
    };
    assertFiniteVisualization(vis);
    return vis;
  } catch (err) {
    if (err instanceof AudioIngestError) throw err;
    throw new AudioIngestError(
      'analysis_failed',
      err instanceof Error ? err.message : 'audio analysis failed',
    );
  }
}

export function assertFiniteVisualization(vis: AudioVisualizationData): void {
  for (const v of vis.waveform) {
    if (!Number.isFinite(v) || v < 0 || v > 1) {
      throw new AudioIngestError(
        'analysis_failed',
        'waveform contained a non-finite or out-of-range value',
      );
    }
  }
  for (const frame of vis.spectrumFrames) {
    if (frame.length !== AUDIO_SPECTRUM_BANDS) {
      throw new AudioIngestError(
        'analysis_failed',
        'spectrum frame band count mismatch',
      );
    }
    for (const v of frame) {
      if (!Number.isFinite(v) || v < 0 || v > 1) {
        throw new AudioIngestError(
          'analysis_failed',
          'spectrum contained a non-finite or out-of-range value',
        );
      }
    }
  }
  if (vis.waveform.length !== AUDIO_WAVEFORM_BINS) {
    throw new AudioIngestError(
      'analysis_failed',
      'waveform bin count mismatch',
    );
  }
  if (vis.spectrumFrames.length < 1) {
    throw new AudioIngestError(
      'analysis_failed',
      'spectrum did not cover the clip duration',
    );
  }
}
