import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  adminContentApproveRequestSchema,
  adminContentDraftUpsertRequestSchema,
  adminContentPauseRequestSchema,
  adminContentPublishCatalogRequestSchema,
  adminContentRollbackRequestSchema,
  adminContentSubmitRequestSchema,
  adminEmergencyControlsPatchRequestSchema,
  adminEmergencyControlsSchema,
  adminSuccessEnvelopeSchema,
} from '@thelastheart/contracts';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import type { AdminAuthContext } from '../services/admin.types';
import { ContentLifecycleService } from '../../content/services/content-lifecycle.service';
import { EmergencyControlsService } from '../../content/services/emergency-controls.service';
import { ReleaseResolverService } from '../../content/services/release-resolver.service';
import { MatchService } from '../../match/services/match.service';
import { MatchmakingService } from '../../match/services/matchmaking.service';

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

@Controller('api/admin/v1/content')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminContentController {
  constructor(
    private readonly content: ContentLifecycleService,
    private readonly releases: ReleaseResolverService,
  ) {}

  @Get('templates')
  @RequirePermissions('content:read')
  async listTemplates() {
    return ok(await this.content.listTemplates());
  }

  @Get('releases')
  @RequirePermissions('content:read')
  async listReleases() {
    return ok(await this.content.listReleases());
  }

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

  @Post('submit')
  @RequirePermissions('content:draft')
  async submit(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
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

  @Post('pause')
  @RequirePermissions('content:publish')
  async pause(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminContentPauseRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid pause payload' },
      });
    }
    return ok(await this.content.pauseDefinition(admin.user.id, parsed.data));
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
        error: { code: 'VALIDATION_ERROR', message: 'Invalid rollback payload' },
      });
    }
    return ok(await this.content.rollbackCatalog(admin.user.id, parsed.data));
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
