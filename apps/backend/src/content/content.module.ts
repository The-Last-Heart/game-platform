import { Module, forwardRef } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ContentPackController } from './controllers/content-pack.controller';
import { MobileVersionPolicyController } from './controllers/mobile-version-policy.controller';
import { ContentLifecycleService } from './services/content-lifecycle.service';
import { ContentPackService } from './services/content-pack.service';
import { EmergencyControlsService } from './services/emergency-controls.service';
import { AppVersionPolicyService } from './services/app-version-policy.service';
import { ReleaseResolverService } from './services/release-resolver.service';

@Module({
  imports: [forwardRef(() => AdminModule)],
  controllers: [ContentPackController, MobileVersionPolicyController],
  providers: [
    ReleaseResolverService,
    ContentLifecycleService,
    EmergencyControlsService,
    ContentPackService,
    AppVersionPolicyService,
  ],
  exports: [
    ReleaseResolverService,
    ContentLifecycleService,
    EmergencyControlsService,
    ContentPackService,
    AppVersionPolicyService,
  ],
})
export class ContentModule {}
