import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  adminAuditLogListResponseSchema,
  adminAuditLogQuerySchema,
  adminSuccessEnvelopeSchema,
} from '@thelastheart/contracts';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { AdminAuditQueryService } from '../services/admin-audit-query.service';

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

@Controller('api/admin/v1/audit-logs')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminAuditLogsController {
  constructor(private readonly auditQuery: AdminAuditQueryService) {}

  @Get()
  @RequirePermissions('audit:read')
  async list(@Query() query: Record<string, unknown>) {
    const parsed = adminAuditLogQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid audit query',
          details: parsed.error.flatten(),
        },
      });
    }
    const data = await this.auditQuery.list(parsed.data);
    return adminSuccessEnvelopeSchema(adminAuditLogListResponseSchema).parse(
      ok(data),
    );
  }
}
