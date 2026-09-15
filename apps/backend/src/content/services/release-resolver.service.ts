import { Injectable } from '@nestjs/common';
import {
  challengeDefinitionSchema,
  ENGINE_RUNTIME_READINESS,
  powerConfigurationReleasePayloadSchema,
  type ChallengeDefinitionContract,
  type LaunchEngineId,
  type MatchReleasePins,
  type PowerConfigurationReleasePayload,
} from '@thelastheart/contracts';
import { DatabaseService } from '../../database/database.service';
import type { ChallengeDefinition } from '../../match/domain/types';
import type { ChallengeDefinitionProvider } from '../../match/challenges/challenge-definition.provider';

/** Bootstrap release ids seeded by 003_versioned_game_content.sql */
export const BOOTSTRAP_PINS: MatchReleasePins = {
  challengeCatalogReleaseId: '11111111-1111-4111-8111-111111111111',
  gameModeRuleReleaseId: '22222222-2222-4222-8222-222222222222',
  localizationReleaseId: '33333333-3333-4333-8333-333333333333',
  powerConfigurationReleaseId: '44444444-4444-4444-8444-444444444444',
};

/** LH-008 published power pack (005 migration); preferred when current. */
export const LH008_POWER_RELEASE_ID =
  '44444444-4444-4444-8444-444444444008';

export const DEFAULT_POWER_CONFIGURATION: PowerConfigurationReleasePayload = {
  releaseId: LH008_POWER_RELEASE_ID,
  versionLabel: 'bootstrap.powers.v1',
  energyThreshold: 4,
  inventoryMaxTotal: 3,
  inventoryMaxPerPower: 1,
  actionWindowMs: 8000,
  defenseWindowMs: 5000,
  powers: [
    {
      powerId: 'danger_pulse',
      enabled: true,
      grantWeight: 100,
      eligibleModes: ['quick_survival', 'private', 'dev'],
      nameKey: 'power.danger_pulse.name',
      explanationKey: 'power.danger_pulse.explanation',
      assetIds: [],
    },
    {
      powerId: 'shield',
      enabled: true,
      grantWeight: 100,
      eligibleModes: ['quick_survival', 'private', 'dev'],
      nameKey: 'power.shield.name',
      explanationKey: 'power.shield.explanation',
      assetIds: [],
    },
    {
      powerId: 'reflection',
      enabled: true,
      grantWeight: 100,
      eligibleModes: ['quick_survival', 'private', 'dev'],
      nameKey: 'power.reflection.name',
      explanationKey: 'power.reflection.explanation',
      assetIds: [],
    },
  ],
};

@Injectable()
export class ReleaseResolverService implements ChallengeDefinitionProvider {
  constructor(private readonly db: DatabaseService) {}

  async resolveCurrentPins(): Promise<MatchReleasePins> {
    const result = await this.db.query<{ kind: string; release_id: string }>(
      `SELECT kind, release_id::text AS release_id
       FROM content_current_releases`,
    );
    const map = new Map(result.rows.map((r) => [r.kind, r.release_id]));
    const pins: MatchReleasePins = {
      challengeCatalogReleaseId:
        map.get('challenge_catalog') ?? BOOTSTRAP_PINS.challengeCatalogReleaseId,
      gameModeRuleReleaseId:
        map.get('game_mode_rules') ?? BOOTSTRAP_PINS.gameModeRuleReleaseId,
      localizationReleaseId:
        map.get('localization') ?? BOOTSTRAP_PINS.localizationReleaseId,
      powerConfigurationReleaseId:
        map.get('power_configuration') ??
        BOOTSTRAP_PINS.powerConfigurationReleaseId,
    };
    return pins;
  }

  async persistMatchPins(
    matchId: string,
    pins: MatchReleasePins,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO match_pins (
         match_id,
         challenge_catalog_release_id,
         game_mode_rule_release_id,
         localization_release_id,
         power_configuration_release_id
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid)
       ON CONFLICT (match_id) DO NOTHING`,
      [
        matchId,
        pins.challengeCatalogReleaseId,
        pins.gameModeRuleReleaseId,
        pins.localizationReleaseId,
        pins.powerConfigurationReleaseId,
      ],
    );
  }

  async getMatchPins(matchId: string): Promise<
    (MatchReleasePins & { matchId: string; createdAt: string }) | null
  > {
    const result = await this.db.query<{
      match_id: string;
      challenge_catalog_release_id: string;
      game_mode_rule_release_id: string;
      localization_release_id: string;
      power_configuration_release_id: string;
      created_at: Date;
    }>(
      `SELECT match_id::text,
              challenge_catalog_release_id::text,
              game_mode_rule_release_id::text,
              localization_release_id::text,
              power_configuration_release_id::text,
              created_at
       FROM match_pins
       WHERE match_id = $1::uuid`,
      [matchId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      matchId: row.match_id,
      challengeCatalogReleaseId: row.challenge_catalog_release_id,
      gameModeRuleReleaseId: row.game_mode_rule_release_id,
      localizationReleaseId: row.localization_release_id,
      powerConfigurationReleaseId: row.power_configuration_release_id,
      createdAt: row.created_at.toISOString(),
    };
  }

  async getPlaylistForCatalogRelease(
    catalogReleaseId: string,
    options?: { mode?: string },
  ): Promise<ChallengeDefinition[]> {
    const release = await this.db.query<{ payload: unknown }>(
      `SELECT payload FROM content_releases
       WHERE id = $1::uuid AND kind = 'challenge_catalog'`,
      [catalogReleaseId],
    );
    const payload = release.rows[0]?.payload as
      | { entries?: Array<{ definitionId: string; templateVersionId: string; paused?: boolean }> }
      | undefined;
    if (!payload?.entries?.length) {
      return [this.getDefaultDev()];
    }

    const overrides = await this.db.query<{ definition_id: string; paused: boolean }>(
      `SELECT definition_id, paused FROM content_catalog_entry_overrides`,
    );
    const paused = new Set(
      overrides.rows.filter((r) => r.paused).map((r) => r.definition_id),
    );

    const defs: ChallengeDefinition[] = [];
    for (const entry of payload.entries) {
      // Skip paused entries (entry-level or override)
      if (entry.paused || paused.has(entry.definitionId)) continue;
      const version = await this.db.query<{ definition: unknown }>(
        `SELECT definition FROM content_template_versions WHERE id = $1::uuid`,
        [entry.templateVersionId],
      );
      const raw = version.rows[0]?.definition;
      if (!raw) continue;
      const parsed = challengeDefinitionSchema.safeParse(raw);
      if (!parsed.success) continue;

      // Reject catalog ↔ version identity mismatches (corrupt seed / bad compose).
      if (parsed.data.definitionId !== entry.definitionId) {
        continue;
      }

      // Skip engines that are schema_only (no runtime evaluator)
      const engineId = parsed.data.engineId as LaunchEngineId;
      if (ENGINE_RUNTIME_READINESS[engineId] === 'schema_only') continue;

      // Filter by eligible modes if a match mode is provided
      if (
        options?.mode &&
        parsed.data.eligibleModes &&
        parsed.data.eligibleModes.length > 0 &&
        !parsed.data.eligibleModes.includes(options.mode as ChallengeDefinitionContract['eligibleModes'][number])
      ) {
        continue;
      }

      defs.push(this.toRuntimeDefinition(parsed.data));
    }
    return defs.length > 0 ? defs : [this.getDefaultDev()];
  }

  getById(id: string): ChallengeDefinition | undefined {
    // Sync interface for legacy provider; runtime uses async playlist.
    void id;
    return undefined;
  }

  getDefaultDev(): ChallengeDefinition {
    return {
      definitionId: 'reaction.wait_for_signal.dev',
      definitionVersion: 1,
      engineId: 'reaction.wait_for_signal',
      durationMs: 5000,
      heartPenaltyOnFailure: 1,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.wait_for_signal.intro',
      difficulty: 'easy',
      choiceKeys: [],
      clientConfig: {
        categoryKey: 'challenge.category.reaction',
        waitingPromptKey: 'challenge.wait_for_signal.waiting',
        waitingHintKey: 'challenge.wait_for_signal.waiting_hint',
        activePromptKey: 'challenge.wait_for_signal.active',
        actionKey: 'challenge.wait_for_signal.action',
      },
      serverConfig: {
        signalDelayMs: 1500,
        signalWindowMs: 750,
      },
    };
  }

  getPlaylist(): readonly ChallengeDefinition[] {
    return [this.getDefaultDev()];
  }

  async getPowerConfigurationForRelease(
    releaseId: string,
  ): Promise<PowerConfigurationReleasePayload> {
    const release = await this.db.query<{ payload: unknown }>(
      `SELECT payload FROM content_releases
       WHERE id = $1::uuid AND kind = 'power_configuration'`,
      [releaseId],
    );
    const raw = release.rows[0]?.payload;
    const parsed = powerConfigurationReleasePayloadSchema.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    return DEFAULT_POWER_CONFIGURATION;
  }

  private toRuntimeDefinition(
    def: ChallengeDefinitionContract,
  ): ChallengeDefinition {
    return {
      definitionId: def.definitionId,
      definitionVersion: def.definitionVersion,
      engineId: def.engineId,
      durationMs: def.durationMs,
      heartPenaltyOnFailure: def.heartPenaltyOnFailure,
      energyRewardOnSuccess: def.energyRewardOnSuccess,
      promptKey: def.promptKey,
      difficulty: def.difficulty,
      choiceKeys: def.choiceKeys,
      clientConfig: def.clientConfig,
      serverConfig: def.serverConfig,
    };
  }

  /**
   * Best-effort insert into challenge_attempt_events for analytics.
   * Privacy-conscious: no display names or player identifiers beyond matchId.
   */
  async writeChallengeAttempt(input: {
    matchId: string;
    definitionId: string;
    definitionVersion: number;
    engineId: string;
    outcome: 'success' | 'failure' | 'timeout';
    heartDelta: number;
    energyDelta: number;
    measureMs?: number;
    mode?: string;
    roundNumber?: number;
  }): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO challenge_attempt_events
           (match_id, definition_id, definition_version, engine_id,
            outcome, heart_delta, energy_delta, measure_ms, mode, round_number)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.matchId,
          input.definitionId,
          input.definitionVersion,
          input.engineId,
          input.outcome,
          input.heartDelta,
          input.energyDelta,
          input.measureMs ?? null,
          input.mode ?? null,
          input.roundNumber ?? null,
        ],
      );
    } catch {
      // Best-effort: don't fail the match on analytics write errors
    }
  }
}
