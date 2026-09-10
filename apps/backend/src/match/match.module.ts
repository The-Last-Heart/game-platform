import { Module } from '@nestjs/common';
import { MatchGateway } from './gateway/match.gateway';
import { MatchService } from './services/match.service';

@Module({
  providers: [MatchService, MatchGateway],
  exports: [MatchService],
})
export class MatchModule {}
