import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  adminDashboardOverviewResponseSchema,
  adminSuccessEnvelopeSchema,
  adminSystemStatusResponseSchema,
} from '@thelastheart/contracts';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { AdminDashboardService } from '../services/admin-dashboard.service';

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

@Controller('api/admin/v1')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('dashboard/overview')
  @RequirePermissions('dashboard:read')
  async overview() {
    const data = await this.dashboard.getOverview();
    return adminSuccessEnvelopeSchema(
      adminDashboardOverviewResponseSchema,
    ).parse(ok(data));
  }

  @Get('system/status')
  @RequirePermissions('system:read')
  async systemStatus() {
    const data = await this.dashboard.getSystemStatus();
    return adminSuccessEnvelopeSchema(adminSystemStatusResponseSchema).parse(
      ok(data),
    );
  }
}
