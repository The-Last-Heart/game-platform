import { Module, forwardRef } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ContentLifecycleService } from './services/content-lifecycle.service';
import { EmergencyControlsService } from './services/emergency-controls.service';
import { ReleaseResolverService } from './services/release-resolver.service';

@Module({
  imports: [forwardRef(() => AdminModule)],
  providers: [
    ReleaseResolverService,
    ContentLifecycleService,
    EmergencyControlsService,
  ],
  exports: [
    ReleaseResolverService,
    ContentLifecycleService,
    EmergencyControlsService,
  ],
})
export class ContentModule {}
