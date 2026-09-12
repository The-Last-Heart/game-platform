import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  challengeDefinitionSchema,
  type ChallengeDefinitionContract,
} from '@thelastheart/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service';
import { AdminAuditService } from '../../admin/services/admin-audit.service';

@Injectable()
export class ContentLifecycleService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

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
    return def;
  }

  async upsertDraft(
    actorAdminId: string,
    input: { templateId?: string; slug?: string; definition: unknown },
  ) {
    const definition = this.validateDefinition(input.definition);
    const hash = createHash('sha256')
      .update(JSON.stringify(definition))
      .digest('hex');

    return this.db.tx(async (client) => {
      let templateId = input.templateId;
      if (!templateId) {
        const slug =
          input.slug ??
          `${definition.definitionId}.${Date.now().toString(36)}`;
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
      const versionId = randomUUID();
      await client.query(
        `INSERT INTO content_template_versions (
           id, template_id, version, status, definition, validation_hash
         ) VALUES ($1::uuid, $2::uuid, $3, 'draft', $4::jsonb, $5)`,
        [versionId, templateId, version, JSON.stringify(definition), hash],
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
    return this.transitionVersion(
      actorAdminId,
      templateVersionId,
      'draft',
      'submitted',
      'content.version.submit',
      { notes },
    );
  }

  async approve(
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
      if (row.rows[0].status !== 'submitted') {
        throw new ConflictException('Only submitted versions can be approved');
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
      return { templateVersionId, status: 'approved' as const };
    });
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
      }
      if (entries.length === 0) {
        throw new BadRequestException('Catalog must include at least one entry');
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
          metadata: { versionLabel: input.versionLabel, entries: entries.length },
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
    await this.db.tx(async (client) => {
      await client.query(
        `INSERT INTO content_catalog_entry_overrides (definition_id, paused, reason, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (definition_id) DO UPDATE
           SET paused = EXCLUDED.paused, reason = EXCLUDED.reason, updated_at = now()`,
        [definitionId, input.paused, input.reason],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: input.paused ? 'content.pause' : 'content.resume',
          entityType: 'content_definition',
          entityId: definitionId,
          outcome: 'success',
          metadata: { reason: input.reason },
        },
        client,
      );
    });
    return { definitionId, paused: input.paused };
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
      const prior = await client.query<{ payload: unknown; changelog: string | null }>(
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
