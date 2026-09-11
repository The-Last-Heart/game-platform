import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  adminAdministratorCreateRequestSchema,
  adminAdministratorCreateResponseSchema,
  adminAdministratorGetResponseSchema,
  adminAdministratorListQuerySchema,
  adminAdministratorListResponseSchema,
  adminAdministratorPatchRequestSchema,
  adminAdministratorPatchResponseSchema,
  adminSuccessEnvelopeSchema,
} from '@thelastheart/contracts';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { AdminAdministratorsService } from '../services/admin-administrators.service';
import type { AdminAuthContext } from '../services/admin.types';

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

@Controller('api/admin/v1/administrators')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminAdministratorsController {
  constructor(private readonly administrators: AdminAdministratorsService) {}

  @Get()
  @RequirePermissions('administrators:read')
  async list(@Query() query: Record<string, unknown>) {
    const parsed = adminAdministratorListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid list query',
          details: parsed.error.flatten(),
        },
      });
    }
    const data = await this.administrators.list(parsed.data);
    return adminSuccessEnvelopeSchema(
      adminAdministratorListResponseSchema,
    ).parse(ok(data));
  }

  @Post()
  @RequirePermissions('administrators:write')
  async create(@Body() body: unknown, @CurrentAdmin() admin: AdminAuthContext) {
    const parsed = adminAdministratorCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid create payload',
          details: parsed.error.flatten(),
        },
      });
    }
    const data = await this.administrators.create(admin, parsed.data);
    return adminSuccessEnvelopeSchema(
      adminAdministratorCreateResponseSchema,
    ).parse(ok(data));
  }

  @Get(':id')
  @RequirePermissions('administrators:read')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.administrators.getById(id);
    return adminSuccessEnvelopeSchema(
      adminAdministratorGetResponseSchema,
    ).parse(ok(data));
  }

  @Patch(':id')
  @RequirePermissions('administrators:write')
  async patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentAdmin() admin: AdminAuthContext,
  ) {
    const parsed = adminAdministratorPatchRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid patch payload',
          details: parsed.error.flatten(),
        },
      });
    }
    const data = await this.administrators.patch(admin, id, parsed.data);
    return adminSuccessEnvelopeSchema(
      adminAdministratorPatchResponseSchema,
    ).parse(ok(data));
  }
}
