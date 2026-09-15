import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import sharp from 'sharp';

export type ContentPackAssetMeta = {
  assetId: string;
  relativePath: string;
  contentType: string;
  bytes: number;
  sha256: string;
};

export type ContentPackManifest = {
  packId: string;
  packVersion: number;
  assets: ContentPackAssetMeta[];
};

const ASSET_ID_RE = /^[a-z0-9][a-z0-9._-]{1,126}$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const REVEAL_CANVAS_PX = 720;
/** Near-pure black RGB threshold for opaque → transparent conversion. */
const BLACK_THRESHOLD = 2;

@Injectable()
export class ContentPackService {
  private readonly rootDir: string;
  private manifest: ContentPackManifest;

  constructor() {
    this.rootDir = resolveContentPackRoot();
    this.manifest = this.loadManifestFromDisk();
  }

  getManifest(): ContentPackManifest {
    return this.manifest;
  }

  listAssets(): ContentPackAssetMeta[] {
    return this.manifest.assets.map((a) => ({ ...a }));
  }

  getAsset(assetId: string): {
    meta: ContentPackAssetMeta;
    absolutePath: string;
    body: Buffer;
  } {
    const meta = this.manifest.assets.find((a) => a.assetId === assetId);
    if (!meta) {
      throw new NotFoundException({
        code: 'CONTENT_ASSET_NOT_FOUND',
        message: 'asset not found',
      });
    }
    const absolutePath = resolve(this.rootDir, meta.relativePath);
    if (!absolutePath.startsWith(this.rootDir) || !existsSync(absolutePath)) {
      throw new NotFoundException({
        code: 'CONTENT_ASSET_NOT_FOUND',
        message: 'asset file missing',
      });
    }
    const body = readFileSync(absolutePath);
    const digest = createHash('sha256').update(body).digest('hex');
    if (digest !== meta.sha256 || body.byteLength !== meta.bytes) {
      throw new Error(`content pack asset integrity failed for ${assetId}`);
    }
    return { meta, absolutePath, body };
  }

  /**
   * Register or replace a PNG reveal/content asset in the local pack.
   * Resizes into a 720×720 transparent canvas, clears near-black pixels, and
   * bumps packVersion.
   */
  async registerPngAsset(input: {
    assetId: string;
    body: Buffer;
  }): Promise<ContentPackAssetMeta> {
    const assetId = input.assetId.trim();
    if (!ASSET_ID_RE.test(assetId)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          'assetId must match ^[a-z0-9][a-z0-9._-]{1,126}$',
      });
    }
    if (!input.body?.byteLength) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'file body is required',
      });
    }

    let processed: Buffer;
    try {
      processed = await processRevealPng(input.body);
    } catch (err) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message:
          err instanceof Error
            ? `invalid image: ${err.message}`
            : 'invalid image',
      });
    }

    const assetsDir = join(this.rootDir, 'assets');
    if (!existsSync(assetsDir)) {
      mkdirSync(assetsDir, { recursive: true });
    }

    const relativePath = `assets/${assetId}.png`;
    const absolutePath = join(this.rootDir, relativePath);
    if (!absolutePath.startsWith(this.rootDir)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'invalid asset path',
      });
    }

    writeFileSync(absolutePath, processed);

    const sha256 = createHash('sha256').update(processed).digest('hex');
    const meta: ContentPackAssetMeta = {
      assetId,
      relativePath,
      contentType: 'image/png',
      bytes: processed.byteLength,
      sha256,
    };

    const nextAssets = [...this.manifest.assets];
    const existingIdx = nextAssets.findIndex((a) => a.assetId === assetId);
    if (existingIdx >= 0) {
      nextAssets[existingIdx] = meta;
    } else {
      nextAssets.push(meta);
    }

    const nextManifest: ContentPackManifest = {
      packId: this.manifest.packId,
      packVersion: this.manifest.packVersion + 1,
      assets: nextAssets,
    };

    this.persistManifestAtomic(nextManifest);
    this.manifest = this.loadManifestFromDisk();

    const registered = this.manifest.assets.find((a) => a.assetId === assetId);
    if (!registered) {
      throw new Error(`failed to reload registered asset ${assetId}`);
    }
    return { ...registered };
  }

  private loadManifestFromDisk(): ContentPackManifest {
    const manifestPath = join(this.rootDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`content pack manifest missing at ${manifestPath}`);
    }
    const parsed = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    ) as ContentPackManifest;
    if (
      !parsed.packId ||
      !Number.isFinite(parsed.packVersion) ||
      !Array.isArray(parsed.assets)
    ) {
      throw new Error('content pack manifest is invalid');
    }
    return parsed;
  }

  private persistManifestAtomic(manifest: ContentPackManifest): void {
    const manifestPath = join(this.rootDir, 'manifest.json');
    const tmpPath = join(this.rootDir, `manifest.json.tmp.${process.pid}`);
    const body = `${JSON.stringify(manifest, null, 2)}\n`;
    writeFileSync(tmpPath, body, 'utf8');
    renameSync(tmpPath, manifestPath);
  }
}

async function processRevealPng(body: Buffer): Promise<Buffer> {
  if (
    body.byteLength < PNG_MAGIC.byteLength ||
    !body.subarray(0, PNG_MAGIC.byteLength).equals(PNG_MAGIC)
  ) {
    // Allow non-PNG inputs through sharp (jpeg/webp) when convertible.
    // Prefer PNG magic when present; otherwise let sharp decode.
  }

  const resized = sharp(body)
    .ensureAlpha()
    .resize(REVEAL_CANVAS_PX, REVEAL_CANVAS_PX, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

  const { data, info } = await resized
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  if (channels < 4) {
    throw new Error('expected RGBA buffer after ensureAlpha');
  }

  for (let i = 0; i < data.byteLength; i += channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (
      a > 0 &&
      r <= BLACK_THRESHOLD &&
      g <= BLACK_THRESHOLD &&
      b <= BLACK_THRESHOLD
    ) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function resolveContentPackRoot(): string {
  const fromEnv = process.env['CONTENT_PACK_ROOT']?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }
  const candidates = [
    resolve(process.cwd(), 'content-pack'),
    resolve(process.cwd(), 'apps/backend/content-pack'),
    resolve(__dirname, '..', '..', '..', 'content-pack'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'manifest.json'))) {
      return candidate;
    }
  }
  return candidates[0]!;
}
