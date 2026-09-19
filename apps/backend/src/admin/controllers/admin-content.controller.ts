import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import {
  adminCatalogComposeRequestSchema,
  adminChallengeAnalyticsQuerySchema,
  adminContentApproveRequestSchema,
  adminContentDraftUpsertRequestSchema,
  adminContentLiveEligibilityRequestSchema,
  adminContentBulkPauseRequestSchema,
  adminContentPauseRequestSchema,
  adminContentPromoteVersionRequestSchema,
  adminContentPublishCatalogRequestSchema,
  adminContentRejectRequestSchema,
  adminContentRetireRequestSchema,
  adminContentRollbackRequestSchema,
  adminContentSubmitRequestSchema,
  adminContentTemplateListQuerySchema,
  adminContentUpdateDraftRequestSchema,
  adminDailyGoalsUpsertRequestSchema,
  adminEmergencyControlsPatchRequestSchema,
  adminEmergencyControlsSchema,
  adminAppVersionPolicySchema,
  adminAppVersionPolicyPatchRequestSchema,
  adminGameModeRulesUpsertRequestSchema,
  adminLocalizationUpsertRequestSchema,
  adminPowerConfigUpsertRequestSchema,
  adminSuccessEnvelopeSchema,
  compareStableSemVer,
} from '@thelastheart/contracts';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import type { AdminAuthContext } from '../services/admin.types';
import { ContentLifecycleService } from '../../content/services/content-lifecycle.service';
import { ContentPackService } from '../../content/services/content-pack.service';
import { AudioIngestError } from '../../content/audio';
import { EmergencyControlsService } from '../../content/services/emergency-controls.service';
import { AppVersionPolicyService } from '../../content/services/app-version-policy.service';
import { ReleaseResolverService } from '../../content/services/release-resolver.service';
import { MatchService } from '../../match/services/match.service';
import { MatchmakingService } from '../../match/services/matchmaking.service';
import { DomainError } from '../../match/domain/types';

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

@Controller('api/admin/v1/content')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminContentController {
  constructor(
    private readonly content: ContentLifecycleService,
    private readonly releases: ReleaseResolverService,
    private readonly contentPack: ContentPackService,
  ) {}

  // ── Read endpoints ───────────────────────────────────────────────────────

  @Get('studio/home')
  @RequirePermissions('content:read')
  async studioHome() {
    return ok(await this.content.getStudioHomeSummary());
  }

  @Get('templates')
  @RequirePermissions('content:read')
  async listTemplates(@Query() query: Record<string, unknown>) {
    const parsed = adminContentTemplateListQuerySchema.safeParse(query);
    if (!parsed.success) {
      return ok(await this.content.listTemplates());
    }
    return ok(await this.content.listTemplatesFiltered(parsed.data));
  }

  @Get('templates/:templateId')
  @RequirePermissions('content:read')
  async getTemplateDetail(@Param('templateId') templateId: string) {
    return ok(await this.content.getTemplateDetail(templateId));
  }

  @Get('releases')
  @RequirePermissions('content:read')
  async listReleases() {
    return ok(await this.content.listReleases());
  }

  @Get('analytics')
  @RequirePermissions('content:read')
  async listAnalytics(@Query() query: Record<string, unknown>) {
    const parsed = adminChallengeAnalyticsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid analytics query' },
      });
    }
    return ok(await this.content.listChallengeAnalytics(parsed.data));
  }

  @Get('diff/:versionIdA/:versionIdB')
  @RequirePermissions('content:read')
  async getVersionDiff(
    @Param('versionIdA') versionIdA: string,
    @Param('versionIdB') versionIdB: string,
  ) {
    return ok(await this.content.getVersionDiff(versionIdA, versionIdB));
  }

  @Post('proof')
  @RequirePermissions('content:read')
  async computeProof(@Body() body: unknown) {
    const entries = Array.isArray(body)
      ? body
      : (body as Record<string, unknown>)?.entries;
    if (!Array.isArray(entries)) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'entries array required' },
      });
    }
    return ok(this.content.computeCatalogProof(entries));
  }

  // ── Content pack assets ──────────────────────────────────────────────────

  @Get('pack/assets')
  @RequirePermissions('content:read')
  listPackAssets() {
    const manifest = this.contentPack.getManifest();
    return ok({
      packId: manifest.packId,
      packVersion: manifest.packVersion,
      assets: this.contentPack.listAssets(),
    });
  }

  @Get('pack/assets/:assetId')
  @RequirePermissions('content:read')
  @Header('Cache-Control', 'private, no-store')
  getPackAsset(@Param('assetId') assetId: string, @Res() res: Response): void {
    const { meta, body } = this.contentPack.getAsset(assetId);
    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Length', String(body.byteLength));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Sha256', meta.sha256);
    res.send(body);
  }

  @Post('pack/assets')
  @RequirePermissions('content:write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async registerPackAsset(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('assetId') assetIdQuery: string | undefined,
    @Body() body: { assetId?: string } | undefined,
  ) {
    const assetId =
      (typeof assetIdQuery === 'string' && assetIdQuery.trim()) ||
      (typeof body?.assetId === 'string' && body.assetId.trim()) ||
      '';
    if (!assetId) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'assetId query or form field is required',
        },
      });
    }
    if (!file?.buffer?.byteLength) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'multipart field "file" is required',
        },
      });
    }
    const asset = await this.contentPack.registerPngAsset({
      assetId,
      body: file.buffer,
    });
    return ok({
      packVersion: this.contentPack.getManifest().packVersion,
      asset,
    });
  }

  @Post('pack/audio')
  @RequirePermissions('content:write')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async registerChallengeAudio(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('maxDurationMs') maxDurationMsQuery: string | undefined,
  ) {
    if (!file?.buffer?.byteLength) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'multipart field "file" is required',
          details: { code: 'audio.empty' },
        },
      });
    }
    try {
      const registered = await this.contentPack.registerChallengeAudio({
        filename: file.originalname,
        mimeType: file.mimetype,
        body: file.buffer,
        maxDurationMs: maxDurationMsQuery,
      });
      return ok({
        packVersion: this.contentPack.getManifest().packVersion,
        audioAssetId: registered.audio.assetId,
        visualizationAssetId: registered.visualization.assetId,
        durationMs: registered.durationMs,
        analysisSchemaVersion: registered.analysisSchemaVersion,
        contentType: registered.audio.contentType,
        sha256: registered.audio.sha256,
        visualization: registered.visualizationData,
      });
    } catch (err) {
      if (err instanceof AudioIngestError) {
        throw new BadRequestException({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: err.message,
            details: { code: `audio.${err.code}`, ...err.details },
          },
        });
      }
      throw err;
    }
  }

  // ── Draft endpoints ──────────────────────────────────────────────────────

  @Post('drafts')
  @RequirePermissions('content:draft')
  async upsertDraft(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentDraftUpsertRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid draft payload',
          details: parsed.error.flatten(),
        },
      });
    }
    return ok(await this.content.upsertDraft(admin.user.id, parsed.data));
  }

  @Post('drafts/update')
  @RequirePermissions('content:draft')
  async updateDraft(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentUpdateDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid update draft payload',
        },
      });
    }
    return ok(
      await this.content.updateDraft(
        admin.user.id,
        parsed.data.templateVersionId,
        parsed.data.definition,
      ),
    );
  }

  @Post('submit')
  @RequirePermissions('content:draft')
  async submit(@CurrentAdmin() admin: AdminAuthContext, @Body() body: unknown) {
    const parsed = adminContentSubmitRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid submit payload' },
      });
    }
    return ok(
      await this.content.submit(
        admin.user.id,
        parsed.data.templateVersionId,
        parsed.data.notes,
      ),
    );
  }

  @Post('reject')
  @RequirePermissions('content:draft')
  async reject(@CurrentAdmin() admin: AdminAuthContext, @Body() body: unknown) {
    const parsed = adminContentRejectRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid reject payload' },
      });
    }
    return ok(
      await this.content.reject(
        admin.user.id,
        parsed.data.templateVersionId,
        parsed.data.notes,
      ),
    );
  }

  // ── Review endpoints ─────────────────────────────────────────────────────

  @Post('in-review')
  @RequirePermissions('content:review')
  async markInReview(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentSubmitRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid in-review payload',
        },
      });
    }
    return ok(
      await this.content.markInReview(
        admin.user.id,
        parsed.data.templateVersionId,
      ),
    );
  }

  @Post('approve')
  @RequirePermissions('content:review')
  async approve(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentApproveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid approve payload' },
      });
    }
    return ok(
      await this.content.approve(
        admin.user.id,
        parsed.data.templateVersionId,
        parsed.data.notes,
      ),
    );
  }

  // ── Publish endpoints ────────────────────────────────────────────────────

  @Post('catalog/publish')
  @RequirePermissions('content:publish')
  async publishCatalog(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentPublishCatalogRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid publish payload' },
      });
    }
    return ok(await this.content.publishCatalog(admin.user.id, parsed.data));
  }

  @Post('catalog/promote')
  @RequirePermissions('content:publish')
  async promoteCatalogVersion(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentPromoteVersionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid promote payload' },
      });
    }
    return ok(
      await this.content.promoteVersionIntoCurrentCatalog(
        admin.user.id,
        parsed.data.templateVersionId,
      ),
    );
  }

  @Post('catalog/compose')
  @RequirePermissions('content:publish')
  async composeCatalog(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminCatalogComposeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid compose payload' },
      });
    }
    return ok(
      await this.content.publishCatalogCompose(admin.user.id, parsed.data),
    );
  }

  @Post('pause')
  @RequirePermissions('content:publish')
  async pause(@CurrentAdmin() admin: AdminAuthContext, @Body() body: unknown) {
    const parsed = adminContentPauseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid pause payload' },
      });
    }
    return ok(await this.content.pauseDefinition(admin.user.id, parsed.data));
  }

  @Post('pause/bulk')
  @RequirePermissions('content:publish')
  async pauseBulk(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentBulkPauseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid bulk pause payload',
        },
      });
    }
    return ok(
      await this.content.pauseDefinitionsBulk(admin.user.id, parsed.data),
    );
  }

  @Post('live-eligibility')
  @RequirePermissions('content:publish')
  async liveEligibility(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentLiveEligibilityRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid live eligibility payload',
        },
      });
    }
    return ok(
      await this.content.setLiveEligibility(admin.user.id, parsed.data),
    );
  }

  @Post('catalog/rollback')
  @RequirePermissions('content:publish')
  async rollback(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentRollbackRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid rollback payload',
        },
      });
    }
    return ok(await this.content.rollbackCatalog(admin.user.id, parsed.data));
  }

  @Post('retire')
  @RequirePermissions('content:publish')
  async retire(@CurrentAdmin() admin: AdminAuthContext, @Body() body: unknown) {
    const parsed = adminContentRetireRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid retire payload' },
      });
    }
    return ok(await this.content.retire(admin.user.id, parsed.data));
  }

  @Post('localization/publish')
  @RequirePermissions('content:publish')
  async publishLocalization(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminLocalizationUpsertRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid localization payload',
        },
      });
    }
    const { versionLabel, immediate, ...rest } = parsed.data;
    return ok(
      await this.content.publishKindRelease(admin.user.id, 'localization', {
        versionLabel,
        payload: rest,
        changelog: rest.changelog,
        immediate,
      }),
    );
  }

  @Post('power/publish')
  @RequirePermissions('content:publish')
  async publishPowerConfig(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminPowerConfigUpsertRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid power config payload',
        },
      });
    }
    const { versionLabel, immediate, ...rest } = parsed.data;
    return ok(
      await this.content.publishKindRelease(
        admin.user.id,
        'power_configuration',
        {
          versionLabel,
          payload: rest,
          changelog: rest.changelog,
          immediate,
        },
      ),
    );
  }

  @Post('mode-rules/publish')
  @RequirePermissions('content:publish')
  async publishModeRules(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminGameModeRulesUpsertRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid game mode rules payload',
        },
      });
    }
    const { versionLabel, immediate, ...rest } = parsed.data;
    return ok(
      await this.content.publishKindRelease(admin.user.id, 'game_mode_rules', {
        versionLabel,
        payload: rest,
        changelog: rest.changelog,
        immediate,
      }),
    );
  }

  @Post('daily-goals/publish')
  @RequirePermissions('content:publish')
  async publishDailyGoals(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminDailyGoalsUpsertRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid daily goals payload',
        },
      });
    }
    const { versionLabel, immediate, ...rest } = parsed.data;
    return ok(
      await this.content.publishKindRelease(admin.user.id, 'daily_goals', {
        versionLabel,
        payload: rest,
        changelog: rest.changelog,
        immediate,
      }),
    );
  }

  @Get('matches/:matchId/pins')
  @RequirePermissions('matches:read')
  async matchPins(@Param('matchId') matchId: string) {
    const pins = await this.releases.getMatchPins(matchId);
    if (!pins) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No pins for match' },
      });
    }
    return ok(pins);
  }
}

@Controller('api/admin/v1/emergency')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminEmergencyController {
  constructor(
    private readonly emergency: EmergencyControlsService,
    private readonly matches: MatchService,
    private readonly matchmaking: MatchmakingService,
  ) {}

  @Get('controls')
  @RequirePermissions('system:read')
  async getControls() {
    const data = await this.emergency.getControls();
    return adminSuccessEnvelopeSchema(adminEmergencyControlsSchema).parse(
      ok(data),
    );
  }

  @Patch('controls')
  @RequirePermissions('emergency:write')
  async patchControls(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminEmergencyControlsPatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid emergency controls payload',
          details: parsed.error.flatten(),
        },
      });
    }
    const data = await this.emergency.patchControls(admin.user.id, parsed.data);
    await this.matches.refreshEmergencyControlsFromStore();
    this.matchmaking.setBotFillPolicy({
      enabled: data.botFillEnabled,
      waitMs: data.botFillWaitMs,
    });
    return adminSuccessEnvelopeSchema(adminEmergencyControlsSchema).parse(
      ok(data),
    );
  }
}

@Controller('api/admin/v1/system')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminAppVersionPolicyController {
  constructor(
    private readonly policy: AppVersionPolicyService,
    private readonly matches: MatchService,
    private readonly matchmaking: MatchmakingService,
  ) {}

  @Get('app-version-policy')
  @RequirePermissions('system:read')
  async getPolicy() {
    const data = await this.policy.getPolicy();
    return adminSuccessEnvelopeSchema(adminAppVersionPolicySchema).parse(
      ok(data),
    );
  }

  @Patch('app-version-policy')
  @RequirePermissions('emergency:write')
  async patchPolicy(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminAppVersionPolicyPatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid app version policy payload',
          details: parsed.error.flatten(),
        },
      });
    }
    try {
      const before = await this.policy.getPolicy();
      const data = await this.policy.patchPolicy(admin.user.id, parsed.data);
      // Raising the minimum: cancel waiting tickets/rooms neutrally.
      if (
        compareStableSemVer(
          data.minimumSupportedVersion,
          before.minimumSupportedVersion,
        ) > 0
      ) {
        await this.matchmaking.cancelTicketsBelowVersion(
          data.minimumSupportedVersion,
        );
        await this.matches.closeWaitingRoomsBelowVersion(
          data.minimumSupportedVersion,
        );
      }
      return adminSuccessEnvelopeSchema(adminAppVersionPolicySchema).parse(
        ok(data),
      );
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.code === 'STALE_VERSION_POLICY'
      ) {
        throw new ConflictException({
          ok: false,
          error: {
            code: 'CONFLICT',
            message: 'Version policy was updated by another administrator',
          },
        });
      }
      throw error;
    }
  }
}
