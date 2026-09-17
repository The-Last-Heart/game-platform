import { MPEGDecoder } from 'mpg123-decoder';
import { readFileSync, writeFileSync } from 'node:fs';

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) {
  process.stderr.write('usage: decode-mp3-worker.mjs <input.mp3> <output.json>\n');
  process.exit(2);
}

const body = readFileSync(inputPath);
const decoder = new MPEGDecoder({ enableGapless: true });
await decoder.ready;
try {
  const result = decoder.decode(new Uint8Array(body));
  writeFileSync(
    outputPath,
    JSON.stringify({
      sampleRate: result.sampleRate,
      samplesDecoded: result.samplesDecoded,
      channels: result.channelData.map((ch) => Array.from(ch)),
    }),
  );
} finally {
  decoder.free();
}
