import { execFile } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { AudioIngestError, type DecodedPcm } from './audio-constants';

const execFileAsync = promisify(execFile);

const ID3 = Buffer.from('ID3');
const TAG = Buffer.from('TAG');

function synchsafe(b0: number, b1: number, b2: number, b3: number): number {
  return (
    ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f)
  );
}

/** Drop ID3v2 (leading) and ID3v1 (trailing 128-byte TAG) without touching MPEG frames. */
export function stripMpegMetadata(body: Buffer): Buffer {
  let start = 0;
  if (body.byteLength >= 10 && body.subarray(0, 3).equals(ID3)) {
    const size = synchsafe(body[6]!, body[7]!, body[8]!, body[9]!);
    const footer = (body[5]! & 0x10) !== 0 ? 10 : 0;
    start = Math.min(body.byteLength, 10 + size + footer);
  }
  let end = body.byteLength;
  if (end - start >= 128 && body.subarray(end - 128, end - 125).equals(TAG)) {
    end -= 128;
  }
  if (end - start <= 0) {
    throw new AudioIngestError(
      'empty_stream',
      'MP3 contained no audio frames after stripping metadata',
    );
  }
  return body.subarray(start, end);
}

function looksLikeMpegFrame(buf: Buffer, offset: number): boolean {
  if (offset + 2 > buf.byteLength) return false;
  const b0 = buf[offset]!;
  const b1 = buf[offset + 1]!;
  if (b0 !== 0xff) return false;
  const sync = (b1 & 0xe0) === 0xe0;
  const version = (b1 >> 3) & 0x03;
  const layer = (b1 >> 1) & 0x03;
  return sync && version !== 0x01 && layer !== 0x00;
}

export function isMpegAudio(body: Buffer): boolean {
  if (body.byteLength >= 3 && body.subarray(0, 3).equals(ID3)) {
    return true;
  }
  return looksLikeMpegFrame(body, 0);
}

export function hasIdentifyingId3(body: Buffer): boolean {
  if (body.byteLength >= 10 && body.subarray(0, 3).equals(ID3)) {
    return true;
  }
  return (
    body.byteLength >= 128 &&
    body.subarray(body.byteLength - 128, body.byteLength - 125).equals(TAG)
  );
}

export async function decodeMp3(body: Buffer): Promise<DecodedPcm> {
  const stripped = stripMpegMetadata(body);
  if (!looksLikeMpegFrame(stripped, 0)) {
    // Some files have padding before the first frame.
    let found = false;
    for (let i = 0; i < Math.min(stripped.byteLength - 2, 4096); i += 1) {
      if (looksLikeMpegFrame(stripped, i)) {
        found = true;
        break;
      }
    }
    if (!found) {
      throw new AudioIngestError(
        'invalid_signature',
        'file does not contain MPEG audio frames',
      );
    }
  }

  let MPEGDecoder: new (options?: { enableGapless?: boolean }) => {
    ready: Promise<void>;
    decode: (mpegData: Uint8Array) => {
      channelData: Float32Array[];
      samplesDecoded: number;
      sampleRate: number;
      errors: unknown[];
    };
    free: () => void;
  };
  try {
    ({ MPEGDecoder } = await import('mpg123-decoder'));
  } catch {
    return decodeMp3ViaWorker(stripped);
  }

  const decoder = new MPEGDecoder({ enableGapless: true });
  try {
    await decoder.ready;
    const result = decoder.decode(new Uint8Array(stripped));
    return pcmFromMpegResult(result);
  } catch (err) {
    if (err instanceof AudioIngestError) throw err;
    throw new AudioIngestError(
      'decode_failed',
      err instanceof Error ? err.message : 'MP3 decode failed',
    );
  } finally {
    decoder.free();
  }
}

function pcmFromMpegResult(result: {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: number;
}): DecodedPcm {
  if (!result.samplesDecoded || result.samplesDecoded <= 0) {
    throw new AudioIngestError(
      'empty_stream',
      'MP3 decoded to an empty audio stream',
    );
  }
  if (!result.sampleRate || result.sampleRate < 8000) {
    throw new AudioIngestError(
      'unsupported_codec',
      `unsupported MP3 sample rate ${result.sampleRate}`,
    );
  }
  if (!result.channelData?.length) {
    throw new AudioIngestError('empty_stream', 'MP3 had no channel data');
  }
  const durationMs = (result.samplesDecoded / result.sampleRate) * 1000;
  return {
    sampleRate: result.sampleRate,
    channels: result.channelData.length,
    channelData: result.channelData,
    durationMs,
  };
}

function workerScriptPath(): string {
  const here = join(__dirname, 'decode-mp3-worker.mjs');
  if (existsSync(here)) return here;
  return join(process.cwd(), 'src/content/audio/decode-mp3-worker.mjs');
}

async function decodeMp3ViaWorker(stripped: Buffer): Promise<DecodedPcm> {
  const dir = mkdtempSync(join(tmpdir(), 'lh-mp3-'));
  const inputPath = join(dir, 'clip.mp3');
  const outputPath = join(dir, 'pcm.json');
  writeFileSync(inputPath, stripped);
  try {
    await execFileAsync(
      process.execPath,
      [workerScriptPath(), inputPath, outputPath],
      {
        timeout: 20000,
      },
    );
    const parsed = JSON.parse(readFileSync(outputPath, 'utf8')) as {
      sampleRate: number;
      samplesDecoded: number;
      channels: number[][];
    };
    return pcmFromMpegResult({
      sampleRate: parsed.sampleRate,
      samplesDecoded: parsed.samplesDecoded,
      channelData: (parsed.channels ?? []).map((ch) => Float32Array.from(ch)),
    });
  } catch (err) {
    if (err instanceof AudioIngestError) throw err;
    throw new AudioIngestError(
      'decode_failed',
      err instanceof Error
        ? `MP3 decoder unavailable: ${err.message}`
        : 'MP3 decoder unavailable',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
