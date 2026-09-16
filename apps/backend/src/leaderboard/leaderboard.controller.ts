import { Controller, Get, Header, Query } from '@nestjs/common';
import { leaderboardResponseSchema } from '@thelastheart/contracts';
import { LeaderboardService } from './leaderboard.service';

@Controller('v1/leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async getTop(@Query('limit') limitRaw?: string) {
    const parsed = limitRaw !== undefined ? Number(limitRaw) : 100;
    const limit = Number.isFinite(parsed) ? parsed : 100;
    const entries = await this.leaderboard.getTop(limit);
    return leaderboardResponseSchema.parse({ entries });
  }
}
