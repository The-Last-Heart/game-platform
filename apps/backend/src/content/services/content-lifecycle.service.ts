import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  challengeDefinitionSchema,
  validateEngineConfigs,
  ENGINE_RUNTIME_READINESS,
  type ChallengeDefinitionContract,
  type ContentLifecycleStatus,
  type AdminStudioHomeSummary,
  type AdminContentTemplateListQuery,
  type AdminContentTemplateListResponse,
  type AdminContentTemplateDetail,
  type AdminCatalogProofReport,
  type AdminChallengeAnalyticsQuery,
  type AdminChallengeAnalyticsResponse,
  type AdminContentDiffResponse,
  type AdminContentBulkPauseResponse,
  type LaunchEngineId,
} from '@thelastheart/contracts';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../database/database.service';
import { AdminAuditService } from '../../admin/services/admin-audit.service';
import {
  pinApprovedVersionInCatalog,
  type CatalogPlaylistEntry,
} from './catalog-playlist';

const BULK_PAUSE_STATUSES = new Set<ContentLifecycleStatus>([
  'published',
  'approved',
  'scheduled',
]);
const BULK_RESUME_STATUSES = new Set<ContentLifecycleStatus>(['paused']);

function parseStoredDefinition(raw: unknown): ChallengeDefinitionContract {
  const parsed = challengeDefinitionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Stored challenge definition is invalid',
        details: parsed.error.flatten(),
      },
    });
  }
  return parsed.data;
}

export function isBulkPauseEligible(
  status: ContentLifecycleStatus,
  paused: boolean,
): boolean {
  return paused
    ? BULK_PAUSE_STATUSES.has(status)
    : BULK_RESUME_STATUSES.has(status);
}

/**
 * Same hybrid lifecycle the library table shows. Home MetricCards must use
 * this — not catalog pause overrides — so clicking a card matches the list.
 */
export const TEMPLATE_DISPLAY_STATUS_SQL = `
  CASE
    WHEN t.status IN ('paused', 'retired', 'published') THEN t.status
    ELSE COALESCE(
      (SELECT v.status FROM content_template_versions v
       WHERE v.template_id = t.id ORDER BY v.version DESC LIMIT 1),
      t.status
    )
  END
`;

export function studioHomeCountsFromRows(
  rows: Array<{ status: string; cnt: string | number }>,
): AdminStudioHomeSummary['counts'] {
  const counts: AdminStudioHomeSummary['counts'] = {
    drafts: 0,
    submitted: 0,
    inReview: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    paused: 0,
  };
  for (const row of rows) {
    const n =
      typeof row.cnt === 'number' ? row.cnt : parseInt(String(row.cnt), 10);
    if (!Number.isFinite(n) || n < 0) {
      continue;
    }
    switch (row.status) {
      case 'draft':
        counts.drafts = n;
        break;
      case 'submitted':
        counts.submitted = n;
        break;
      case 'in_review':
        counts.inReview = n;
        break;
      case 'approved':
        counts.approved = n;
        break;
      case 'scheduled':
        counts.scheduled = n;
        break;
      case 'published':
        counts.published = n;
        break;
      case 'paused':
        counts.paused = n;
        break;
      default:
        break;
    }
  }
  return counts;
}

@Injectable()
export class ContentLifecycleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

  /** Production keeps SoD. Local Docker (NODE_ENV=development) allows self-approve. */
  private allowSelfApprove(): boolean {
    if (process.env.CONTENT_ALLOW_SELF_APPROVE === 'true') {
      return true;
    }
    if (process.env.CONTENT_ALLOW_SELF_APPROVE === 'false') {
      return false;
    }
    return process.env.NODE_ENV !== 'production';
  }

  // ── Existing methods ─────────────────────────────────────────────────────

  async listTemplates() {
    const result = await this.db.query<{
      id: string;
      slug: string;
      internal_title: string;
      family_id: string;
      category_id: string;
      status: string;
      latest_version: number | null;
    }>(
      `SELECT t.id::text, t.slug, t.internal_title, t.family_id, t.category_id, t.status,
              (SELECT max(v.version) FROM content_template_versions v WHERE v.template_id = t.id) AS latest_version
       FROM content_templates t
       ORDER BY t.slug`,
    );
    return result.rows.map((row) => ({
      templateId: row.id,
      slug: row.slug,
      internalTitle: row.internal_title,
      familyId: row.family_id,
      categoryId: row.category_id,
      status: row.status,
      latestVersion: row.latest_version,
      publishedReleaseId: null as string | null,
    }));
  }

  async listReleases() {
    const result = await this.db.query<{
      id: string;
      kind: string;
      version_label: string;
      published_at: Date;
      changelog: string | null;
      is_current: boolean;
    }>(
      `SELECT r.id::text, r.kind, r.version_label, r.published_at, r.changelog,
              EXISTS (
                SELECT 1 FROM content_current_releases c
                WHERE c.release_id = r.id
              ) AS is_current
       FROM content_releases r
       ORDER BY r.published_at DESC`,
    );
    return result.rows.map((row) => ({
      releaseId: row.id,
      kind: row.kind,
      versionLabel: row.version_label,
      isCurrent: row.is_current,
      publishedAt: row.published_at.toISOString(),
      changelog: row.changelog,
    }));
  }

  validateDefinition(raw: unknown): ChallengeDefinitionContract {
    const parsed = challengeDefinitionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'CONTENT_VALIDATION_FAILED',
          message: 'Challenge definition failed validation',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
      });
    }
    const def = parsed.data;
    if (!def.instructionAr.trim()) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'CONTENT_VALIDATION_FAILED',
          message: 'Arabic instruction is required',
          details: [
            {
              path: 'instructionAr',
              message: 'Arabic instruction is required',
              code: 'missing_arabic',
            },
          ],
        },
      });
    }
    if (!def.accessibilityFallbackKey) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'CONTENT_VALIDATION_FAILED',
          message: 'Accessibility fallback is required',
          details: [
            {
              path: 'accessibilityFallbackKey',
              message: 'required',
              code: 'missing_fallback',
            },
          ],
        },
      });
    }

    // Cross-validate engine configs
    try {
      validateEngineConfigs(def.engineId, def.clientConfig, def.serverConfig);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Engine config validation failed';
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'CONTENT_VALIDATION_FAILED',
          message: 'Engine config validation failed',
          details: [
            { path: 'engineId', message, code: 'engine_config_invalid' },
          ],
        },
      });
    }

    return def;
  }

  async upsertDraft(
    actorAdminId: string,
    input: { templateId?: string; slug?: string; definition: unknown },
  ) {
    const definition = this.validateDefinition(input.definition);

    return this.db.tx(async (client) => {
      let templateId = input.templateId;
      if (!templateId) {
        const slug =
          input.slug ?? `${definition.definitionId}.${Date.now().toString(36)}`;
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO content_templates (
             slug, family_id, category_id, internal_title, status
           ) VALUES ($1, $2, $3, $4, 'draft')
           RETURNING id::text`,
          [
            slug,
            definition.familyId,
            definition.categoryId,
            definition.internalTitle,
          ],
        );
        templateId = inserted.rows[0]!.id;
      }

      const versionRow = await client.query<{ next: number }>(
        `SELECT COALESCE(max(version), 0) + 1 AS next
         FROM content_template_versions WHERE template_id = $1::uuid`,
        [templateId],
      );
      const version = versionRow.rows[0]!.next;
      const stored: ChallengeDefinitionContract = {
        ...definition,
        definitionVersion: version,
      };
      const hash = createHash('sha256')
        .update(JSON.stringify(stored))
        .digest('hex');
      const versionId = randomUUID();
      await client.query(
        `INSERT INTO content_template_versions (
           id, template_id, version, status, definition, validation_hash
         ) VALUES ($1::uuid, $2::uuid, $3, 'draft', $4::jsonb, $5)`,
        [versionId, templateId, version, JSON.stringify(stored), hash],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.draft.upsert',
          entityType: 'content_template_version',
          entityId: versionId,
          outcome: 'success',
          metadata: { templateId, version },
        },
        client,
      );
      return { templateId, templateVersionId: versionId, version };
    });
  }

  async submit(
    actorAdminId: string,
    templateVersionId: string,
    notes?: string,
  ) {
    return this.db.tx(async (client) => {
      const row = await client.query<{
        status: string;
        template_id: string;
      }>(
        `SELECT status, template_id::text
         FROM content_template_versions WHERE id = $1::uuid FOR UPDATE`,
        [templateVersionId],
      );
      if (!row.rows[0]) {
        throw new NotFoundException('Template version not found');
      }
      if (row.rows[0].status !== 'draft') {
        throw new ConflictException('Only draft versions can be submitted');
      }
      await client.query(
        `UPDATE content_template_versions
         SET status = 'submitted',
             submitted_at = now(),
             submitted_by_admin_id = $2::uuid,
             validation_notes = COALESCE($3, validation_notes)
         WHERE id = $1::uuid`,
        [templateVersionId, actorAdminId, notes ?? null],
      );
      // Library / review queue filter content_templates.status — keep in sync
      // even when revising an already-published pack challenge.
      await client.query(
        `UPDATE content_templates
         SET status = 'submitted', updated_at = now()
         WHERE id = $1::uuid
           AND status <> 'retired'`,
        [row.rows[0].template_id],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.version.submit',
          entityType: 'content_template_version',
          entityId: templateVersionId,
          outcome: 'success',
          metadata: { notes },
        },
        client,
      );
      return { templateVersionId, status: 'submitted' as const };
    });
  }

  async approve(
    actorAdminId: string,
    templateVersionId: string,
    notes?: string,
  ) {
    return this.db.tx(async (client) => {
      const row = await client.query<{
        status: string;
        submitted_by_admin_id: string | null;
        template_id: string;
      }>(
        `SELECT status, submitted_by_admin_id, template_id::text
         FROM content_template_versions WHERE id = $1::uuid FOR UPDATE`,
        [templateVersionId],
      );
      if (!row.rows[0]) {
        throw new NotFoundException('Template version not found');
      }
      if (
        row.rows[0].status !== 'submitted' &&
        row.rows[0].status !== 'in_review'
      ) {
        throw new ConflictException(
          'Only submitted or in_review versions can be approved',
        );
      }

      // Separation of Duties: approver cannot be the submitter (enforced in production).
      // Local / single-operator stacks allow self-approve so Studio is usable.
      if (
        !this.allowSelfApprove() &&
        row.rows[0].submitted_by_admin_id &&
        row.rows[0].submitted_by_admin_id === actorAdminId
      ) {
        throw new ConflictException(
          'Approver must be different from the submitter (Separation of Duties)',
        );
      }

      await client.query(
        `UPDATE content_template_versions
         SET status = 'approved',
             approved_at = now(),
             approved_by_admin_id = $2::uuid,
             validation_notes = COALESCE($3, validation_notes)
         WHERE id = $1::uuid`,
        [templateVersionId, actorAdminId, notes ?? null],
      );
      await client.query(
        `UPDATE content_templates
         SET status = 'approved', updated_at = now()
         WHERE id = $1::uuid
           AND status <> 'retired'`,
        [row.rows[0].template_id],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.version.approve',
          entityType: 'content_template_version',
          entityId: templateVersionId,
          outcome: 'success',
          metadata: { notes },
        },
        client,
      );
      const promoted = await this.applyApprovedVersionToLiveCatalog(
        client,
        actorAdminId,
        templateVersionId,
        { appendIfMissing: false },
      );
      return {
        templateVersionId,
        status: promoted.live ? ('published' as const) : ('approved' as const),
        live: promoted.live,
        catalogReleaseId: promoted.releaseId ?? null,
      };
    });
  }

  /**
   * Pin an approved/published version into the current catalog release.
   * Replaces the live pin when the definition is already catalogued;
   * appends it when the operator explicitly publishes.
   */
  async promoteVersionIntoCurrentCatalog(
    actorAdminId: string,
    templateVersionId: string,
  ) {
    return this.db.tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [606006]);
      const row = await client.query<{ status: string }>(
        `SELECT status FROM content_template_versions WHERE id = $1::uuid FOR UPDATE`,
        [templateVersionId],
      );
      if (!row.rows[0]) {
        throw new NotFoundException('Template version not found');
      }
      if (
        row.rows[0].status !== 'approved' &&
        row.rows[0].status !== 'published'
      ) {
        throw new ConflictException(
          'Only approved or published versions can go live',
        );
      }
      const promoted = await this.applyApprovedVersionToLiveCatalog(
        client,
        actorAdminId,
        templateVersionId,
        { appendIfMissing: true },
      );
      if (!promoted.live) {
        throw new ConflictException(
          'Could not pin this version into the catalog',
        );
      }
      return {
        templateVersionId,
        status: 'published' as const,
        live: true as const,
        catalogReleaseId: promoted.releaseId ?? null,
      };
    });
  }

  private async applyApprovedVersionToLiveCatalog(
    client: PoolClient,
    actorAdminId: string,
    templateVersionId: string,
    options: { appendIfMissing: boolean },
  ): Promise<{ live: boolean; releaseId?: string }> {
    await client.query('SELECT pg_advisory_xact_lock($1)', [606006]);
    const versionRow = await client.query<{
      id: string;
      template_id: string;
      definition: unknown;
    }>(
      `SELECT id::text, template_id::text, definition
       FROM content_template_versions WHERE id = $1::uuid`,
      [templateVersionId],
    );
    const version = versionRow.rows[0];
    if (!version) {
      return { live: false };
    }
    const parsed = challengeDefinitionSchema.safeParse(version.definition);
    if (!parsed.success) {
      return { live: false };
    }
    const engineId = parsed.data.engineId as LaunchEngineId;
    if (ENGINE_RUNTIME_READINESS[engineId] === 'schema_only') {
      return { live: false };
    }

    const current = await client.query<{
      release_id: string;
      payload: unknown;
      version_label: string;
    }>(
      `SELECT r.id::text AS release_id, r.payload, r.version_label
       FROM content_current_releases c
       JOIN content_releases r ON r.id = c.release_id
       WHERE c.kind = 'challenge_catalog'
       LIMIT 1`,
    );
    const currentRow = current.rows[0];
    if (!currentRow && !options.appendIfMissing) {
      return { live: false };
    }

    const payload = (currentRow?.payload ?? {}) as {
      entries?: CatalogPlaylistEntry[];
      changelog?: string;
    };
    const nextEntry: CatalogPlaylistEntry = {
      templateVersionId: version.id,
      definitionId: parsed.data.definitionId,
      weight: parsed.data.selectionWeight ?? 100,
      repetitionCooldownRounds: parsed.data.repetitionCooldownRounds ?? 0,
      paused: false,
    };
    const pinned = pinApprovedVersionInCatalog(
      Array.isArray(payload.entries) ? payload.entries : [],
      nextEntry,
      { appendIfMissing: options.appendIfMissing },
    );
    if (!pinned.changed) {
      if (pinned.replaced) {
        await client.query(
          `UPDATE content_template_versions SET status = 'published' WHERE id = $1::uuid`,
          [templateVersionId],
        );
        await client.query(
          `UPDATE content_templates
           SET status = 'published', updated_at = now()
           WHERE id = $1::uuid AND status <> 'retired'`,
          [version.template_id],
        );
        await this.clearPauseOverride(client, parsed.data.definitionId);
        return { live: true, releaseId: currentRow?.release_id };
      }
      return { live: false };
    }

    const releaseId = randomUUID();
    const versionLabel = `studio.live.${releaseId.replace(/-/g, '').slice(0, 12)}`;
    const nextPayload = {
      releaseId,
      versionLabel,
      entries: pinned.entries,
      changelog: `Pin ${parsed.data.definitionId} ${templateVersionId}`,
    };
    await client.query(
      `INSERT INTO content_releases (id, kind, version_label, payload, changelog, published_by_admin_id)
       VALUES ($1::uuid, 'challenge_catalog', $2, $3::jsonb, $4, $5::uuid)`,
      [
        releaseId,
        versionLabel,
        JSON.stringify(nextPayload),
        nextPayload.changelog,
        actorAdminId,
      ],
    );
    await client.query(
      `INSERT INTO content_current_releases (kind, release_id, updated_at)
       VALUES ('challenge_catalog', $1::uuid, now())
       ON CONFLICT (kind) DO UPDATE
         SET release_id = EXCLUDED.release_id, updated_at = now()`,
      [releaseId],
    );
    await client.query(
      `UPDATE content_template_versions SET status = 'published' WHERE id = $1::uuid`,
      [templateVersionId],
    );
    await client.query(
      `UPDATE content_templates
       SET status = 'published', updated_at = now()
       WHERE id = $1::uuid AND status <> 'retired'`,
      [version.template_id],
    );
    await this.clearPauseOverride(client, parsed.data.definitionId);
    await this.audit.write(
      {
        actorAdminId,
        action: 'content.catalog.promote',
        entityType: 'content_release',
        entityId: releaseId,
        outcome: 'success',
        metadata: {
          templateVersionId,
          definitionId: parsed.data.definitionId,
          replaced: pinned.replaced,
        },
      },
      client,
    );
    return { live: true, releaseId };
  }

  async publishCatalog(
    actorAdminId: string,
    input: {
      versionLabel: string;
      templateVersionIds: string[];
      changelog?: string;
    },
  ) {
    return this.db.tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [606006]);
      const entries = [];
      for (const versionId of input.templateVersionIds) {
        const row = await client.query<{
          id: string;
          status: string;
          definition: ChallengeDefinitionContract;
        }>(
          `SELECT id::text, status, definition
           FROM content_template_versions WHERE id = $1::uuid FOR UPDATE`,
          [versionId],
        );
        const version = row.rows[0];
        if (!version) {
          throw new NotFoundException(`Version ${versionId} not found`);
        }
        if (version.status !== 'approved' && version.status !== 'published') {
          throw new ConflictException(
            'Only approved/published versions can enter a catalog release',
          );
        }
        const def = challengeDefinitionSchema.parse(version.definition);
        entries.push({
          templateVersionId: version.id,
          definitionId: def.definitionId,
          weight: def.selectionWeight ?? 100,
          repetitionCooldownRounds: def.repetitionCooldownRounds ?? 0,
          paused: false,
        });
        await client.query(
          `UPDATE content_template_versions SET status = 'published' WHERE id = $1::uuid`,
          [versionId],
        );
        await client.query(
          `UPDATE content_templates
           SET status = 'published', updated_at = now()
           WHERE id = (
             SELECT template_id FROM content_template_versions WHERE id = $1::uuid
           )`,
          [versionId],
        );
        await this.clearPauseOverride(client, def.definitionId);
      }
      if (entries.length === 0) {
        throw new BadRequestException(
          'Catalog must include at least one entry',
        );
      }
      const releaseId = randomUUID();
      const payload = {
        releaseId,
        versionLabel: input.versionLabel,
        entries,
        changelog: input.changelog,
      };
      await client.query(
        `INSERT INTO content_releases (id, kind, version_label, payload, changelog, published_by_admin_id)
         VALUES ($1::uuid, 'challenge_catalog', $2, $3::jsonb, $4, $5::uuid)`,
        [
          releaseId,
          input.versionLabel,
          JSON.stringify(payload),
          input.changelog ?? null,
          actorAdminId,
        ],
      );
      await client.query(
        `INSERT INTO content_current_releases (kind, release_id, updated_at)
         VALUES ('challenge_catalog', $1::uuid, now())
         ON CONFLICT (kind) DO UPDATE
           SET release_id = EXCLUDED.release_id, updated_at = now()`,
        [releaseId],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.catalog.publish',
          entityType: 'content_release',
          entityId: releaseId,
          outcome: 'success',
          metadata: {
            versionLabel: input.versionLabel,
            entries: entries.length,
          },
        },
        client,
      );
      return { releaseId, versionLabel: input.versionLabel };
    });
  }

  async pauseDefinition(
    actorAdminId: string,
    input: {
      definitionId?: string;
      templateVersionId?: string;
      paused: boolean;
      reason: string;
    },
  ) {
    let definitionId = input.definitionId;
    if (!definitionId && input.templateVersionId) {
      const row = await this.db.query<{ definition: { definitionId: string } }>(
        `SELECT definition FROM content_template_versions WHERE id = $1::uuid`,
        [input.templateVersionId],
      );
      definitionId = row.rows[0]?.definition?.definitionId;
    }
    if (!definitionId) {
      throw new BadRequestException('definitionId required');
    }
    const resolvedId = definitionId;
    await this.db.tx(async (client) => {
      await this.applyPauseOverride(
        client,
        actorAdminId,
        resolvedId,
        input.paused,
        input.reason,
      );
    });
    return { definitionId: resolvedId, paused: input.paused };
  }

  async pauseDefinitionsBulk(
    actorAdminId: string,
    input: { templateIds: string[]; paused: boolean; reason: string },
  ): Promise<AdminContentBulkPauseResponse> {
    const templateIds = [...new Set(input.templateIds)];
    return this.db.tx(async (client) => {
      const updated: AdminContentBulkPauseResponse['updated'] = [];
      const skipped: AdminContentBulkPauseResponse['skipped'] = [];

      for (const templateId of templateIds) {
        const row = await client.query<{
          status: ContentLifecycleStatus;
          definition_id: string | null;
        }>(
          `SELECT t.status,
                  (SELECT v.definition->>'definitionId'
                     FROM content_template_versions v
                    WHERE v.template_id = t.id
                    ORDER BY v.version DESC
                    LIMIT 1) AS definition_id
             FROM content_templates t
            WHERE t.id = $1::uuid`,
          [templateId],
        );
        const tpl = row.rows[0];
        if (!tpl) {
          skipped.push({ templateId, reason: 'not_found' });
          continue;
        }
        if (!tpl.definition_id) {
          skipped.push({ templateId, reason: 'no_definition' });
          continue;
        }
        if (!isBulkPauseEligible(tpl.status, input.paused)) {
          skipped.push({ templateId, reason: 'not_eligible' });
          continue;
        }
        await this.applyPauseOverride(
          client,
          actorAdminId,
          tpl.definition_id,
          input.paused,
          input.reason,
        );
        updated.push({ templateId, definitionId: tpl.definition_id });
      }

      if (updated.length > 0) {
        await this.audit.write(
          {
            actorAdminId,
            action: input.paused ? 'content.pause.bulk' : 'content.resume.bulk',
            entityType: 'content_templates',
            entityId: templateIds[0] ?? null,
            outcome: 'success',
            metadata: {
              paused: input.paused,
              reason: input.reason,
              templateIds,
              updatedCount: updated.length,
              skippedCount: skipped.length,
              skipped,
            },
          },
          client,
        );
      }

      return { paused: input.paused, updated, skipped };
    });
  }

  private async clearPauseOverride(
    client: PoolClient,
    definitionId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE content_catalog_entry_overrides
          SET paused = false, updated_at = now()
        WHERE definition_id = $1 AND paused = true`,
      [definitionId],
    );
  }

  private async applyPauseOverride(
    client: PoolClient,
    actorAdminId: string,
    definitionId: string,
    paused: boolean,
    reason: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO content_catalog_entry_overrides (definition_id, paused, reason, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (definition_id) DO UPDATE
         SET paused = EXCLUDED.paused, reason = EXCLUDED.reason, updated_at = now()`,
      [definitionId, paused, reason],
    );
    // Keep Studio template status in sync with the catalog override so Pause
    // is visible after refresh (library filters + lifecycle timeline).
    if (paused) {
      await client.query(
        `UPDATE content_templates t
         SET status = 'paused', updated_at = now()
         FROM content_template_versions v
         WHERE v.template_id = t.id
           AND v.definition->>'definitionId' = $1
           AND t.status IN ('published', 'approved', 'scheduled', 'paused')`,
        [definitionId],
      );
    } else {
      await client.query(
        `UPDATE content_templates t
         SET status = 'published', updated_at = now()
         FROM content_template_versions v
         WHERE v.template_id = t.id
           AND v.definition->>'definitionId' = $1
           AND t.status = 'paused'`,
        [definitionId],
      );
    }
    await this.audit.write(
      {
        actorAdminId,
        action: paused ? 'content.pause' : 'content.resume',
        entityType: 'content_definition',
        entityId: definitionId,
        outcome: 'success',
        metadata: { reason },
      },
      client,
    );
  }

  async setLiveEligibility(
    actorAdminId: string,
    input: {
      definitionId: string;
      eligibleModes: ChallengeDefinitionContract['eligibleModes'];
      reason: string;
    },
  ) {
    const modes = [...new Set(input.eligibleModes)];
    if (modes.length === 0) {
      throw new BadRequestException(
        'eligibleModes must include at least one mode',
      );
    }
    await this.db.tx(async (client) => {
      await client.query(
        `INSERT INTO content_catalog_entry_overrides
           (definition_id, paused, eligible_modes, reason, updated_at)
         VALUES ($1, false, $2::jsonb, $3, now())
         ON CONFLICT (definition_id) DO UPDATE
           SET eligible_modes = EXCLUDED.eligible_modes,
               reason = EXCLUDED.reason,
               updated_at = now()`,
        [input.definitionId, JSON.stringify(modes), input.reason],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.live_eligibility',
          entityType: 'content_definition',
          entityId: input.definitionId,
          outcome: 'success',
          metadata: { eligibleModes: modes, reason: input.reason },
        },
        client,
      );
    });
    return { definitionId: input.definitionId, eligibleModes: modes };
  }

  async rollbackCatalog(
    actorAdminId: string,
    input: {
      fromCatalogReleaseId: string;
      versionLabel: string;
      reason: string;
    },
  ) {
    return this.db.tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [606006]);
      const prior = await client.query<{
        payload: unknown;
        changelog: string | null;
      }>(
        `SELECT payload, changelog FROM content_releases
         WHERE id = $1::uuid AND kind = 'challenge_catalog'`,
        [input.fromCatalogReleaseId],
      );
      if (!prior.rows[0]) {
        throw new NotFoundException('Prior catalog release not found');
      }
      const releaseId = randomUUID();
      const priorPayload = prior.rows[0].payload as Record<string, unknown>;
      const payload = {
        ...priorPayload,
        releaseId,
        versionLabel: input.versionLabel,
        changelog: `Rollback: ${input.reason}`,
      };
      await client.query(
        `INSERT INTO content_releases (id, kind, version_label, payload, changelog, published_by_admin_id)
         VALUES ($1::uuid, 'challenge_catalog', $2, $3::jsonb, $4, $5::uuid)`,
        [
          releaseId,
          input.versionLabel,
          JSON.stringify(payload),
          `Rollback: ${input.reason}`,
          actorAdminId,
        ],
      );
      await client.query(
        `INSERT INTO content_current_releases (kind, release_id, updated_at)
         VALUES ('challenge_catalog', $1::uuid, now())
         ON CONFLICT (kind) DO UPDATE
           SET release_id = EXCLUDED.release_id, updated_at = now()`,
        [releaseId],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.catalog.rollback',
          entityType: 'content_release',
          entityId: releaseId,
          outcome: 'success',
          metadata: {
            fromCatalogReleaseId: input.fromCatalogReleaseId,
            reason: input.reason,
          },
        },
        client,
      );
      return { releaseId, versionLabel: input.versionLabel };
    });
  }

  // ── LH-010 Studio methods ───────────────────────────────────────────────

  async getStudioHomeSummary(): Promise<AdminStudioHomeSummary> {
    // Hybrid status for home cards — identical to the library table so
    // MetricCard numbers match ?status= filters (no pause-override rewrite).
    const statusCounts = await this.db.query<{ status: string; cnt: string }>(
      `SELECT display_status AS status, count(*)::text AS cnt
       FROM (
         SELECT ${TEMPLATE_DISPLAY_STATUS_SQL} AS display_status
         FROM content_templates t
       ) s
       GROUP BY display_status`,
    );
    const counts = studioHomeCountsFromRows(statusCounts.rows);

    const coverage = await this.db.query<{ covered: string; total: string }>(
      `SELECT
         count(*) FILTER (
           WHERE NULLIF(btrim(lv.definition->>'accessibilityFallbackKey'), '') IS NOT NULL
         )::text AS covered,
         count(*)::text AS total
       FROM content_templates t
       JOIN LATERAL (
         SELECT v.definition
         FROM content_template_versions v
         WHERE v.template_id = t.id
         ORDER BY v.version DESC
         LIMIT 1
       ) lv ON true`,
    );
    const coveredN = parseInt(coverage.rows[0]?.covered ?? '0', 10);
    const totalN = parseInt(coverage.rows[0]?.total ?? '0', 10);
    const coveragePercent =
      totalN > 0 ? Math.round((coveredN / totalN) * 100) : 0;

    const recent = await this.db.query<{
      id: string;
      kind: string;
      version_label: string;
      published_at: Date;
    }>(
      `SELECT id::text, kind, version_label, published_at
       FROM content_releases
       ORDER BY published_at DESC
       LIMIT 10`,
    );

    return {
      counts,
      coveragePercent,
      recentPublishes: recent.rows.map((r) => ({
        releaseId: r.id,
        kind: r.kind as AdminStudioHomeSummary['recentPublishes'][number]['kind'],
        versionLabel: r.version_label,
        publishedAt: r.published_at.toISOString(),
      })),
    };
  }

  async listTemplatesFiltered(
    query: AdminContentTemplateListQuery,
  ): Promise<AdminContentTemplateListResponse> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 0;

    if (query.status) {
      paramIdx++;
      // Workflow filters follow the latest version — matches submit/approve UX.
      if (
        query.status === 'draft' ||
        query.status === 'submitted' ||
        query.status === 'in_review' ||
        query.status === 'approved'
      ) {
        conditions.push(
          `COALESCE(
             (SELECT v.status FROM content_template_versions v
              WHERE v.template_id = t.id ORDER BY v.version DESC LIMIT 1),
             t.status
           ) = $${paramIdx}`,
        );
      } else {
        conditions.push(`t.status = $${paramIdx}`);
      }
      params.push(query.status);
    }
    if (query.familyId) {
      paramIdx++;
      conditions.push(`t.family_id = $${paramIdx}`);
      params.push(query.familyId);
    }
    if (query.search) {
      paramIdx++;
      conditions.push(`t.internal_title ILIKE $${paramIdx}`);
      params.push(`%${query.search}%`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countResult = await this.db.query<{ cnt: string }>(
      `SELECT count(*)::text AS cnt FROM content_templates t ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.cnt ?? '0', 10);

    const offset = (query.page - 1) * query.pageSize;
    paramIdx++;
    const limitParam = paramIdx;
    params.push(query.pageSize);
    paramIdx++;
    const offsetParam = paramIdx;
    params.push(offset);

    const rows = await this.db.query<{
      id: string;
      slug: string;
      internal_title: string;
      family_id: string;
      category_id: string;
      status: string;
      latest_version: number | null;
      engine_id: string | null;
      difficulty: string | null;
      updated_at: Date;
      latest_approved_version_id: string | null;
    }>(
      `SELECT t.id::text, t.slug, t.internal_title, t.family_id, t.category_id,
              ${TEMPLATE_DISPLAY_STATUS_SQL} AS status,
              t.updated_at,
              (SELECT max(v.version) FROM content_template_versions v WHERE v.template_id = t.id) AS latest_version,
              (SELECT v.definition->>'engineId' FROM content_template_versions v WHERE v.template_id = t.id ORDER BY v.version DESC LIMIT 1) AS engine_id,
              (SELECT v.definition->>'difficulty' FROM content_template_versions v WHERE v.template_id = t.id ORDER BY v.version DESC LIMIT 1) AS difficulty,
              (SELECT v.id::text FROM content_template_versions v
                WHERE v.template_id = t.id AND v.status IN ('approved','published')
                ORDER BY v.version DESC LIMIT 1) AS latest_approved_version_id
       FROM content_templates t
       ${where}
       ORDER BY t.updated_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params,
    );

    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      items: rows.rows.map((r) => ({
        templateId: r.id,
        slug: r.slug,
        internalTitle: r.internal_title,
        familyId: r.family_id,
        categoryId: r.category_id,
        status: r.status as ContentLifecycleStatus,
        latestVersion: r.latest_version,
        publishedReleaseId: null,
        engineId: r.engine_id,
        difficulty: r.difficulty as 'easy' | 'medium' | 'hard' | null,
        updatedAt: r.updated_at.toISOString(),
        latestApprovedVersionId: r.latest_approved_version_id,
      })),
    };
  }

  async getTemplateDetail(
    templateId: string,
  ): Promise<AdminContentTemplateDetail> {
    const tmpl = await this.db.query<{
      id: string;
      slug: string;
      internal_title: string;
      family_id: string;
      category_id: string;
      status: string;
    }>(
      `SELECT id::text, slug, internal_title, family_id, category_id, status
       FROM content_templates WHERE id = $1::uuid`,
      [templateId],
    );
    if (!tmpl.rows[0]) {
      throw new NotFoundException('Template not found');
    }
    const t = tmpl.rows[0];

    const versions = await this.db.query<{
      id: string;
      template_id: string;
      version: number;
      status: string;
      definition: unknown;
      validation_notes: string | null;
      created_at: Date;
      approved_at: Date | null;
      approved_by_admin_id: string | null;
    }>(
      `SELECT id::text, template_id::text, version, status, definition,
              validation_notes, created_at, approved_at, approved_by_admin_id::text
       FROM content_template_versions
       WHERE template_id = $1::uuid
       ORDER BY version DESC`,
      [templateId],
    );

    const latestDefinitionId =
      versions.rows[0] != null
        ? parseStoredDefinition(versions.rows[0].definition).definitionId
        : null;

    let catalogPaused = false;
    let pauseReason: string | null = null;
    let liveEligibleModesOverride:
      | ChallengeDefinitionContract['eligibleModes']
      | null = null;
    if (latestDefinitionId) {
      const override = await this.db.query<{
        paused: boolean;
        reason: string | null;
        eligible_modes: unknown;
      }>(
        `SELECT paused, reason, eligible_modes FROM content_catalog_entry_overrides
         WHERE definition_id = $1`,
        [latestDefinitionId],
      );
      catalogPaused = override.rows[0]?.paused === true;
      pauseReason = override.rows[0]?.reason ?? null;
      const rawModes = override.rows[0]?.eligible_modes;
      if (Array.isArray(rawModes)) {
        const parsedModes = rawModes.filter(
          (m): m is ChallengeDefinitionContract['eligibleModes'][number] =>
            m === 'quick_survival' ||
            m === 'private' ||
            m === 'training' ||
            m === 'dev',
        );
        liveEligibleModesOverride = parsedModes;
      }
    }

    // Prefer catalog / template pause over stale version 'published'.
    // Otherwise prefer latest version (revise→submit of published packs).
    const latestVersionStatus = versions.rows[0]?.status as
      | ContentLifecycleStatus
      | undefined;
    const displayStatus: ContentLifecycleStatus =
      catalogPaused || t.status === 'paused'
        ? 'paused'
        : t.status === 'retired'
          ? 'retired'
          : (latestVersionStatus ?? (t.status as ContentLifecycleStatus));

    const versionIds = versions.rows.map((v) => v.id);
    let inLiveCatalog = false;
    let pinnedDefinitionModes:
      | ChallengeDefinitionContract['eligibleModes']
      | null = null;
    if (versionIds.length > 0) {
      const catalog = await this.db.query<{ payload: unknown }>(
        `SELECT r.payload
         FROM content_current_releases c
         JOIN content_releases r ON r.id = c.release_id
         WHERE c.kind = 'challenge_catalog'
         LIMIT 1`,
      );
      const payload = catalog.rows[0]?.payload as
        | {
            entries?: Array<{
              definitionId?: string;
              templateVersionId?: string;
              paused?: boolean;
            }>;
          }
        | undefined;
      const pinned = payload?.entries?.find((entry) =>
        versionIds.includes(entry.templateVersionId ?? ''),
      );
      if (pinned?.templateVersionId) {
        inLiveCatalog = true;
        const pinnedVersion = versions.rows.find(
          (v) => v.id === pinned.templateVersionId,
        );
        if (pinnedVersion) {
          const parsed = challengeDefinitionSchema.safeParse(
            pinnedVersion.definition,
          );
          if (parsed.success) {
            pinnedDefinitionModes = [...parsed.data.eligibleModes];
          }
        }
      }
    }

    const liveEligibleModes =
      liveEligibleModesOverride ?? pinnedDefinitionModes;

    return {
      templateId: t.id,
      slug: t.slug,
      internalTitle: t.internal_title,
      familyId: t.family_id,
      categoryId: t.category_id,
      status: displayStatus,
      catalogPaused,
      pauseReason,
      inLiveCatalog,
      liveEligibleModes,
      liveEligibleModesOverride,
      versions: versions.rows.map((v) => ({
        templateVersionId: v.id,
        templateId: v.template_id,
        version: v.version,
        status: v.status as ContentLifecycleStatus,
        definition: parseStoredDefinition(v.definition),
        validationNotes: v.validation_notes,
        createdAt: v.created_at.toISOString(),
        approvedAt: v.approved_at?.toISOString() ?? null,
        approvedByAdminId: v.approved_by_admin_id,
      })),
    };
  }

  async updateDraft(
    actorAdminId: string,
    templateVersionId: string,
    definition: unknown,
  ) {
    const def = this.validateDefinition(definition);
    const hash = createHash('sha256').update(JSON.stringify(def)).digest('hex');

    return this.db.tx(async (client) => {
      const row = await client.query<{ status: string }>(
        `SELECT status FROM content_template_versions WHERE id = $1::uuid FOR UPDATE`,
        [templateVersionId],
      );
      if (!row.rows[0]) {
        throw new NotFoundException('Template version not found');
      }
      if (row.rows[0].status !== 'draft') {
        throw new ConflictException(
          'Only draft versions can be updated in-place',
        );
      }
      await client.query(
        `UPDATE content_template_versions
         SET definition = $2::jsonb,
             validation_hash = $3
         WHERE id = $1::uuid`,
        [templateVersionId, JSON.stringify(def), hash],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.draft.update',
          entityType: 'content_template_version',
          entityId: templateVersionId,
          outcome: 'success',
          metadata: {},
        },
        client,
      );
      return { templateVersionId, status: 'draft' as const };
    });
  }

  async reject(
    actorAdminId: string,
    templateVersionId: string,
    notes?: string,
  ) {
    return this.db.tx(async (client) => {
      const row = await client.query<{ status: string }>(
        `SELECT status FROM content_template_versions WHERE id = $1::uuid FOR UPDATE`,
        [templateVersionId],
      );
      if (!row.rows[0]) {
        throw new NotFoundException('Template version not found');
      }
      if (
        row.rows[0].status !== 'submitted' &&
        row.rows[0].status !== 'in_review'
      ) {
        throw new ConflictException(
          'Only submitted or in_review versions can be rejected to draft',
        );
      }
      await client.query(
        `UPDATE content_template_versions
         SET status = 'draft',
             validation_notes = COALESCE($2, validation_notes)
         WHERE id = $1::uuid`,
        [templateVersionId, notes ?? null],
      );
      const tmpl = await client.query<{ template_id: string }>(
        `SELECT template_id::text FROM content_template_versions WHERE id = $1::uuid`,
        [templateVersionId],
      );
      if (tmpl.rows[0]) {
        await client.query(
          `UPDATE content_templates
           SET status = 'draft', updated_at = now()
           WHERE id = $1::uuid
             AND status <> 'retired'`,
          [tmpl.rows[0].template_id],
        );
      }
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.version.reject',
          entityType: 'content_template_version',
          entityId: templateVersionId,
          outcome: 'success',
          metadata: { notes },
        },
        client,
      );
      return { templateVersionId, status: 'draft' as const };
    });
  }

  async markInReview(actorAdminId: string, templateVersionId: string) {
    return this.transitionVersion(
      actorAdminId,
      templateVersionId,
      'submitted',
      'in_review',
      'content.version.in_review',
      {},
    );
  }

  async retire(
    actorAdminId: string,
    input: { templateId?: string; templateVersionId?: string },
  ) {
    return this.db.tx(async (client) => {
      if (input.templateVersionId) {
        await client.query(
          `UPDATE content_template_versions SET status = 'retired' WHERE id = $1::uuid`,
          [input.templateVersionId],
        );
      }
      if (input.templateId) {
        await client.query(
          `UPDATE content_templates SET status = 'retired' WHERE id = $1::uuid`,
          [input.templateId],
        );
        await client.query(
          `UPDATE content_template_versions SET status = 'retired'
           WHERE template_id = $1::uuid AND status NOT IN ('retired')`,
          [input.templateId],
        );
      }
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.retire',
          entityType: input.templateId
            ? 'content_template'
            : 'content_template_version',
          entityId: input.templateId ?? input.templateVersionId ?? null,
          outcome: 'success',
          metadata: {},
        },
        client,
      );
      return { status: 'retired' as const };
    });
  }

  async publishCatalogCompose(
    actorAdminId: string,
    input: {
      versionLabel: string;
      changelog?: string;
      immediate: boolean;
      scheduleAt?: string;
      entries: Array<{
        templateVersionId: string;
        definitionId: string;
        weight: number;
        repetitionCooldownRounds: number;
        roundMin?: number;
        roundMax?: number;
        paused?: boolean;
      }>;
    },
  ) {
    // Pin definitionId from the version row — never trust slug/client identity.
    // A mismatch is silently dropped at playlist resolve and the challenge
    // disappears from the app even though Studio shows it as published.
    const entries: Array<(typeof input.entries)[number]> = [];
    for (const entry of input.entries) {
      const versionRow = await this.db.query<{ definition: unknown }>(
        `SELECT definition FROM content_template_versions WHERE id = $1::uuid`,
        [entry.templateVersionId],
      );
      const raw = versionRow.rows[0]?.definition;
      if (!raw) {
        throw new NotFoundException(
          `Version ${entry.templateVersionId} not found`,
        );
      }
      const parsed = challengeDefinitionSchema.safeParse(raw);
      if (!parsed.success) {
        throw new BadRequestException({
          ok: false,
          error: {
            code: 'CONTENT_VALIDATION_FAILED',
            message: 'Challenge definition failed validation',
          },
        });
      }
      const engineId = parsed.data.engineId as LaunchEngineId;
      if (ENGINE_RUNTIME_READINESS[engineId] === 'schema_only') {
        throw new BadRequestException({
          ok: false,
          error: {
            code: 'SCHEMA_ONLY_ENGINE',
            message: `Engine "${engineId}" is schema_only and cannot be included in a live catalog`,
          },
        });
      }
      entries.push({
        ...entry,
        definitionId: parsed.data.definitionId,
      });
    }

    if (!input.immediate && input.scheduleAt) {
      const releaseId = randomUUID();
      const payload = {
        releaseId,
        versionLabel: input.versionLabel,
        entries,
        changelog: input.changelog,
      };
      await this.db.query(
        `INSERT INTO content_scheduled_publishes (id, kind, payload, publish_at, created_by)
         VALUES ($1::uuid, 'challenge_catalog', $2::jsonb, $3::timestamptz, $4::uuid)`,
        [releaseId, JSON.stringify(payload), input.scheduleAt, actorAdminId],
      );
      await this.audit.write({
        actorAdminId,
        action: 'content.catalog.schedule',
        entityType: 'content_scheduled_publish',
        entityId: releaseId,
        outcome: 'success',
        metadata: { scheduleAt: input.scheduleAt },
      });
      return { releaseId, scheduled: true, versionLabel: input.versionLabel };
    }

    return this.db.tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [606006]);
      const releaseId = randomUUID();
      const payload = {
        releaseId,
        versionLabel: input.versionLabel,
        entries,
        changelog: input.changelog,
      };
      await client.query(
        `INSERT INTO content_releases (id, kind, version_label, payload, changelog, published_by_admin_id)
         VALUES ($1::uuid, 'challenge_catalog', $2, $3::jsonb, $4, $5::uuid)`,
        [
          releaseId,
          input.versionLabel,
          JSON.stringify(payload),
          input.changelog ?? null,
          actorAdminId,
        ],
      );
      await client.query(
        `INSERT INTO content_current_releases (kind, release_id, updated_at)
         VALUES ('challenge_catalog', $1::uuid, now())
         ON CONFLICT (kind) DO UPDATE
           SET release_id = EXCLUDED.release_id, updated_at = now()`,
        [releaseId],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: 'content.catalog.compose',
          entityType: 'content_release',
          entityId: releaseId,
          outcome: 'success',
          metadata: {
            versionLabel: input.versionLabel,
            entries: entries.length,
          },
        },
        client,
      );
      return { releaseId, scheduled: false, versionLabel: input.versionLabel };
    });
  }

  async publishKindRelease(
    actorAdminId: string,
    kind:
      | 'localization'
      | 'power_configuration'
      | 'game_mode_rules'
      | 'daily_goals',
    input: {
      versionLabel: string;
      payload: unknown;
      changelog?: string;
      immediate: boolean;
      scheduleAt?: string;
    },
  ) {
    if (!input.immediate && input.scheduleAt) {
      const releaseId = randomUUID();
      await this.db.query(
        `INSERT INTO content_scheduled_publishes (id, kind, payload, publish_at, created_by)
         VALUES ($1::uuid, $2, $3::jsonb, $4::timestamptz, $5::uuid)`,
        [
          releaseId,
          kind,
          JSON.stringify(input.payload),
          input.scheduleAt,
          actorAdminId,
        ],
      );
      return { releaseId, scheduled: true, versionLabel: input.versionLabel };
    }

    return this.db.tx(async (client) => {
      const releaseId = randomUUID();
      const payload =
        typeof input.payload === 'object' && input.payload !== null
          ? {
              ...(input.payload as Record<string, unknown>),
              releaseId,
              versionLabel: input.versionLabel,
            }
          : { releaseId, versionLabel: input.versionLabel };
      await client.query(
        `INSERT INTO content_releases (id, kind, version_label, payload, changelog, published_by_admin_id)
         VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6::uuid)`,
        [
          releaseId,
          kind,
          input.versionLabel,
          JSON.stringify(payload),
          input.changelog ?? null,
          actorAdminId,
        ],
      );
      await client.query(
        `INSERT INTO content_current_releases (kind, release_id, updated_at)
         VALUES ($1, $2::uuid, now())
         ON CONFLICT (kind) DO UPDATE
           SET release_id = EXCLUDED.release_id, updated_at = now()`,
        [kind, releaseId],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: `content.${kind}.publish`,
          entityType: 'content_release',
          entityId: releaseId,
          outcome: 'success',
          metadata: { versionLabel: input.versionLabel },
        },
        client,
      );
      return { releaseId, scheduled: false, versionLabel: input.versionLabel };
    });
  }

  computeCatalogProof(
    entries: Array<{ definitionId: string; engineId?: string }>,
    _localizationKeys?: string[],
  ): AdminCatalogProofReport {
    const missingArKeys: string[] = [];
    const schemaOnlyEngines: string[] = [];

    for (const entry of entries) {
      if (
        entry.engineId &&
        ENGINE_RUNTIME_READINESS[entry.engineId as LaunchEngineId] ===
          'schema_only'
      ) {
        schemaOnlyEngines.push(entry.engineId);
      }
    }
    const eligible = entries.filter(
      (e) =>
        !e.engineId ||
        ENGINE_RUNTIME_READINESS[e.engineId as LaunchEngineId] !==
          'schema_only',
    );
    const emptyPlaylist = eligible.length === 0;
    return {
      missingArKeys,
      schemaOnlyEngines,
      emptyPlaylist,
      valid: schemaOnlyEngines.length === 0 && !emptyPlaylist,
    };
  }

  async getVersionDiff(
    versionIdA: string,
    versionIdB: string,
  ): Promise<AdminContentDiffResponse> {
    const [a, b] = await Promise.all([
      this.db.query<{ version: number; definition: Record<string, unknown> }>(
        `SELECT version, definition FROM content_template_versions WHERE id = $1::uuid`,
        [versionIdA],
      ),
      this.db.query<{ version: number; definition: Record<string, unknown> }>(
        `SELECT version, definition FROM content_template_versions WHERE id = $1::uuid`,
        [versionIdB],
      ),
    ]);
    if (!a.rows[0] || !b.rows[0]) {
      throw new NotFoundException('Version not found');
    }
    const defA = a.rows[0].definition;
    const defB = b.rows[0].definition;
    const changes: Array<{ path: string; before?: unknown; after?: unknown }> =
      [];
    const allKeys = new Set([...Object.keys(defA), ...Object.keys(defB)]);
    for (const key of allKeys) {
      const av = JSON.stringify(defA[key]);
      const bv = JSON.stringify(defB[key]);
      if (av !== bv) {
        changes.push({ path: key, before: defA[key], after: defB[key] });
      }
    }
    return {
      versionA: a.rows[0].version,
      versionB: b.rows[0].version,
      changes,
    };
  }

  async listChallengeAnalytics(
    query: AdminChallengeAnalyticsQuery,
  ): Promise<AdminChallengeAnalyticsResponse> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 0;

    if (query.engineId) {
      paramIdx++;
      conditions.push(`engine_id = $${paramIdx}`);
      params.push(query.engineId);
    }
    if (query.definitionId) {
      paramIdx++;
      conditions.push(`definition_id = $${paramIdx}`);
      params.push(query.definitionId);
    }
    if (query.fromDate) {
      paramIdx++;
      conditions.push(`created_at >= $${paramIdx}::timestamptz`);
      params.push(query.fromDate);
    }
    if (query.toDate) {
      paramIdx++;
      conditions.push(`created_at <= $${paramIdx}::timestamptz`);
      params.push(query.toDate);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db.query<{ cnt: string }>(
      `SELECT count(DISTINCT (definition_id, engine_id))::text AS cnt
       FROM challenge_attempt_events ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.cnt ?? '0', 10);

    const offset = (query.page - 1) * query.pageSize;
    paramIdx++;
    const limitP = paramIdx;
    params.push(query.pageSize);
    paramIdx++;
    const offsetP = paramIdx;
    params.push(offset);

    const rows = await this.db.query<{
      definition_id: string;
      engine_id: string;
      total_attempts: string;
      success_count: string;
      failure_count: string;
      timeout_count: string;
      avg_measure_ms: number | null;
    }>(
      `SELECT definition_id, engine_id,
              count(*)::text AS total_attempts,
              count(*) FILTER (WHERE outcome = 'success')::text AS success_count,
              count(*) FILTER (WHERE outcome = 'failure')::text AS failure_count,
              count(*) FILTER (WHERE outcome = 'timeout')::text AS timeout_count,
              avg(measure_ms) AS avg_measure_ms
       FROM challenge_attempt_events
       ${where}
       GROUP BY definition_id, engine_id
       ORDER BY count(*) DESC
       LIMIT $${limitP} OFFSET $${offsetP}`,
      params,
    );

    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      items: rows.rows.map((r) => ({
        definitionId: r.definition_id,
        engineId: r.engine_id,
        totalAttempts: parseInt(r.total_attempts, 10),
        successCount: parseInt(r.success_count, 10),
        failureCount: parseInt(r.failure_count, 10),
        timeoutCount: parseInt(r.timeout_count, 10),
        avgMeasureMs: r.avg_measure_ms,
      })),
    };
  }

  private async transitionVersion(
    actorAdminId: string,
    templateVersionId: string,
    from: string,
    to: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    return this.db.tx(async (client) => {
      const row = await client.query<{ status: string }>(
        `SELECT status FROM content_template_versions WHERE id = $1::uuid FOR UPDATE`,
        [templateVersionId],
      );
      if (!row.rows[0]) {
        throw new NotFoundException('Template version not found');
      }
      if (row.rows[0].status !== from) {
        throw new ConflictException(`Expected status ${from}`);
      }
      await client.query(
        `UPDATE content_template_versions
         SET status = $2,
             submitted_at = CASE WHEN $2 = 'submitted' THEN now() ELSE submitted_at END
         WHERE id = $1::uuid`,
        [templateVersionId, to],
      );
      await this.audit.write(
        {
          actorAdminId,
          action,
          entityType: 'content_template_version',
          entityId: templateVersionId,
          outcome: 'success',
          metadata,
        },
        client,
      );
      return { templateVersionId, status: to };
    });
  }
}
