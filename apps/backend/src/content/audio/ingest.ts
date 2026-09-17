import { createHash } from 'node:crypto';
import {
  AUDIO_ALLOWED_EXTENSIONS,
  AUDIO_ALLOWED_MIME,
  AUDIO_MAX_UPLOAD_BYTES,
  AudioIngestError,
  resolveAudioClipMaxDurationMs,
  type SanitizedAudioDerivative,
} from './audio-constants';
import { analyzeDecodedAudio } from './analyze';
import {
  decodeMp3,
  hasIdentifyingId3,
  isMpegAudio,
  stripMpegMetadata,
} from './mp3';
import { decodeWav, encodePcm16Wav, isRiffWave } from './wav';

const MP3_MIME = new Set(['audio/mpeg', 'audio/mp3']);
const WAV_MIME = new Set([
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/vnd.wave',
]);

export function normalizeExtension(filename: string | undefined): string {
  const raw = (filename ?? '').trim().toLowerCase();
  const dot = raw.lastIndexOf('.');
  return dot >= 0 ? raw.slice(dot) : '';
}

export function sha256Hex(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

export function opaqueAudioAssetId(contentHash: string): string {
  return `ca_${contentHash.slice(0, 16)}`;
}

export function opaqueVisualizationAssetId(contentHash: string): string {
  return `cv_${contentHash.slice(0, 16)}`;
}

function assertDeclaredTypes(input: {
  filename?: string;
  mimeType?: string;
  body: Buffer;
}): { kind: 'wav' | 'mp3' } {
  if (input.body.byteLength <= 0) {
    throw new AudioIngestError('empty_stream', 'upload is empty');
  }
  if (input.body.byteLength > AUDIO_MAX_UPLOAD_BYTES) {
    throw new AudioIngestError(
      'file_too_large',
      'audio file exceeds size limit',
      {
        maxBytes: AUDIO_MAX_UPLOAD_BYTES,
        bytes: input.body.byteLength,
      },
    );
  }
  const ext = normalizeExtension(input.filename);
  if (ext && !(AUDIO_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new AudioIngestError(
      'invalid_extension',
      'only .mp3 and .wav uploads are allowed',
      { extension: ext },
    );
  }
  const mime = (input.mimeType ?? '').trim().toLowerCase();
  if (mime && !(AUDIO_ALLOWED_MIME as readonly string[]).includes(mime)) {
    throw new AudioIngestError(
      'invalid_mime',
      'declared MIME type is not an allowed audio type',
      { mimeType: mime },
    );
  }

  const wavMagic = isRiffWave(input.body);
  const mp3Magic = isMpegAudio(input.body);

  if (ext === '.wav' || WAV_MIME.has(mime)) {
    if (!wavMagic) {
      throw new AudioIngestError(
        'invalid_signature',
        'declared WAV does not match a RIFF WAVE signature',
      );
    }
    return { kind: 'wav' };
  }
  if (ext === '.mp3' || MP3_MIME.has(mime)) {
    if (!mp3Magic) {
      throw new AudioIngestError(
        'invalid_signature',
        'declared MP3 does not match MPEG/ID3 signatures',
      );
    }
    return { kind: 'mp3' };
  }

  if (wavMagic) return { kind: 'wav' };
  if (mp3Magic) return { kind: 'mp3' };
  throw new AudioIngestError(
    'invalid_signature',
    'unrecognized audio file signature',
  );
}

function assertDuration(durationMs: number, maxDurationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new AudioIngestError(
      'duration_zero',
      'decoded audio duration must be greater than 0',
      { durationMs },
    );
  }
  if (durationMs > maxDurationMs + 0.5) {
    throw new AudioIngestError(
      'duration_exceeded',
      `decoded audio duration must be less than or equal to ${(
        maxDurationMs / 1000
      ).toFixed(3)} seconds`,
      { durationMs, maxMs: maxDurationMs },
    );
  }
}

export async function ingestChallengeAudio(input: {
  filename?: string;
  mimeType?: string;
  body: Buffer;
  maxDurationMs?: number;
}): Promise<{
  derivative: SanitizedAudioDerivative;
  visualization: ReturnType<typeof analyzeDecodedAudio>;
  contentHash: string;
  audioAssetId: string;
  visualizationAssetId: string;
}> {
  const { kind } = assertDeclaredTypes(input);

  let decoded;
  let derivative: SanitizedAudioDerivative;
  try {
    if (kind === 'wav') {
      decoded = decodeWav(input.body);
      const sanitized = encodePcm16Wav(decoded);
      decoded = decodeWav(sanitized);
      derivative = {
        body: sanitized,
        contentType: 'audio/wav',
        extension: 'wav',
        decoded,
      };
    } else {
      decoded = await decodeMp3(input.body);
      const stripped = stripMpegMetadata(input.body);
      if (hasIdentifyingId3(stripped)) {
        throw new AudioIngestError(
          'decode_failed',
          'failed to strip identifying MPEG metadata',
        );
      }
      derivative = {
        body: Buffer.from(stripped),
        contentType: 'audio/mpeg',
        extension: 'mp3',
        decoded,
      };
    }
  } catch (err) {
    if (err instanceof AudioIngestError) throw err;
    throw new AudioIngestError(
      'decode_failed',
      err instanceof Error ? err.message : 'audio decode failed',
    );
  }

  if (
    !decoded.channelData.length ||
    (decoded.channelData[0]?.length ?? 0) === 0
  ) {
    throw new AudioIngestError('empty_stream', 'decoded audio stream is empty');
  }
  assertDuration(
    decoded.durationMs,
    resolveAudioClipMaxDurationMs(input.maxDurationMs),
  );

  const contentHash = sha256Hex(derivative.body);
  const visualization = analyzeDecodedAudio(decoded, contentHash);
  visualization.durationMs = Math.round(decoded.durationMs);

  return {
    derivative,
    visualization,
    contentHash,
    audioAssetId: opaqueAudioAssetId(contentHash),
    visualizationAssetId: opaqueVisualizationAssetId(contentHash),
  };
}
