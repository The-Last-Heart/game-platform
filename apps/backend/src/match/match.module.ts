import { Module, forwardRef } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { MatchGateway } from './gateway/match.gateway';
import { MatchService } from './services/match.service';
import { MatchmakingService } from './services/matchmaking.service';

@Module({
  imports: [forwardRef(() => ContentModule), LeaderboardModule],
  providers: [MatchService, MatchmakingService, MatchGateway],
  exports: [MatchService, MatchmakingService],
})
export class MatchModule {}
