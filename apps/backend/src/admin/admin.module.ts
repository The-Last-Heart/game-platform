import { Module, forwardRef } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ContentModule } from '../content/content.module';
import { HealthModule } from '../health/health.module';
import { MatchModule } from '../match/match.module';
import { AdminAdministratorsController } from './controllers/admin-administrators.controller';
import { AdminAuditLogsController } from './controllers/admin-audit-logs.controller';
import { AdminAuthController } from './controllers/admin-auth.controller';
import {
  AdminContentController,
  AdminEmergencyController,
  AdminAppVersionPolicyController,
} from './controllers/admin-content.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminMatchmakingController } from './controllers/admin-matchmaking.controller';
import { AdminHttpExceptionFilter } from './filters/admin-http-exception.filter';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AdminLoginThrottleService } from './security/login-throttle.service';
import { AdminRequestSecurityService } from './security/request-security.service';
import { AdminAdministratorsService } from './services/admin-administrators.service';
import { AdminAuditQueryService } from './services/admin-audit-query.service';
import { AdminAuditService } from './services/admin-audit.service';
import { AdminAuthService } from './services/admin-auth.service';
import { AdminDashboardService } from './services/admin-dashboard.service';

@Module({
  imports: [
    forwardRef(() => MatchModule),
    HealthModule,
    forwardRef(() => ContentModule),
  ],
  controllers: [
    AdminAuthController,
    AdminAdministratorsController,
    AdminDashboardController,
    AdminMatchmakingController,
    AdminAuditLogsController,
    AdminContentController,
    AdminEmergencyController,
    AdminAppVersionPolicyController,
  ],
  providers: [
    AdminAuthService,
    AdminAdministratorsService,
    AdminAuditService,
    AdminAuditQueryService,
    AdminDashboardService,
    AdminLoginThrottleService,
    AdminRequestSecurityService,
    AdminAuthGuard,
    PermissionsGuard,
    {
      provide: APP_FILTER,
      useClass: AdminHttpExceptionFilter,
    },
  ],
  exports: [AdminAuditService],
})
export class AdminModule {}
