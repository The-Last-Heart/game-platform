import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ContentPackService } from './content-pack.service';

describe('ContentPackService', () => {
  const packRoot = resolve(__dirname, '..', '..', '..', 'content-pack');

  beforeAll(() => {
    process.env['CONTENT_PACK_ROOT'] = packRoot;
    expect(existsSync(join(packRoot, 'manifest.json'))).toBe(true);
  });

  it('serves pack SFX with matching integrity', () => {
    const service = new ContentPackService();
    const manifest = service.getManifest();
    expect(manifest.packId).toBe('lh.local.content.v1');
    expect(manifest.packVersion).toBe(8);
    expect(manifest.assets.some((a) => a.assetId === 'sfx.pulse')).toBe(true);
    expect(manifest.assets.some((a) => a.assetId === 'fog_wipe.reveal_content')).toBe(
      true,
    );
    expect(manifest.assets.some((a) => a.assetId === 'neon_cable.panel_background')).toBe(
      true,
    );
    expect(manifest.assets.some((a) => a.assetId === 'neon_cable.cable_spark')).toBe(
      true,
    );
    expect(manifest.assets.some((a) => a.assetId === 'neon_cable.spark')).toBe(true);
    expect(manifest.assets.some((a) => a.assetId === 'neon_cable.composition')).toBe(
      true,
    );
    expect(manifest.assets.some((a) => a.assetId === 'sfx.strike')).toBe(true);
    expect(manifest.assets.some((a) => a.assetId === 'sfx.win')).toBe(true);
    expect(manifest.assets.some((a) => a.assetId === 'sfx.lose')).toBe(true);
    const pulse = service.getAsset('sfx.pulse');
    expect(pulse.meta.contentType).toBe('audio/wav');
    expect(pulse.body.byteLength).toBe(pulse.meta.bytes);
    const strike = service.getAsset('sfx.strike');
    expect(strike.meta.contentType).toBe('audio/mpeg');
    expect(strike.body.byteLength).toBe(strike.meta.bytes);
    const win = service.getAsset('sfx.win');
    expect(win.meta.contentType).toBe('audio/mpeg');
    expect(win.body.byteLength).toBe(win.meta.bytes);
    const lose = service.getAsset('sfx.lose');
    expect(lose.meta.contentType).toBe('audio/wav');
    expect(lose.body.byteLength).toBe(lose.meta.bytes);
  });
});

