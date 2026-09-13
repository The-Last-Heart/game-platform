import { randomUUID } from 'node:crypto';
import type {
  DomainEvent,
  MatchMode,
  MatchState,
  PlayerPowerInventory,
  PlayerState,
  PowerConfigurationRuntime,
  PowerId,
} from './types';
import { ENERGY_THRESHOLD } from './types';
export function inventoryTotal(inv: PlayerPowerInventory): number {
  return inv.danger_pulse + inv.shield + inv.reflection;
}

export function cloneInventory(inv: PlayerPowerInventory): PlayerPowerInventory {
  return {
    danger_pulse: inv.danger_pulse,
    shield: inv.shield,
    reflection: inv.reflection,
  };
}

export function defaultPowerConfig(): PowerConfigurationRuntime {
  return {
    releaseId: '44444444-4444-4444-8444-444444444008',
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
        eligibleModes: ['quick_survival', 'private', 'training', 'dev'],
        nameKey: 'power.danger_pulse.name',
        explanationKey: 'power.danger_pulse.explanation',
        assetIds: [],
      },
      {
        powerId: 'shield',
        enabled: true,
        grantWeight: 100,
        eligibleModes: ['quick_survival', 'private', 'training', 'dev'],
        nameKey: 'power.shield.name',
        explanationKey: 'power.shield.explanation',
        assetIds: [],
      },
      {
        powerId: 'reflection',
        enabled: true,
        grantWeight: 100,
        eligibleModes: ['quick_survival', 'private', 'training', 'dev'],
        nameKey: 'power.reflection.name',
        explanationKey: 'power.reflection.explanation',
        assetIds: [],
      },
    ],
  };
}

export type PowerRng = () => number;

export function convertEnergyForPlayer(
  player: PlayerState,
  mode: MatchMode,
  config: PowerConfigurationRuntime,
  rng: PowerRng,
): {
  grant: {
    outcome: 'granted' | 'inventory_full';
    powerId: PowerId | null;
  } | null;
} {
  const threshold = config.energyThreshold ?? ENERGY_THRESHOLD;
  if (player.energy < threshold) {
    return { grant: null };
  }
  player.energy = Math.max(0, player.energy - threshold);

  const eligible = config.powers.filter((p) => {
    if (!p.enabled || p.grantWeight <= 0) return false;
    if (!p.eligibleModes.includes(mode)) return false;
    if (player.inventory[p.powerId] >= config.inventoryMaxPerPower) return false;
    return true;
  });

  if (
    eligible.length === 0 ||
    inventoryTotal(player.inventory) >= config.inventoryMaxTotal
  ) {
    return {
      grant: { outcome: 'inventory_full', powerId: null },
    };
  }

  const totalWeight = eligible.reduce((s, p) => s + p.grantWeight, 0);
  let roll = rng() * totalWeight;
  let chosen = eligible[0]!;
  for (const p of eligible) {
    roll -= p.grantWeight;
    if (roll <= 0) {
      chosen = p;
      break;
    }
  }
  player.inventory[chosen.powerId] = 1;
  return {
    grant: { outcome: 'granted', powerId: chosen.powerId },
  };
}

export function eligibleDangerPulseTargets(
  match: MatchState,
  attackerId: string,
): string[] {
  const attacker = match.players.get(attackerId);
  if (!attacker || attacker.status !== 'active') return [];
  const out: string[] = [];
  for (const p of match.players.values()) {
    if (p.playerId === attackerId) continue;
    if (p.status !== 'active') continue;
    if (
      p.protectedThroughRound != null &&
      p.protectedThroughRound >= match.roundNumber
    ) {
      continue;
    }
    if (attacker.lastDangerPulseTargetId === p.playerId) continue;
    out.push(p.playerId);
  }
  return out.sort();
}

export function playersWithOffensiveCharge(match: MatchState): string[] {
  return [...match.players.values()]
    .filter(
      (p) =>
        p.status === 'active' &&
        p.inventory.danger_pulse > 0 &&
        !p.powerActionResolved,
    )
    .map((p) => p.playerId)
    .sort();
}

export function applyHeartLoss(
  player: PlayerState,
  heartsDelta: number,
): void {
  player.hearts = Math.max(0, player.hearts + heartsDelta);
  if (player.hearts <= 0) {
    player.status = 'spectator';
    player.hearts = 0;
  }
}

export function makeAttackId(): string {
  return randomUUID();
}

export function toPublicInventory(
  inv: PlayerPowerInventory,
): PlayerPowerInventory {
  return cloneInventory(inv);
}

export function grantEventsFromConversion(
  match: MatchState,
  playerId: string,
  grant: {
    outcome: 'granted' | 'inventory_full';
    powerId: PowerId | null;
  },
  sequence: number,
  revision: number,
  serverTimestampMs: number,
): DomainEvent[] {
  const player = match.players.get(playerId);
  if (!player) return [];
  match.lastPowerGrant = {
    playerId,
    powerId: grant.powerId,
    outcome: grant.outcome,
  };
  if (grant.outcome === 'granted' && grant.powerId) {
    return [
      {
        kind: 'power_granted',
        sequence,
        revision,
        serverTimestampMs,
        playerId,
        powerId: grant.powerId,
        energyAfter: player.energy,
      },
    ];
  }
  return [
    {
      kind: 'power_inventory_full',
      sequence,
      revision,
      serverTimestampMs,
      playerId,
      energyAfter: player.energy,
    },
  ];
}
