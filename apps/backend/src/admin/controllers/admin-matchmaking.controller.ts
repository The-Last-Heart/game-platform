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
import { MatchmakingService } from '../../match/services/matchmaking.service';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

@Controller('api/admin/v1/matchmaking')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminMatchmakingController {
  constructor(private readonly matchmaking: MatchmakingService) {}

  @Get('bot-fill-policy')
  @RequirePermissions('matchmaking:read')
  getBotFillPolicy() {
    const data = this.matchmaking.getBotFillPolicy();
    return adminSuccessEnvelopeSchema(adminBotFillPolicyResponseSchema).parse(
      ok(data),
    );
  }

  @Patch('bot-fill-policy')
  @RequirePermissions('matchmaking:write')
  patchBotFillPolicy(@Body() body: unknown) {
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
    this.matchmaking.setBotFillPolicy(parsed.data);
    const data = this.matchmaking.getBotFillPolicy();
    return adminSuccessEnvelopeSchema(adminBotFillPolicyResponseSchema).parse(
      ok(data),
    );
  }
}
