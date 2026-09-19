import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
} from '@nestjs/common';
import {
  mobileVersionPolicyQuerySchema,
  mobileVersionPolicyResponseSchema,
} from '@thelastheart/contracts';
import { AppVersionPolicyService } from '../services/app-version-policy.service';
import { DomainError } from '../../match/domain/types';

/**
 * Bootstrap-safe public endpoint for mandatory-update checks.
 * Does not expose administrative audit metadata.
 */
@Controller('v1/mobile/version-policy')
export class MobileVersionPolicyController {
  constructor(private readonly policy: AppVersionPolicyService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async getPolicy(@Query() query: unknown) {
    const parsed = mobileVersionPolicyQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'CLIENT_VERSION_INVALID',
          message: 'Invalid platform or appVersion',
          details: parsed.error.flatten(),
        },
      });
    }
    try {
      const data = await this.policy.evaluateMobilePolicy(parsed.data);
      return mobileVersionPolicyResponseSchema.parse(data);
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }
      throw error;
    }
  }
}
