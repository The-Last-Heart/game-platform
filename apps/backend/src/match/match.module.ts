import { Module } from '@nestjs/common';
import { MatchGateway } from './gateway/match.gateway';
import { MatchService } from './services/match.service';
import { MatchmakingService } from './services/matchmaking.service';

@Module({
  providers: [MatchService, MatchmakingService, MatchGateway],
  exports: [MatchService, MatchmakingService],
})
export class MatchModule {}
