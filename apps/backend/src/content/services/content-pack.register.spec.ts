import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ContentPackService } from './content-pack.service';
import { encodeSineWav } from '../audio/wav';

describe('ContentPackService.registerPngAsset', () => {
  let packRoot: string;
  let previousEnv: string | undefined;

  beforeEach(async () => {
    previousEnv = process.env['CONTENT_PACK_ROOT'];
    packRoot = mkdtempSync(join(tmpdir(), 'lh-content-pack-'));
    mkdirSync(join(packRoot, 'assets'), { recursive: true });
    writeFileSync(
      join(packRoot, 'manifest.json'),
      `${JSON.stringify(
        {
          packId: 'lh.test.content.v1',
          packVersion: 1,
          assets: [],
        },
        null,
        2,
      )}\n`,
    );
    process.env['CONTENT_PACK_ROOT'] = packRoot;
  });

  afterEach(() => {
    if (previousEnv === undefined) {
      delete process.env['CONTENT_PACK_ROOT'];
    } else {
      process.env['CONTENT_PACK_ROOT'] = previousEnv;
    }
    rmSync(packRoot, { recursive: true, force: true });
  });

  it('registers a processed PNG and bumps packVersion', async () => {
    const service = new ContentPackService();
    const source = await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const meta = await service.registerPngAsset({
      assetId: 'fog_wipe.reveal.test_img',
      body: source,
    });

    expect(meta.assetId).toBe('fog_wipe.reveal.test_img');
    expect(meta.contentType).toBe('image/png');
    expect(meta.relativePath).toBe('assets/fog_wipe.reveal.test_img.png');
    expect(meta.bytes).toBeGreaterThan(0);
    expect(meta.sha256).toHaveLength(64);

    const absolute = join(packRoot, meta.relativePath);
    expect(existsSync(absolute)).toBe(true);
    const onDisk = readFileSync(absolute);
    expect(createHash('sha256').update(onDisk).digest('hex')).toBe(meta.sha256);
    expect(service.getManifest().packVersion).toBe(2);
    expect(service.listAssets()).toHaveLength(1);

    const decoded = await sharp(onDisk).metadata();
    expect(decoded.width).toBe(720);
    expect(decoded.height).toBe(720);
    expect(decoded.format).toBe('png');
  });

  it('rejects invalid assetId', async () => {
    const service = new ContentPackService();
    await expect(
      service.registerPngAsset({
        assetId: 'Bad Asset!',
        body: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    });
  });
});

describe('ContentPackService.registerChallengeAudio', () => {
  let packRoot: string;
  let previousEnv: string | undefined;

  beforeEach(() => {
    previousEnv = process.env['CONTENT_PACK_ROOT'];
    packRoot = mkdtempSync(join(tmpdir(), 'lh-audio-pack-'));
    mkdirSync(join(packRoot, 'assets'), { recursive: true });
    writeFileSync(
      join(packRoot, 'manifest.json'),
      `${JSON.stringify(
        {
          packId: 'lh.test.content.v1',
          packVersion: 1,
          assets: [],
        },
        null,
        2,
      )}\n`,
    );
    process.env['CONTENT_PACK_ROOT'] = packRoot;
  });

  afterEach(() => {
    if (previousEnv === undefined) {
      delete process.env['CONTENT_PACK_ROOT'];
    } else {
      process.env['CONTENT_PACK_ROOT'] = previousEnv;
    }
    rmSync(packRoot, { recursive: true, force: true });
  });

  it('registers opaque audio + visualization and reuses by content hash', async () => {
    const service = new ContentPackService();
    const body = encodeSineWav({ durationMs: 500, frequencyHz: 330 });
    const first = await service.registerChallengeAudio({
      filename: 'secret_artist_song.wav',
      mimeType: 'audio/wav',
      body,
    });
    expect(first.audio.assetId.startsWith('ca_')).toBe(true);
    expect(first.visualization.assetId.startsWith('cv_')).toBe(true);
    expect(first.audio.assetId).not.toMatch(/secret/i);
    expect(first.audio.relativePath).not.toMatch(/secret/i);
    expect(first.durationMs).toBeGreaterThan(0);
    expect(first.visualizationData.waveform.length).toBeGreaterThan(0);
    expect(service.getManifest().assets.map((a) => a.assetId)).toEqual(
      expect.arrayContaining([
        first.audio.assetId,
        first.visualization.assetId,
      ]),
    );
    const versionAfterFirst = service.getManifest().packVersion;
    const second = await service.registerChallengeAudio({
      filename: 'another_name.wav',
      mimeType: 'audio/wav',
      body,
    });
    expect(second.audio.assetId).toBe(first.audio.assetId);
    expect(service.getManifest().packVersion).toBe(versionAfterFirst);
  });

  it('replacing different audio creates a new analysis version', async () => {
    const service = new ContentPackService();
    const a = await service.registerChallengeAudio({
      filename: 'a.wav',
      mimeType: 'audio/wav',
      body: encodeSineWav({ durationMs: 400, frequencyHz: 220 }),
    });
    const b = await service.registerChallengeAudio({
      filename: 'b.wav',
      mimeType: 'audio/wav',
      body: encodeSineWav({ durationMs: 400, frequencyHz: 880 }),
    });
    expect(b.audio.assetId).not.toBe(a.audio.assetId);
    expect(b.visualization.sha256).not.toBe(a.visualization.sha256);
    expect(service.listAssets().length).toBeGreaterThanOrEqual(4);
  });
});
