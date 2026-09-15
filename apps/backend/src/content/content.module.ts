import { Module, forwardRef } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ContentPackController } from './controllers/content-pack.controller';
import { ContentLifecycleService } from './services/content-lifecycle.service';
import { ContentPackService } from './services/content-pack.service';
import { EmergencyControlsService } from './services/emergency-controls.service';
import { ReleaseResolverService } from './services/release-resolver.service';

@Module({
  imports: [forwardRef(() => AdminModule)],
  controllers: [ContentPackController],
  providers: [
    ReleaseResolverService,
    ContentLifecycleService,
    EmergencyControlsService,
    ContentPackService,
  ],
  exports: [
    ReleaseResolverService,
    ContentLifecycleService,
    EmergencyControlsService,
    ContentPackService,
  ],
})
export class ContentModule {}
