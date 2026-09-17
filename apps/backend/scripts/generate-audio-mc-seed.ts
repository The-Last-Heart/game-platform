/**
 * Generate opaque Guess-the-Audio seed clips + visualization JSON.
 * Run: pnpm --filter @thelastheart/backend exec ts-node -r tsconfig-paths/register src/../scripts/generate-audio-mc-seed.ts
 * (invoked from apps/backend)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ingestChallengeAudio } from '../src/content/audio/ingest';
import { encodeSineWav } from '../src/content/audio/wav';

async function main(): Promise<void> {
  const packRoot = resolve(__dirname, '../content-pack');
  const clips = [
    { durationMs: 2000, frequencyHz: 440, label: 'a' },
    { durationMs: 2000, frequencyHz: 880, label: 'b' },
  ];
  const manifestPath = join(packRoot, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    packId: string;
    packVersion: number;
    assets: Array<Record<string, unknown>>;
  };

  for (const clip of clips) {
    const wav = encodeSineWav(clip);
    const ingested = await ingestChallengeAudio({
      filename: 'clip.wav',
      mimeType: 'audio/wav',
      body: wav,
    });
    const audioPath = join(
      packRoot,
      'assets',
      `${ingested.audioAssetId}.wav`,
    );
    const vizPath = join(
      packRoot,
      'assets',
      `${ingested.visualizationAssetId}.json`,
    );
    writeFileSync(audioPath, ingested.derivative.body);
    writeFileSync(vizPath, `${JSON.stringify(ingested.visualization)}\n`);

    upsert(manifest.assets, {
      assetId: ingested.audioAssetId,
      relativePath: `assets/${ingested.audioAssetId}.wav`,
      contentType: 'audio/wav',
      bytes: ingested.derivative.body.byteLength,
      sha256: ingested.contentHash,
      durationMs: Math.round(ingested.derivative.decoded.durationMs),
      analysisSchemaVersion: ingested.visualization.schemaVersion,
      visualizationAssetId: ingested.visualizationAssetId,
      kind: 'audio',
    });
    const vizBody = Buffer.from(`${JSON.stringify(ingested.visualization)}\n`);
    upsert(manifest.assets, {
      assetId: ingested.visualizationAssetId,
      relativePath: `assets/${ingested.visualizationAssetId}.json`,
      contentType: 'application/json',
      bytes: vizBody.byteLength,
      sha256: createHash('sha256').update(vizBody).digest('hex'),
      durationMs: ingested.visualization.durationMs,
      analysisSchemaVersion: ingested.visualization.schemaVersion,
      kind: 'visualization',
    });
    process.stdout.write(
      `${clip.label} audio=${ingested.audioAssetId} viz=${ingested.visualizationAssetId} duration=${ingested.derivative.decoded.durationMs.toFixed(1)}\n`,
    );
  }

  manifest.packVersion += 1;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function upsert(
  assets: Array<Record<string, unknown>>,
  meta: Record<string, unknown>,
): void {
  const idx = assets.findIndex((a) => a['assetId'] === meta['assetId']);
  if (idx >= 0) assets[idx] = meta;
  else assets.push(meta);
}

void main();
