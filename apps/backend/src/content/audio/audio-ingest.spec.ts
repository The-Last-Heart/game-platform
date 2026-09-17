import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AUDIO_MAX_DURATION_MS,
  AUDIO_SPECTRUM_BANDS,
  AUDIO_WAVEFORM_BINS,
  AudioIngestError,
  analyzeDecodedAudio,
  decodeWav,
  encodeSineWav,
  ingestChallengeAudio,
  opaqueAudioAssetId,
  stripMpegMetadata,
} from '../../content/audio';

function id3v2(frames: Buffer): Buffer {
  const size = frames.byteLength;
  const header = Buffer.alloc(10);
  header.write('ID3', 0);
  header[3] = 3;
  header[4] = 0;
  header[5] = 0;
  header[6] = (size >> 21) & 0x7f;
  header[7] = (size >> 14) & 0x7f;
  header[8] = (size >> 7) & 0x7f;
  header[9] = size & 0x7f;
  return Buffer.concat([header, frames]);
}

function textFrame(id: string, text: string): Buffer {
  const payload = Buffer.concat([Buffer.from([0]), Buffer.from(text, 'utf8')]);
  const header = Buffer.alloc(10);
  header.write(id, 0);
  header.writeUInt32BE(payload.byteLength, 4);
  return Buffer.concat([header, payload]);
}

describe('challenge audio ingest', () => {
  const strikePath = resolve(
    __dirname,
    '../../../content-pack/assets/sfx.strike.mp3',
  );

  it('accepts a valid WAV including exactly seven seconds', async () => {
    const wav = encodeSineWav({ durationMs: 7000, frequencyHz: 440 });
    const result = await ingestChallengeAudio({
      filename: 'clip.wav',
      mimeType: 'audio/wav',
      body: wav,
    });
    expect(result.derivative.decoded.durationMs).toBeGreaterThan(6990);
    expect(result.derivative.decoded.durationMs).toBeLessThanOrEqual(
      AUDIO_MAX_DURATION_MS + 1,
    );
    expect(result.audioAssetId.startsWith('ca_')).toBe(true);
    expect(result.visualizationAssetId.startsWith('cv_')).toBe(true);
    expect(result.visualization.waveform).toHaveLength(AUDIO_WAVEFORM_BINS);
    expect(result.visualization.spectrumFrames.length).toBeGreaterThan(10);
    expect(result.visualization.spectrumFrames[0]).toHaveLength(
      AUDIO_SPECTRUM_BANDS,
    );
  });

  it('rejects a clip longer than seven decoded seconds by default', async () => {
    const wav = encodeSineWav({ durationMs: 7001, frequencyHz: 220 });
    await expect(
      ingestChallengeAudio({
        filename: 'long.wav',
        mimeType: 'audio/wav',
        body: wav,
      }),
    ).rejects.toMatchObject({
      code: 'duration_exceeded',
      details: { maxMs: 7000 },
    });
  });

  it('accepts a clip above seven seconds when the operator raises the cap', async () => {
    const wav = encodeSineWav({ durationMs: 8000, frequencyHz: 330 });
    const result = await ingestChallengeAudio({
      filename: 'longer.wav',
      mimeType: 'audio/wav',
      body: wav,
      maxDurationMs: 10_000,
    });
    expect(result.derivative.decoded.durationMs).toBeGreaterThan(7990);
    expect(result.derivative.decoded.durationMs).toBeLessThanOrEqual(8005);
  });

  it('rejects a clip that exceeds a tighter operator cap', async () => {
    const wav = encodeSineWav({ durationMs: 4000, frequencyHz: 220 });
    await expect(
      ingestChallengeAudio({
        filename: 'too-long-for-cap.wav',
        mimeType: 'audio/wav',
        body: wav,
        maxDurationMs: 3000,
      }),
    ).rejects.toMatchObject({
      code: 'duration_exceeded',
      details: { maxMs: 3000 },
    });
  });

  it('accepts a clip at the configured inclusive limit', async () => {
    const wav = encodeSineWav({ durationMs: 3000, frequencyHz: 440 });
    const result = await ingestChallengeAudio({
      filename: 'at-limit.wav',
      mimeType: 'audio/wav',
      body: wav,
      maxDurationMs: 3000,
    });
    expect(result.derivative.decoded.durationMs).toBeGreaterThan(2990);
    expect(result.derivative.decoded.durationMs).toBeLessThanOrEqual(3005);
  });

  it('rejects zero-duration / empty PCM', async () => {
    const empty = Buffer.from('RIFF\0\0\0\0WAVEfmt ');
    await expect(
      ingestChallengeAudio({
        filename: 'empty.wav',
        mimeType: 'audio/wav',
        body: empty,
      }),
    ).rejects.toBeInstanceOf(AudioIngestError);
  });

  it('rejects spoofed extension / MIME type', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(
      ingestChallengeAudio({
        filename: 'song.mp3',
        mimeType: 'audio/mpeg',
        body: png,
      }),
    ).rejects.toMatchObject({ code: 'invalid_signature' });
  });

  it('rejects unsupported format by extension', async () => {
    await expect(
      ingestChallengeAudio({
        filename: 'clip.ogg',
        mimeType: 'audio/ogg',
        body: encodeSineWav({ durationMs: 500, frequencyHz: 100 }),
      }),
    ).rejects.toMatchObject({ code: 'invalid_extension' });
  });

  it('accepts a valid MP3 under seven seconds', async () => {
    const body = readFileSync(strikePath);
    const result = await ingestChallengeAudio({
      filename: 'clip.mp3',
      mimeType: 'audio/mpeg',
      body,
    });
    expect(result.derivative.decoded.durationMs).toBeGreaterThan(0);
    expect(result.derivative.decoded.durationMs).toBeLessThanOrEqual(7000);
    expect(result.derivative.contentType).toBe('audio/mpeg');
  });

  it('strips ID3 artist/title from the runtime MP3 derivative', async () => {
    const mpeg = readFileSync(strikePath);
    const tagged = Buffer.concat([
      id3v2(
        Buffer.concat([
          textFrame('TIT2', 'Secret Song Title'),
          textFrame('TPE1', 'Secret Artist'),
          textFrame('TALB', 'Secret Album'),
          textFrame('COMM', 'answer is option b'),
        ]),
      ),
      mpeg,
    ]);
    const result = await ingestChallengeAudio({
      filename: 'secret.mp3',
      mimeType: 'audio/mpeg',
      body: tagged,
    });
    const runtime = result.derivative.body;
    expect(runtime.includes('Secret Song Title')).toBe(false);
    expect(runtime.includes('Secret Artist')).toBe(false);
    expect(runtime.includes('Secret Album')).toBe(false);
    expect(runtime.subarray(0, 3).toString()).not.toBe('ID3');
    expect(stripMpegMetadata(runtime).equals(runtime)).toBe(true);
    expect(result.audioAssetId).toBe(
      opaqueAudioAssetId(createHash('sha256').update(runtime).digest('hex')),
    );
  });

  it('rejects corrupted audio', async () => {
    const wav = encodeSineWav({ durationMs: 400, frequencyHz: 100 });
    wav[22] = 0xff;
    await expect(
      ingestChallengeAudio({
        filename: 'bad.wav',
        mimeType: 'audio/wav',
        body: wav,
      }),
    ).rejects.toBeInstanceOf(AudioIngestError);
  });

  it('silence produces near-zero visualization values', () => {
    const wav = encodeSineWav({
      durationMs: 500,
      frequencyHz: 0,
      amplitude: 0,
    });
    const decoded = decodeWav(wav);
    const vis = analyzeDecodedAudio(decoded, 'silence');
    const waveMax = Math.max(...vis.waveform);
    const specMax = Math.max(...vis.spectrumFrames.flat());
    expect(waveMax).toBeLessThan(0.05);
    expect(specMax).toBeLessThan(0.05);
  });

  it('places known tone energy in the expected frequency region', () => {
    const wav = encodeSineWav({
      durationMs: 1000,
      frequencyHz: 440,
      sampleRate: 22050,
      amplitude: 0.8,
    });
    const decoded = decodeWav(wav);
    const vis = analyzeDecodedAudio(decoded, 'tone');
    const peakBins = vis.spectrumFrames.reduce((acc, frame) => {
      let best = 0;
      let idx = 0;
      frame.forEach((v, i) => {
        if (v > best) {
          best = v;
          idx = i;
        }
      });
      acc[idx] = (acc[idx] ?? 0) + 1;
      return acc;
    }, new Array<number>(AUDIO_SPECTRUM_BANDS).fill(0));
    const dominant = peakBins.indexOf(Math.max(...peakBins));
    // 440 Hz sits in the lower-mid log bands (not the very top).
    expect(dominant).toBeGreaterThanOrEqual(4);
    expect(dominant).toBeLessThan(20);
    expect(Math.max(...vis.waveform)).toBeGreaterThan(0.2);
  });

  it('reanalyzing identical content is deterministic', () => {
    const wav = encodeSineWav({ durationMs: 800, frequencyHz: 660 });
    const a = analyzeDecodedAudio(decodeWav(wav), 'h');
    const b = analyzeDecodedAudio(decodeWav(wav), 'h');
    expect(a).toEqual(b);
    expect(a.spectrumFrames.length).toBe(b.spectrumFrames.length);
    expect(
      a.spectrumFrames.every((frame) =>
        frame.every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
      ),
    ).toBe(true);
  });

  it('waveform and spectrum frames cover the complete duration', () => {
    const wav = encodeSineWav({ durationMs: 2000, frequencyHz: 300 });
    const decoded = decodeWav(wav);
    const vis = analyzeDecodedAudio(decoded, 'cover');
    const coveredMs = vis.spectrumFrames.length * vis.frameIntervalMs;
    expect(coveredMs).toBeGreaterThanOrEqual(
      decoded.durationMs - vis.frameIntervalMs,
    );
  });
});
