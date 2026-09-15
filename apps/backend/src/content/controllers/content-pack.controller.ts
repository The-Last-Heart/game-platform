import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ContentPackService } from '../services/content-pack.service';

/**
 * Public content-pack endpoints for mobile boot download.
 * Challenge/game assets are never embedded in the app bundle.
 */
@Controller('v1/content/pack')
export class ContentPackController {
  constructor(private readonly contentPack: ContentPackService) {}

  @Get('manifest')
  @Header('Cache-Control', 'no-store')
  getManifest() {
    return this.contentPack.getManifest();
  }

  @Get('assets/:assetId')
  @Header('Cache-Control', 'public, max-age=3600')
  getAsset(@Param('assetId') assetId: string, @Res() res: Response): void {
    const { meta, body } = this.contentPack.getAsset(assetId);
    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Length', String(body.byteLength));
    res.setHeader('X-Content-Sha256', meta.sha256);
    res.send(body);
  }
}
