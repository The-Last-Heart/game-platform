import { Injectable } from '@nestjs/common';
import type { AdminEmergencyControls } from '@thelastheart/contracts';
import { DatabaseService } from '../../database/database.service';
import { AdminAuditService } from '../../admin/services/admin-audit.service';

@Injectable()
export class EmergencyControlsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AdminAuditService,
  ) {}

  async getControls(): Promise<AdminEmergencyControls> {
    const result = await this.db.query<{
      matchmaking_paused: boolean;
      matchmaking_pause_reason: string | null;
      matchmaking_paused_at: Date | null;
      bot_fill_enabled: boolean;
      bot_fill_wait_ms: number;
      offensive_powers_disabled: boolean;
      offensive_powers_disable_reason: string | null;
      updated_at: Date;
    }>(`SELECT * FROM emergency_controls WHERE id = 1`);
    const row = result.rows[0];
    if (!row) {
      return {
        matchmakingPaused: false,
        matchmakingPauseReason: null,
        matchmakingPausedAt: null,
        botFillEnabled: false,
        botFillWaitMs: 15_000,
        offensivePowersDisabled: false,
        offensivePowersDisableReason: null,
        updatedAt: new Date().toISOString(),
      };
    }
    return {
      matchmakingPaused: row.matchmaking_paused,
      matchmakingPauseReason: row.matchmaking_pause_reason,
      matchmakingPausedAt: row.matchmaking_paused_at?.toISOString() ?? null,
      botFillEnabled: row.bot_fill_enabled,
      botFillWaitMs: row.bot_fill_wait_ms,
      offensivePowersDisabled: row.offensive_powers_disabled,
      offensivePowersDisableReason: row.offensive_powers_disable_reason,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async isMatchmakingPaused(): Promise<boolean> {
    const controls = await this.getControls();
    return controls.matchmakingPaused;
  }

  async getBotFillPolicy(): Promise<{ enabled: boolean; waitMs: number }> {
    const controls = await this.getControls();
    return {
      enabled: controls.botFillEnabled,
      waitMs: controls.botFillWaitMs,
    };
  }

  async areOffensivePowersDisabled(): Promise<boolean> {
    const controls = await this.getControls();
    return controls.offensivePowersDisabled;
  }

  async patchControls(
    actorAdminId: string,
    patch: {
      matchmakingPaused?: boolean;
      matchmakingPauseReason?: string;
      botFillEnabled?: boolean;
      botFillWaitMs?: number;
      offensivePowersDisabled?: boolean;
      offensivePowersDisableReason?: string;
      reason: string;
    },
  ): Promise<AdminEmergencyControls> {
    await this.db.tx(async (client) => {
      await client.query(
        `UPDATE emergency_controls SET
           matchmaking_paused = COALESCE($1, matchmaking_paused),
           matchmaking_pause_reason = CASE
             WHEN $1 = true THEN COALESCE($2, matchmaking_pause_reason)
             WHEN $1 = false THEN NULL
             ELSE matchmaking_pause_reason
           END,
           matchmaking_paused_at = CASE
             WHEN $1 = true THEN now()
             WHEN $1 = false THEN NULL
             ELSE matchmaking_paused_at
           END,
           bot_fill_enabled = COALESCE($3, bot_fill_enabled),
           bot_fill_wait_ms = COALESCE($4, bot_fill_wait_ms),
           offensive_powers_disabled = COALESCE($5, offensive_powers_disabled),
           offensive_powers_disable_reason = CASE
             WHEN $5 = true THEN COALESCE($6, offensive_powers_disable_reason)
             WHEN $5 = false THEN NULL
             ELSE offensive_powers_disable_reason
           END,
           updated_at = now()
         WHERE id = 1`,
        [
          patch.matchmakingPaused ?? null,
          patch.matchmakingPauseReason ?? patch.reason,
          patch.botFillEnabled ?? null,
          patch.botFillWaitMs ?? null,
          patch.offensivePowersDisabled ?? null,
          patch.offensivePowersDisableReason ?? patch.reason,
        ],
      );
      await this.audit.write(
        {
          actorAdminId,
          action: 'emergency.controls.patch',
          entityType: 'emergency_controls',
          entityId: '1',
          outcome: 'success',
          metadata: { ...patch },
        },
        client,
      );
    });
    return this.getControls();
  }
}
