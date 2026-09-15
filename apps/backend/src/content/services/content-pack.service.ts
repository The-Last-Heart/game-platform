import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable, NotFoundException } from '@nestjs/common';

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

@Injectable()
export class ContentPackService {
  private readonly rootDir: string;
  private readonly manifest: ContentPackManifest;

  constructor() {
    this.rootDir = resolveContentPackRoot();
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
    this.manifest = parsed;
  }

  getManifest(): ContentPackManifest {
    return this.manifest;
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
