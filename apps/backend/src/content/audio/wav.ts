import { AudioIngestError, type DecodedPcm } from './audio-constants';

const RIFF = Buffer.from('RIFF');
const WAVE = Buffer.from('WAVE');
const FMT = Buffer.from('fmt ');
const DATA = Buffer.from('data');

function u16(buf: Buffer, offset: number, le = true): number {
  return le ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}

function u32(buf: Buffer, offset: number, le = true): number {
  return le ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
}

function i16(buf: Buffer, offset: number): number {
  return buf.readInt16LE(offset);
}

function findChunk(
  buf: Buffer,
  fourcc: Buffer,
  start: number,
): { offset: number; size: number } | null {
  let cursor = start;
  while (cursor + 8 <= buf.byteLength) {
    const size = u32(buf, cursor + 4);
    if (buf.subarray(cursor, cursor + 4).equals(fourcc)) {
      return { offset: cursor + 8, size };
    }
    if (!Number.isFinite(size) || size < 0) {
      return null;
    }
    cursor += 8 + size + (size % 2);
  }
  return null;
}

/**
 * Decode PCM WAV (8/16/24/32-bit integer or 32-bit float). Extra LIST/INFO/id3
 * chunks are ignored. Compressed WAV (µ-law, ADPCM, extensible non-PCM) is rejected.
 */
export function decodeWav(body: Buffer): DecodedPcm {
  if (body.byteLength < 12 || !body.subarray(0, 4).equals(RIFF)) {
    throw new AudioIngestError(
      'invalid_signature',
      'file is not a RIFF WAVE container',
    );
  }
  if (!body.subarray(8, 12).equals(WAVE)) {
    throw new AudioIngestError('invalid_signature', 'RIFF file is not WAVE');
  }

  const fmt = findChunk(body, FMT, 12);
  const data = findChunk(body, DATA, 12);
  if (!fmt || fmt.size < 16) {
    throw new AudioIngestError('unsupported_codec', 'WAVE fmt chunk missing');
  }
  if (!data) {
    throw new AudioIngestError('empty_stream', 'WAVE data chunk missing');
  }
  if (fmt.offset + 16 > body.byteLength || data.offset > body.byteLength) {
    throw new AudioIngestError('truncated', 'WAVE file is truncated');
  }

  const audioFormat = u16(body, fmt.offset);
  const channels = u16(body, fmt.offset + 2);
  const sampleRate = u32(body, fmt.offset + 4);
  const bitsPerSample = u16(body, fmt.offset + 14);
  const blockAlign = u16(body, fmt.offset + 12);

  if (channels < 1 || channels > 8) {
    throw new AudioIngestError(
      'unsupported_codec',
      `unsupported channel count ${channels}`,
    );
  }
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000
  ) {
    throw new AudioIngestError(
      'unsupported_codec',
      `unsupported sample rate ${sampleRate}`,
    );
  }

  // 1 = PCM, 3 = IEEE float. WAVE_FORMAT_EXTENSIBLE (0xFFFE) is accepted when
  // the subformat GUID is PCM or float.
  let isFloat = audioFormat === 3;
  let isPcm = audioFormat === 1;
  if (audioFormat === 0xfffe && fmt.size >= 40) {
    const subFormat = body.subarray(fmt.offset + 24, fmt.offset + 40);
    const pcmGuid = Buffer.from('0100000000001000800000aa00389b71', 'hex');
    const floatGuid = Buffer.from('0300000000001000800000aa00389b71', 'hex');
    isPcm = subFormat.equals(pcmGuid);
    isFloat = subFormat.equals(floatGuid);
  }
  if (!isPcm && !isFloat) {
    throw new AudioIngestError(
      'unsupported_codec',
      `unsupported WAVE format ${audioFormat}`,
    );
  }
  if (![8, 16, 24, 32].includes(bitsPerSample)) {
    throw new AudioIngestError(
      'unsupported_codec',
      `unsupported PCM bit depth ${bitsPerSample}`,
    );
  }

  const bytesPerSample = bitsPerSample / 8;
  const expectedAlign = channels * bytesPerSample;
  if (blockAlign !== expectedAlign) {
    throw new AudioIngestError(
      'truncated',
      'WAVE block align does not match channels and bit depth',
    );
  }

  const available = Math.max(0, body.byteLength - data.offset);
  const dataSize = Math.min(data.size, available);
  if (dataSize < blockAlign) {
    throw new AudioIngestError('empty_stream', 'WAVE data chunk is empty');
  }
  const frameCount = Math.floor(dataSize / blockAlign);
  if (frameCount <= 0) {
    throw new AudioIngestError('empty_stream', 'WAVE contains no audio frames');
  }

  const channelData = Array.from(
    { length: channels },
    () => new Float32Array(frameCount),
  );
  const pcm = body.subarray(data.offset, data.offset + frameCount * blockAlign);

  for (let i = 0; i < frameCount; i += 1) {
    const base = i * blockAlign;
    for (let ch = 0; ch < channels; ch += 1) {
      const off = base + ch * bytesPerSample;
      let sample = 0;
      if (isFloat && bitsPerSample === 32) {
        sample = pcm.readFloatLE(off);
      } else if (bitsPerSample === 8) {
        sample = (pcm[off]! - 128) / 128;
      } else if (bitsPerSample === 16) {
        sample = i16(pcm, off) / 32768;
      } else if (bitsPerSample === 24) {
        const b0 = pcm[off]!;
        const b1 = pcm[off + 1]!;
        const b2 = pcm[off + 2]!;
        let val = b0 | (b1 << 8) | (b2 << 16);
        if (val & 0x800000) val |= ~0xffffff;
        sample = val / 8388608;
      } else {
        sample = pcm.readInt32LE(off) / 2147483648;
      }
      if (!Number.isFinite(sample)) {
        throw new AudioIngestError('decode_failed', 'WAVE PCM contained NaN');
      }
      channelData[ch]![i] = Math.max(-1, Math.min(1, sample));
    }
  }

  const durationMs = (frameCount / sampleRate) * 1000;
  return { sampleRate, channels, channelData, durationMs };
}

/** Canonical PCM16 WAV with no LIST/INFO/id3 metadata chunks. */
export function encodePcm16Wav(decoded: DecodedPcm): Buffer {
  const channels = Math.max(1, Math.min(2, decoded.channels));
  const frames = decoded.channelData[0]?.length ?? 0;
  const sampleRate = decoded.sampleRate;
  const blockAlign = channels * 2;
  const dataSize = frames * blockAlign;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < frames; i += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const s =
        decoded.channelData[ch]?.[i] ?? decoded.channelData[0]?.[i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, s));
      const int = Math.max(
        -32768,
        Math.min(32767, Math.round(clamped * 32767)),
      );
      buf.writeInt16LE(int, 44 + i * blockAlign + ch * 2);
    }
  }
  return buf;
}

export function isRiffWave(body: Buffer): boolean {
  return (
    body.byteLength >= 12 &&
    body.subarray(0, 4).equals(RIFF) &&
    body.subarray(8, 12).equals(WAVE)
  );
}

/** Deterministic PCM16 sine (or silence when frequencyHz is 0) for tests and seeds. */
export function encodeSineWav(input: {
  durationMs: number;
  frequencyHz: number;
  sampleRate?: number;
  amplitude?: number;
}): Buffer {
  const sampleRate = input.sampleRate ?? 22050;
  const frames = Math.max(
    1,
    Math.round((input.durationMs / 1000) * sampleRate),
  );
  const amplitude = input.amplitude ?? 0.6;
  const samples = new Float32Array(frames);
  if (input.frequencyHz > 0) {
    for (let i = 0; i < frames; i += 1) {
      samples[i] =
        amplitude *
        Math.sin((2 * Math.PI * input.frequencyHz * i) / sampleRate);
    }
  }
  return encodePcm16Wav({
    sampleRate,
    channels: 1,
    channelData: [samples],
    durationMs: (frames / sampleRate) * 1000,
  });
}
