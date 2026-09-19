import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FIRST_GAMEPLAY_APP_VERSION,
  compareStableSemVer,
  isStableSemVerGte,
  normalizeStableSemVer,
  type AdminAppVersionPolicy,
  type ClientPlatform,
  type ClientRuntimeMetadata,
  type MobileVersionPolicyResponse,
} from '@thelastheart/contracts';
import type { AppConfig } from '../../config/env.validation';
import { DatabaseService } from '../../database/database.service';
import { AdminAuditService } from '../../admin/services/admin-audit.service';
import { DomainError } from '../../match/domain/types';

export type SessionRuntimeVersion = ClientRuntimeMetadata & {
  registeredAtMs: number;
};

export type VersionAdmissionResult =
  | { ok: true; appVersion: string; metadata: ClientRuntimeMetadata }
  | {
      ok: false;
      error: DomainError;
    };

type PolicyRow = {
  minimum_supported_version: string;
  android_store_url: string;
  ios_store_url: string;
  policy_revision: number;
  updated_at: Date;
  updated_by_admin_id: string | null;
  display_name: string | null;
};

/**
 * Durable mobile version policy + session admission helpers.
 * Matchmaking uses session-level version; player last-seen is telemetry only.
 */
@Injectable()
export class AppVersionPolicyService {
  private readonly logger = new Logger(AppVersionPolicyService.name);
  /** Best-effort live session counters by normalized app version. */
  private readonly sessionsByVersion = new Map<string, number>();
  private readonly strictEnforcement: boolean;

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AdminAuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    try {
      this.strictEnforcement = config.get('APP_VERSION_STRICT_ENFORCEMENT', {
        infer: true,
      });
    } catch {
      this.strictEnforcement = false;
    }
  }

  isStrictEnforcementEnabled(): boolean {
    return this.strictEnforcement;
  }

  registerSessionVersion(appVersion: string | null | undefined): void {
    if (!appVersion) return;
    const normalized = normalizeStableSemVer(appVersion);
    if (!normalized) return;
    this.sessionsByVersion.set(
      normalized,
      (this.sessionsByVersion.get(normalized) ?? 0) + 1,
    );
  }

  unregisterSessionVersion(appVersion: string | null | undefined): void {
    if (!appVersion) return;
    const normalized = normalizeStableSemVer(appVersion);
    if (!normalized) return;
    const current = this.sessionsByVersion.get(normalized) ?? 0;
    if (current <= 1) {
      this.sessionsByVersion.delete(normalized);
      return;
    }
    this.sessionsByVersion.set(normalized, current - 1);
  }

  countSessionsBelow(minimumSupportedVersion: string): number {
    let total = 0;
    for (const [version, count] of this.sessionsByVersion) {
      try {
        if (compareStableSemVer(version, minimumSupportedVersion) < 0) {
          total += count;
        }
      } catch {
        // ignore malformed counters
      }
    }
    return total;
  }

  async getPolicy(): Promise<AdminAppVersionPolicy> {
    const row = await this.loadPolicyRow();
    return {
      policyId: 'mobile_app_version',
      minimumSupportedVersion: row.minimum_supported_version,
      androidStoreUrl: row.android_store_url,
      iosStoreUrl: row.ios_store_url,
      policyRevision: row.policy_revision,
      updatedAt: row.updated_at.toISOString(),
      updatedByAdminId: row.updated_by_admin_id,
      updatedByDisplayName: row.display_name,
      sessionsBelowMinimum: this.countSessionsBelow(
        row.minimum_supported_version,
      ),
    };
  }

  async evaluateMobilePolicy(input: {
    platform: ClientPlatform;
    appVersion: string;
  }): Promise<MobileVersionPolicyResponse> {
    const normalized = normalizeStableSemVer(input.appVersion);
    if (!normalized) {
      throw new DomainError(
        'CLIENT_VERSION_INVALID',
        'client app version is invalid',
      );
    }
    const policy = await this.getPolicy();
    const storeUrl =
      input.platform === 'ios' ? policy.iosStoreUrl : policy.androidStoreUrl;
    const updateRequired = !isStableSemVerGte(
      normalized,
      policy.minimumSupportedVersion,
    );
    return {
      minimumSupportedVersion: policy.minimumSupportedVersion,
      updateRequired,
      storeUrl,
      policyRevision: policy.policyRevision,
    };
  }

  async patchPolicy(
    actorAdminId: string,
    patch: {
      minimumSupportedVersion: string;
      androidStoreUrl: string;
      iosStoreUrl: string;
      policyRevision: number;
      reason: string;
    },
  ): Promise<AdminAppVersionPolicy> {
    const min = normalizeStableSemVer(patch.minimumSupportedVersion);
    if (!min) {
      throw new DomainError(
        'CLIENT_VERSION_INVALID',
        'minimumSupportedVersion is invalid',
      );
    }
    await this.db.tx(async (client) => {
      const current = await client.query<{
        policy_revision: number;
        minimum_supported_version: string;
        android_store_url: string;
        ios_store_url: string;
      }>(
        `SELECT policy_revision, minimum_supported_version, android_store_url, ios_store_url
           FROM app_version_policy WHERE id = 'mobile_app_version' FOR UPDATE`,
      );
      const row = current.rows[0];
      if (!row) {
        throw new DomainError('MATCH_NOT_FOUND', 'version policy missing');
      }
      if (row.policy_revision !== patch.policyRevision) {
        throw new DomainError(
          'STALE_VERSION_POLICY',
          'version policy revision is stale',
        );
      }
      const updated = await client.query(
        `UPDATE app_version_policy SET
           minimum_supported_version = $1,
           android_store_url = $2,
           ios_store_url = $3,
           policy_revision = policy_revision + 1,
           updated_at = now(),
           updated_by_admin_id = $4::uuid,
           last_reason = $5
         WHERE id = 'mobile_app_version'`,
        [
          min,
          patch.androidStoreUrl,
          patch.iosStoreUrl,
          actorAdminId,
          patch.reason,
        ],
      );
      void updated;
      await this.audit.write(
        {
          actorAdminId,
          action: 'app_version_policy.patch',
          entityType: 'app_version_policy',
          entityId: 'mobile_app_version',
          outcome: 'success',
          metadata: {
            reason: patch.reason,
            before: {
              minimumSupportedVersion: row.minimum_supported_version,
              androidStoreUrl: row.android_store_url,
              iosStoreUrl: row.ios_store_url,
              policyRevision: row.policy_revision,
            },
            after: {
              minimumSupportedVersion: min,
              androidStoreUrl: patch.androidStoreUrl,
              iosStoreUrl: patch.iosStoreUrl,
              policyRevision: row.policy_revision + 1,
            },
          },
        },
        client,
      );
    });
    this.logger.log({
      event: 'app_version_policy_updated',
      minimumSupportedVersion: min,
      policyRevision: patch.policyRevision + 1,
    });
    return this.getPolicy();
  }

  /**
   * Validate optional/required runtime metadata and mandatory-update policy.
   * Does not mutate matchmaking or seats.
   */
  async admitRuntimeMetadata(input: {
    appVersion?: string;
    buildNumber?: string;
    platform?: ClientPlatform;
    /** When true, missing metadata is always rejected (post-migration). */
    requireMetadata?: boolean;
  }): Promise<VersionAdmissionResult> {
    const requireMetadata = input.requireMetadata ?? this.strictEnforcement;
    const hasAny =
      input.appVersion != null ||
      input.buildNumber != null ||
      input.platform != null;
    if (!hasAny) {
      if (requireMetadata) {
        return {
          ok: false,
          error: new DomainError(
            'CLIENT_VERSION_MISSING',
            'client runtime version metadata is required',
          ),
        };
      }
      // Stage 1 migration: treat missing as the first gameplay release cohort.
      const metadata: ClientRuntimeMetadata = {
        appVersion: FIRST_GAMEPLAY_APP_VERSION,
        buildNumber: '0',
        platform: 'android',
      };
      return this.applyMandatoryUpdate(metadata);
    }
    if (
      input.appVersion == null ||
      input.buildNumber == null ||
      input.platform == null
    ) {
      return {
        ok: false,
        error: new DomainError(
          'CLIENT_VERSION_INVALID',
          'appVersion, buildNumber, and platform must be provided together',
        ),
      };
    }
    const normalized = normalizeStableSemVer(input.appVersion);
    if (!normalized) {
      return {
        ok: false,
        error: new DomainError(
          'CLIENT_VERSION_INVALID',
          'client app version is invalid',
        ),
      };
    }
    if (
      typeof input.buildNumber !== 'string' ||
      input.buildNumber.length === 0 ||
      input.buildNumber.length > 32
    ) {
      return {
        ok: false,
        error: new DomainError(
          'CLIENT_VERSION_INVALID',
          'client build number is invalid',
        ),
      };
    }
    const metadata: ClientRuntimeMetadata = {
      appVersion: normalized,
      buildNumber: input.buildNumber,
      platform: input.platform,
    };
    return this.applyMandatoryUpdate(metadata);
  }

  private async applyMandatoryUpdate(
    metadata: ClientRuntimeMetadata,
  ): Promise<VersionAdmissionResult> {
    const policy = await this.getPolicy();
    if (
      !isStableSemVerGte(metadata.appVersion, policy.minimumSupportedVersion)
    ) {
      const error = new DomainError(
        'APP_UPDATE_REQUIRED',
        'application update required for online play',
      );
      error.details = {
        minimumSupportedVersion: policy.minimumSupportedVersion,
        storeUrl:
          metadata.platform === 'ios'
            ? policy.iosStoreUrl
            : policy.androidStoreUrl,
        clientVersion: metadata.appVersion,
      };
      this.logger.log({
        event: 'app_update_required',
        clientVersion: metadata.appVersion,
        platform: metadata.platform,
        minimumSupportedVersion: policy.minimumSupportedVersion,
        policyRevision: policy.policyRevision,
      });
      return { ok: false, error };
    }
    return { ok: true, appVersion: metadata.appVersion, metadata };
  }

  async recordPlayerLastSeen(
    playerId: string,
    metadata: ClientRuntimeMetadata,
  ): Promise<void> {
    try {
      await this.db.query(
        `UPDATE players SET
           last_seen_app_version = $2,
           last_seen_build_number = $3,
           last_seen_platform = $4,
           last_seen_app_at = now(),
           updated_at = updated_at
         WHERE player_id = $1`,
        [
          playerId,
          metadata.appVersion,
          metadata.buildNumber,
          metadata.platform,
        ],
      );
    } catch (error) {
      this.logger.warn({
        event: 'player_last_seen_version_update_failed',
        category: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  private async loadPolicyRow(): Promise<PolicyRow> {
    const result = await this.db.query<PolicyRow>(
      `SELECT p.minimum_supported_version,
              p.android_store_url,
              p.ios_store_url,
              p.policy_revision,
              p.updated_at,
              p.updated_by_admin_id::text AS updated_by_admin_id,
              a.display_name
         FROM app_version_policy p
         LEFT JOIN admin_users a ON a.id = p.updated_by_admin_id
        WHERE p.id = 'mobile_app_version'`,
    );
    const row = result.rows[0];
    if (row) {
      return row;
    }
    // Fail soft to the safe bootstrap floor if migration has not run yet.
    return {
      minimum_supported_version: FIRST_GAMEPLAY_APP_VERSION,
      android_store_url:
        'https://play.google.com/store/apps/details?id=com.thelastheart.game',
      ios_store_url: 'https://apps.apple.com/app/id0000000000',
      policy_revision: 0,
      updated_at: new Date(),
      updated_by_admin_id: null,
      display_name: null,
    };
  }
}
