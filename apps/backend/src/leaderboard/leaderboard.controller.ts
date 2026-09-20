import {
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  leaderboardResponseSchema,
  playerClaimPayloadSchema,
  playerClaimResponseSchema,
} from '@thelastheart/contracts';
import type { ZodIssue } from 'zod';
import { LeaderboardService } from './leaderboard.service';

function claimValidationFailure(issues: ZodIssue[]): {
  code: 'DISPLAY_NAME_PROHIBITED' | 'DISPLAY_NAME_INVALID' | 'INVALID_PAYLOAD';
  key: string;
  message: { code: string; key: string };
} {
  let code: 'DISPLAY_NAME_PROHIBITED' | 'DISPLAY_NAME_INVALID' | 'INVALID_PAYLOAD' =
    'INVALID_PAYLOAD';
  let key = 'errors.protocol.invalid_payload';
  const messages = issues.map((issue) => issue.message);
  if (messages.some((m) => m.includes('prohibited content'))) {
    code = 'DISPLAY_NAME_PROHIBITED';
    key = 'errors.identity.name_prohibited';
  } else if (issues.some((issue) => issue.path.includes('displayName'))) {
    code = 'DISPLAY_NAME_INVALID';
    key = 'errors.identity.name_invalid';
  }
  // Nested `message` keeps older mobile clients that only read message.key working.
  return { code, key, message: { code, key } };
}
@Controller('v1')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get('leaderboard')
  @Header('Cache-Control', 'no-store')
  async getTop(@Query('limit') limitRaw?: string) {
    const parsed = limitRaw !== undefined ? Number(limitRaw) : 100;
    const limit = Number.isFinite(parsed) ? parsed : 100;
    const entries = await this.leaderboard.getTop(limit);
    return leaderboardResponseSchema.parse({ entries });
  }

  /**
   * Claim install profile display name (global unique on players table).
   * Used by mobile identity create/edit before local save.
   */
  @Post('players/claim')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async claimProfile(@Body() body: unknown) {
    const parsed = playerClaimPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        claimValidationFailure(parsed.error.issues),
      );
    }
    const result = await this.leaderboard.claimProfile({
      playerId: parsed.data.playerId,
      displayName: parsed.data.displayName,
      avatarColor: parsed.data.avatarColor,
      countryCode: parsed.data.countryCode,
    });
    if (!result.ok) {
      if (result.reason === 'DISPLAY_NAME_TAKEN') {
        throw new ConflictException({
          code: 'DISPLAY_NAME_TAKEN',
          key: 'errors.identity.name_taken',
          message: {
            code: 'DISPLAY_NAME_TAKEN',
            key: 'errors.identity.name_taken',
          },
        });
      }
      throw new UnprocessableEntityException({
        code: 'INVALID_PAYLOAD',
        key: 'errors.protocol.invalid_payload',
        message: {
          code: 'INVALID_PAYLOAD',
          key: 'errors.protocol.invalid_payload',
        },
      });
    }
    return playerClaimResponseSchema.parse({ ok: true });
  }
}
