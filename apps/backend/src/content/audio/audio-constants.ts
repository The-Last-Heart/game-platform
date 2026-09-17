import {
  AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
  AUDIO_CLIP_HARD_MAX_DURATION_MS,
  AUDIO_CLIP_MIN_MAX_DURATION_MS,
  resolveAudioClipMaxDurationMs,
} from '@thelastheart/contracts';

/** Visualization schema consumed by Flutter and Challenge Studio. */
export const AUDIO_VIS_SCHEMA_VERSION = 1;

export {
  AUDIO_CLIP_DEFAULT_MAX_DURATION_MS,
  AUDIO_CLIP_HARD_MAX_DURATION_MS,
  AUDIO_CLIP_MIN_MAX_DURATION_MS,
  resolveAudioClipMaxDurationMs,
};

/** Default operator cap when Studio has not set `maxAudioDurationMs`. */
export const AUDIO_MAX_DURATION_MS = AUDIO_CLIP_DEFAULT_MAX_DURATION_MS;

/** Existing admin upload cap is 12 MiB; audio clips are far smaller. */
export const AUDIO_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const AUDIO_WAVEFORM_BINS = 160;
export const AUDIO_SPECTRUM_BANDS = 32;
export const AUDIO_FRAME_INTERVAL_MS = 40;
export const AUDIO_ANALYSIS_SAMPLE_RATE = 22050;
export const AUDIO_FFT_SIZE = 1024;

export const AUDIO_ALLOWED_EXTENSIONS = ['.mp3', '.wav'] as const;
export const AUDIO_ALLOWED_MIME = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/vnd.wave',
] as const;

export type AudioAnswerTarget = 'artist' | 'track';

export type AudioIngestErrorCode =
  | 'invalid_extension'
  | 'invalid_mime'
  | 'invalid_signature'
  | 'decode_failed'
  | 'empty_stream'
  | 'unsupported_codec'
  | 'duration_zero'
  | 'duration_exceeded'
  | 'analysis_failed'
  | 'truncated'
  | 'file_too_large';

export class AudioIngestError extends Error {
  readonly code: AudioIngestErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    code: AudioIngestErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AudioIngestError';
    this.code = code;
    this.details = details;
  }
}

export type DecodedPcm = {
  sampleRate: number;
  channels: number;
  /** Interleaved is never used — one Float32Array per channel in -1..1. */
  channelData: Float32Array[];
  durationMs: number;
};

export type AudioVisualizationData = {
  schemaVersion: number;
  audioContentHash: string;
  durationMs: number;
  frameIntervalMs: number;
  waveform: number[];
  spectrumFrames: number[][];
};

export type SanitizedAudioDerivative = {
  body: Buffer;
  contentType: 'audio/wav' | 'audio/mpeg';
  extension: 'wav' | 'mp3';
  decoded: DecodedPcm;
};
