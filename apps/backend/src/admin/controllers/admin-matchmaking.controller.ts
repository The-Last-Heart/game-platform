import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  adminBotFillPolicyPatchRequestSchema,
  adminBotFillPolicyResponseSchema,
  adminSuccessEnvelopeSchema,
} from '@thelastheart/contracts';
import { EmergencyControlsService } from '../../content/services/emergency-controls.service';
import { MatchService } from '../../match/services/match.service';
import { MatchmakingService } from '../../match/services/matchmaking.service';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import type { AdminAuthContext } from '../services/admin.types';

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

@Controller('api/admin/v1/matchmaking')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminMatchmakingController {
  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly emergency: EmergencyControlsService,
    private readonly matches: MatchService,
  ) {}

  @Get('bot-fill-policy')
  @RequirePermissions('matchmaking:read')
  async getBotFillPolicy() {
    const durable = await this.emergency.getBotFillPolicy();
    this.matchmaking.setBotFillPolicy(durable);
    this.matches.setBotFillPolicy(durable);
    return adminSuccessEnvelopeSchema(adminBotFillPolicyResponseSchema).parse(
      ok(durable),
    );
  }

  @Patch('bot-fill-policy')
  @RequirePermissions('matchmaking:write')
  async patchBotFillPolicy(
    @CurrentAdmin() admin: AdminAuthContext,
    @Body() body: unknown,
  ) {
    const parsed = adminBotFillPolicyPatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid bot-fill policy payload',
          details: parsed.error.flatten(),
        },
      });
    }
    await this.emergency.patchControls(admin.user.id, {
      botFillEnabled: parsed.data.enabled,
      botFillWaitMs: parsed.data.waitMs,
      reason: parsed.data.reason ?? 'bot-fill policy update',
    });
    await this.matches.refreshEmergencyControlsFromStore();
    const data = this.matches.getBotFillPolicy();
    this.matchmaking.setBotFillPolicy(data);
    return adminSuccessEnvelopeSchema(adminBotFillPolicyResponseSchema).parse(
      ok(data),
    );
  }
}
