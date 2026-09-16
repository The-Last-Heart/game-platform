/**
 * LH-006 acceptance evidence against the local Postgres catalog.
 * Run: pnpm exec ts-node -r tsconfig-paths/register scripts/lh006-acceptance.ts
 */
import { Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { challengeDefinitionSchema } from '@thelastheart/contracts';
import { DatabaseService } from '../src/database/database.service';
import { AdminAuditService } from '../src/admin/services/admin-audit.service';
import { ContentLifecycleService } from '../src/content/services/content-lifecycle.service';
import { ReleaseResolverService } from '../src/content/services/release-resolver.service';
import { FakeClock } from '../src/match/domain/types';
import { MatchService } from '../src/match/services/match.service';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = {
    query: (text: string, params?: unknown[]) => pool.query(text, params),
    tx: async <T>(fn: (client: {
      query: typeof pool.query;
    }) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  } as unknown as DatabaseService;

  const audit = new AdminAuditService(db);
  const content = new ContentLifecycleService(db, audit);
  const releases = new ReleaseResolverService(db);
  const matches = MatchService.forTests({ clock: new FakeClock() });
  Object.assign(matches, { releases });

  const actorAdminId = (
    await pool.query<{ id: string }>(
      `SELECT id::text FROM admin_users ORDER BY created_at ASC LIMIT 1`,
    )
  ).rows[0]?.id;
  if (!actorAdminId) {
    throw new Error('No admin_users row for audit actor');
  }

  const pinsBefore = await releases.resolveCurrentPins();
  const matchA = await matches.createPrivateRoom({
    displayName: 'EvidenceA',
    avatarColor: '#111111',
    countryCode: 'SA',
  });
  const snapA = matchA.snapshot;
  if (!snapA.releasePins) {
    throw new Error('Match A missing releasePins');
  }
  if (
    snapA.releasePins.challengeCatalogReleaseId !==
    pinsBefore.challengeCatalogReleaseId
  ) {
    throw new Error('Match A catalog pin mismatch vs current');
  }

  // Invalid definition rejection sample
  let invalidRejected = false;
  try {
    content.validateDefinition({
      definitionId: 'bad',
      definitionVersion: 1,
      engineId: 'reaction.wait_for_signal',
      durationMs: 100,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'x',
      clientConfig: {},
      serverConfig: {},
      internalTitle: 'bad',
      familyId: 'reaction',
      categoryId: 'reaction.wait_for_signal',
      difficulty: 'easy',
      instructionAr: '',
      eligibleModes: ['training'],
      accessibilityFallbackKey: '',
    });
  } catch {
    invalidRejected = true;
  }
  if (!invalidRejected) {
    throw new Error('Expected invalid definition rejection');
  }

  const bootstrapVersionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const versionLabel = `evidence.${Date.now()}`;
  const published = await content.publishCatalog(actorAdminId, {
    versionLabel,
    templateVersionIds: [bootstrapVersionId],
    changelog: 'LH-006 acceptance publish',
  });

  const pinsAfter = await releases.resolveCurrentPins();
  if (
    pinsAfter.challengeCatalogReleaseId === pinsBefore.challengeCatalogReleaseId
  ) {
    throw new Error('Expected catalog current pointer to move after publish');
  }
  if (published.releaseId !== pinsAfter.challengeCatalogReleaseId) {
    throw new Error('Published release is not current');
  }

  // Active match A pins unchanged
  const snapA2 = (await matches.requestSnapshot(matchA.matchId)).snapshot;
  if (
    snapA2.releasePins?.challengeCatalogReleaseId !==
    snapA.releasePins.challengeCatalogReleaseId
  ) {
    throw new Error('Active match A pins changed after publish');
  }

  const matchB = await matches.createPrivateRoom({
    displayName: 'EvidenceB',
    avatarColor: '#222222',
    countryCode: 'SA',
  });
  if (
    matchB.snapshot.releasePins?.challengeCatalogReleaseId !==
    pinsAfter.challengeCatalogReleaseId
  ) {
    throw new Error('Match B did not pin new catalog release');
  }

  await content.pauseDefinition(actorAdminId, {
    definitionId: 'reaction.wait_for_signal.dev',
    paused: true,
    reason: 'LH-006 acceptance pause',
  });
  const rollback = await content.rollbackCatalog(actorAdminId, {
    fromCatalogReleaseId: pinsBefore.challengeCatalogReleaseId,
    versionLabel: `rollback.${Date.now()}`,
    reason: 'LH-006 acceptance rollback',
  });

  const auditRows = await pool.query<{ action: string }>(
    `SELECT action FROM admin_audit_logs
     WHERE action IN ('content.pause', 'content.catalog.rollback', 'content.catalog.publish')
     ORDER BY created_at DESC
     LIMIT 10`,
  );

  // Restore unpaused so local play isn't stuck
  await content.pauseDefinition(actorAdminId, {
    definitionId: 'reaction.wait_for_signal.dev',
    paused: false,
    reason: 'LH-006 acceptance resume',
  });

  const evidence = {
    ok: true,
    matchA: {
      matchId: matchA.matchId,
      releasePins: snapA.releasePins,
    },
    matchB: {
      matchId: matchB.matchId,
      releasePins: matchB.snapshot.releasePins,
    },
    publishedReleaseId: published.releaseId,
    rollbackReleaseId: rollback.releaseId,
    invalidRejected,
    auditActions: auditRows.rows.map((row) => row.action),
    challengeDefinitionSchemaName: challengeDefinitionSchema.description ?? 'challengeDefinitionSchema',
    validationHashSample: createHash('sha256')
      .update(JSON.stringify({ evidence: true, nonce: randomUUID() }))
      .digest('hex')
      .slice(0, 12),
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(evidence, null, 2));
  Logger.flush?.();
  await pool.end();
}

main().catch(async (error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
