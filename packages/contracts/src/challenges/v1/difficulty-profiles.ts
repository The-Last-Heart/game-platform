import type { LaunchEngineId } from './engines';
import { RING_LOCK_DIFFICULTY_TUNING } from './engines';
import {
  LASER_ROUTING_DIFFICULTY_TUNING,
  LASER_ROUTING_PROMPT_KEYS,
  LASER_ROUTING_TITLE_KEYS,
} from './laser-routing-logic';

export type ChallengePlayDifficulty = 'easy' | 'medium' | 'hard';

export type DifficultyPlayPatch = {
  durationMs?: number;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
};

const DURATION_MIN_MS = 3000;
const DURATION_MAX_MS = 15_000;

function clampDurationMs(ms: number): number {
  return Math.min(DURATION_MAX_MS, Math.max(DURATION_MIN_MS, Math.round(ms)));
}

function readPositiveMs(raw: unknown, fallback: number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw);
  }
  return fallback;
}

/**
 * Engine-specific play knobs that Flutter / evaluators already read.
 * Changing Studio difficulty writes these so the live challenge feels easier
 * or harder — copy keys and puzzle layouts are left intact.
 */
export function difficultyPlayPatch(
  engineId: string,
  difficulty: ChallengePlayDifficulty,
): DifficultyPlayPatch {
  const id = engineId as LaunchEngineId;
  switch (id) {
    case 'reaction.wait_for_signal':
      return {
        easy: {
          durationMs: 8000,
          clientConfig: {},
          serverConfig: { signalDelayMs: 2500, signalWindowMs: 1500 },
        },
        medium: {
          durationMs: 5000,
          clientConfig: {},
          serverConfig: { signalDelayMs: 1500, signalWindowMs: 1500 },
        },
        hard: {
          durationMs: 4000,
          clientConfig: {},
          serverConfig: { signalDelayMs: 800, signalWindowMs: 500 },
        },
      }[difficulty];
    case 'trap.no_touch':
      return {
        easy: {
          durationMs: 5000,
          clientConfig: { zone: { x: 0.22, y: 0.28, width: 0.56, height: 0.36 } },
          serverConfig: {},
        },
        medium: {
          durationMs: 4000,
          clientConfig: { zone: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
          serverConfig: {},
        },
        hard: {
          durationMs: 3000,
          clientConfig: { zone: { x: 0.06, y: 0.08, width: 0.88, height: 0.78 } },
          serverConfig: {},
        },
      }[difficulty];
    case 'gesture.reverse_swipe':
      return {
        easy: {
          durationMs: 6000,
          clientConfig: { minDistancePx: 60 },
          serverConfig: { minDistancePx: 60, maxDurationMs: 4000 },
        },
        medium: {
          durationMs: 5000,
          clientConfig: { minDistancePx: 100 },
          serverConfig: { minDistancePx: 100, maxDurationMs: 3000 },
        },
        hard: {
          durationMs: 4000,
          clientConfig: { minDistancePx: 160 },
          serverConfig: { minDistancePx: 160, maxDurationMs: 1800 },
        },
      }[difficulty];
    case 'tap.precision':
      return {
        easy: {
          durationMs: 6000,
          clientConfig: { speedMin: 0.1, speedMax: 0.18 },
          serverConfig: {},
        },
        medium: {
          durationMs: 5000,
          clientConfig: { speedMin: 0.18, speedMax: 0.4 },
          serverConfig: {},
        },
        hard: {
          durationMs: 4000,
          clientConfig: { speedMin: 0.32, speedMax: 0.55 },
          serverConfig: {},
        },
      }[difficulty];
    case 'memory.sequence':
      return {
        easy: {
          durationMs: 10000,
          clientConfig: { previewMs: 3000 },
          serverConfig: { previewMs: 3000 },
        },
        medium: {
          durationMs: 8000,
          clientConfig: { previewMs: 2000 },
          serverConfig: { previewMs: 2000 },
        },
        hard: {
          durationMs: 6000,
          clientConfig: { previewMs: 1200 },
          serverConfig: { previewMs: 1200 },
        },
      }[difficulty];
    case 'hold.multitouch':
      return {
        easy: {
          durationMs: 5000,
          clientConfig: { holdMs: 1500, requiredContacts: 2 },
          serverConfig: { holdMs: 1500, requiredContacts: 2 },
        },
        medium: {
          durationMs: 6000,
          clientConfig: { holdMs: 3000, requiredContacts: 2 },
          serverConfig: { holdMs: 3000, requiredContacts: 2 },
        },
        hard: {
          durationMs: 8000,
          clientConfig: { holdMs: 4500, requiredContacts: 2 },
          serverConfig: { holdMs: 4500, requiredContacts: 2 },
        },
      }[difficulty];
    case 'motion.shake':
      return {
        easy: {
          durationMs: 6000,
          clientConfig: {},
          serverConfig: { requiredShakeCount: 3, noiseThreshold: 3 },
        },
        medium: {
          durationMs: 5000,
          clientConfig: {},
          serverConfig: { requiredShakeCount: 5, noiseThreshold: 5 },
        },
        hard: {
          durationMs: 5000,
          clientConfig: {},
          serverConfig: { requiredShakeCount: 8, noiseThreshold: 8 },
        },
      }[difficulty];
    case 'motion.tilt_balance':
      return {
        easy: {
          durationMs: 7000,
          clientConfig: {},
          serverConfig: { holdMs: 1200, varianceTolerance: 0.28 },
        },
        medium: {
          durationMs: 6000,
          clientConfig: {},
          serverConfig: { holdMs: 2000, varianceTolerance: 0.15 },
        },
        hard: {
          durationMs: 5000,
          clientConfig: {},
          serverConfig: { holdMs: 2800, varianceTolerance: 0.1 },
        },
      }[difficulty];
    case 'audio.cue':
      return {
        easy: {
          durationMs: 7000,
          clientConfig: { pulseIntervalMs: 900 },
          serverConfig: { pulseCount: 2 },
        },
        medium: {
          durationMs: 6000,
          clientConfig: { pulseIntervalMs: 700 },
          serverConfig: { pulseCount: 3 },
        },
        hard: {
          durationMs: 5000,
          clientConfig: { pulseIntervalMs: 500 },
          serverConfig: { pulseCount: 5 },
        },
      }[difficulty];
    case 'social.pair_sync':
      return {
        easy: {
          durationMs: 10000,
          clientConfig: {},
          serverConfig: { togetherMs: 6000, syncWindowMs: 2500 },
        },
        medium: {
          durationMs: 10000,
          clientConfig: {},
          serverConfig: { togetherMs: 5000, syncWindowMs: 2000 },
        },
        hard: {
          durationMs: 10000,
          clientConfig: {},
          serverConfig: { togetherMs: 5000, syncWindowMs: 1200 },
        },
      }[difficulty];
    case 'tactical.risk_choice':
      return {
        easy: { durationMs: 6000, clientConfig: {}, serverConfig: {} },
        medium: { durationMs: 5000, clientConfig: {}, serverConfig: {} },
        hard: { durationMs: 4000, clientConfig: {}, serverConfig: {} },
      }[difficulty];
    case 'trivia.multiple_choice':
    case 'audio.multiple_choice':
    case 'trivia.common_word':
    case 'trivia.symbol_cipher_word':
    case 'geography.select_on_map':
    case 'focus.stroop':
      return {
        easy: { durationMs: 10000, clientConfig: {}, serverConfig: {} },
        medium: { durationMs: 8000, clientConfig: {}, serverConfig: {} },
        hard: { durationMs: 5000, clientConfig: {}, serverConfig: {} },
      }[difficulty];
    case 'focus.odd_one_out':
      return {
        easy: { durationMs: 8000, clientConfig: {}, serverConfig: {} },
        medium: { durationMs: 6000, clientConfig: {}, serverConfig: {} },
        hard: { durationMs: 4000, clientConfig: {}, serverConfig: {} },
      }[difficulty];
    case 'focus.vertical_reflection':
      return {
        easy: { durationMs: 12000, clientConfig: {}, serverConfig: {} },
        medium: { durationMs: 10000, clientConfig: {}, serverConfig: {} },
        hard: { durationMs: 7000, clientConfig: {}, serverConfig: {} },
      }[difficulty];
    case 'order.sequence_sort':
    case 'precision.maze_path':
    case 'logic.balance_scale':
    case 'logic.three_doors':
    case 'search.select_occurrences':
      return {
        easy: { durationMs: 10000, clientConfig: {}, serverConfig: {} },
        medium: { durationMs: 8000, clientConfig: {}, serverConfig: {} },
        hard: { durationMs: 6000, clientConfig: {}, serverConfig: {} },
      }[difficulty];
    case 'precision.neon_cable':
      return {
        easy: {
          durationMs: 10000,
          clientConfig: { snapRadiusNorm: 0.12 },
          serverConfig: { snapRadiusNorm: 0.12 },
        },
        medium: {
          durationMs: 8000,
          clientConfig: { snapRadiusNorm: 0.09 },
          serverConfig: { snapRadiusNorm: 0.09 },
        },
        hard: {
          durationMs: 6000,
          clientConfig: { snapRadiusNorm: 0.06 },
          serverConfig: { snapRadiusNorm: 0.06 },
        },
      }[difficulty];
    case 'gesture.fog_wipe':
      return {
        easy: {
          durationMs: 12000,
          clientConfig: { brushDiameterNorm: 0.16, clearanceRatioMin: 0.4 },
          serverConfig: { brushDiameterNorm: 0.16, clearanceRatioMin: 0.4 },
        },
        medium: {
          durationMs: 10000,
          clientConfig: { brushDiameterNorm: 0.12, clearanceRatioMin: 0.55 },
          serverConfig: { brushDiameterNorm: 0.12, clearanceRatioMin: 0.55 },
        },
        hard: {
          durationMs: 8000,
          clientConfig: { brushDiameterNorm: 0.09, clearanceRatioMin: 0.7 },
          serverConfig: { brushDiameterNorm: 0.09, clearanceRatioMin: 0.7 },
        },
      }[difficulty];
    case 'precision.circuit_rotation':
      return {
        easy: { durationMs: 10000, clientConfig: {}, serverConfig: {} },
        medium: { durationMs: 8000, clientConfig: {}, serverConfig: {} },
        hard: { durationMs: 6000, clientConfig: {}, serverConfig: {} },
      }[difficulty];
    case 'precision.cable_untangle':
      return {
        easy: {
          durationMs: 10000,
          clientConfig: { snapRadiusNorm: 0.12 },
          serverConfig: { snapRadiusNorm: 0.12 },
        },
        medium: {
          durationMs: 8000,
          clientConfig: { snapRadiusNorm: 0.08 },
          serverConfig: { snapRadiusNorm: 0.08 },
        },
        hard: {
          durationMs: 6000,
          clientConfig: { snapRadiusNorm: 0.055 },
          serverConfig: { snapRadiusNorm: 0.055 },
        },
      }[difficulty];
    case 'logic.complete_sum':
      return {
        easy: { durationMs: 15000, clientConfig: {}, serverConfig: {} },
        medium: { durationMs: 15000, clientConfig: {}, serverConfig: {} },
        hard: { durationMs: 12000, clientConfig: {}, serverConfig: {} },
      }[difficulty];
    case 'social.pass_the_pulse':
      return {
        easy: {
          durationMs: 15000,
          clientConfig: {},
          serverConfig: {
            startDelayMs: 900,
            segmentDurationMs: 2200,
            hitWindowEarlyMs: 360,
            hitWindowLateMs: 400,
          },
        },
        medium: {
          durationMs: 15000,
          clientConfig: {},
          serverConfig: {
            startDelayMs: 800,
            segmentDurationMs: 1800,
            hitWindowEarlyMs: 280,
            hitWindowLateMs: 320,
          },
        },
        hard: {
          durationMs: 15000,
          clientConfig: {},
          serverConfig: {
            startDelayMs: 600,
            segmentDurationMs: 1400,
            hitWindowEarlyMs: 200,
            hitWindowLateMs: 240,
          },
        },
      }[difficulty];
    case 'precision.ring_lock': {
      const tuning = RING_LOCK_DIFFICULTY_TUNING[difficulty];
      return {
        durationMs: 15000,
        clientConfig: {},
        serverConfig: {
          difficulty,
          minAngularVelocityDegPerSec: tuning.minAngularVelocityDegPerSec,
          maxAngularVelocityDegPerSec: tuning.maxAngularVelocityDegPerSec,
          alignmentToleranceDeg: tuning.alignmentToleranceDeg,
          startDelayMs: tuning.startDelayMs,
        },
      };
    }
    case 'laser.routing': {
      const tuning = LASER_ROUTING_DIFFICULTY_TUNING[difficulty];
      return {
        durationMs: tuning.durationMs,
        clientConfig: {
          startDelayMs: tuning.startDelayMs,
          titleKey: LASER_ROUTING_TITLE_KEYS.classic,
          promptKey: LASER_ROUTING_PROMPT_KEYS.classic,
        },
        serverConfig: {
          difficulty,
          startDelayMs: tuning.startDelayMs,
          minRequiredMoves: tuning.minRequiredMoves,
          maxRequiredMoves: tuning.maxRequiredMoves,
          mirrorCount: tuning.mirrorCount,
          moveBudgetMs: tuning.moveBudgetMs,
          avoidSingleMoveStart: tuning.avoidSingleMoveStart,
        },
      };
    }
    default:
      return { clientConfig: {}, serverConfig: {} };
  }
}

export function applyChallengeDifficulty(input: {
  engineId: string;
  difficulty: ChallengePlayDifficulty;
  durationMs: number;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
}): {
  durationMs: number;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
} {
  const patch = difficultyPlayPatch(input.engineId, input.difficulty);
  let durationMs = clampDurationMs(patch.durationMs ?? input.durationMs);
  let clientConfig: Record<string, unknown> = {
    ...input.clientConfig,
    ...patch.clientConfig,
  };
  let serverConfig: Record<string, unknown> = {
    ...input.serverConfig,
    ...patch.serverConfig,
  };

  if (input.engineId === 'reaction.wait_for_signal') {
    let delay = readPositiveMs(serverConfig['signalDelayMs'], 1500);
    let windowMs = readPositiveMs(serverConfig['signalWindowMs'], 1500);
    if (delay >= durationMs) {
      delay = Math.max(0, durationMs - Math.max(400, windowMs));
    }
    if (delay + windowMs > durationMs) {
      windowMs = Math.max(400, durationMs - delay);
    }
    if (delay + windowMs > durationMs) {
      delay = Math.max(0, durationMs - windowMs);
    }
    serverConfig = {
      ...serverConfig,
      signalDelayMs: delay,
      signalWindowMs: windowMs,
    };
  }

  if (input.engineId === 'memory.sequence') {
    let previewMs = readPositiveMs(
      clientConfig['previewMs'] ?? serverConfig['previewMs'],
      2000,
    );
    if (previewMs + 2000 > durationMs) {
      previewMs = Math.max(500, durationMs - 2000);
    }
    clientConfig = { ...clientConfig, previewMs };
    serverConfig = { ...serverConfig, previewMs };
  }

  if (input.engineId === 'hold.multitouch') {
    let holdMs = readPositiveMs(
      clientConfig['holdMs'] ?? serverConfig['holdMs'],
      3000,
    );
    if (holdMs >= durationMs) {
      holdMs = Math.max(500, durationMs - 500);
    }
    clientConfig = { ...clientConfig, holdMs, requiredContacts: 2 };
    serverConfig = { ...serverConfig, holdMs, requiredContacts: 2 };
  }

  if (input.engineId === 'social.pair_sync') {
    durationMs = pairSyncPlayDurationMs(durationMs, serverConfig);
  }

  if (input.engineId === 'gesture.reverse_swipe') {
    const minDistancePx = readPositiveMs(
      clientConfig['minDistancePx'] ?? serverConfig['minDistancePx'],
      100,
    );
    clientConfig = { ...clientConfig, minDistancePx };
    serverConfig = { ...serverConfig, minDistancePx };
  }

  return { durationMs, clientConfig, serverConfig };
}

/** Fill missing play knobs from difficulty without overriding Studio values.
 * Pair-sync duration is widened when it cannot outlast togetherMs. */
export function fillChallengeDifficultyDefaults(input: {
  engineId: string;
  difficulty: ChallengePlayDifficulty;
  durationMs: number;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
}): {
  durationMs: number;
  clientConfig: Record<string, unknown>;
  serverConfig: Record<string, unknown>;
} {
  const patch = difficultyPlayPatch(input.engineId, input.difficulty);
  const serverConfig: Record<string, unknown> = {
    ...patch.serverConfig,
    ...input.serverConfig,
  };
  return {
    durationMs:
      input.engineId === 'social.pair_sync'
        ? pairSyncPlayDurationMs(input.durationMs, serverConfig)
        : input.durationMs,
    clientConfig: { ...patch.clientConfig, ...input.clientConfig },
    serverConfig,
  };
}

/** Hold-together time needs slack after both seats start pressing. */
function pairSyncPlayDurationMs(
  durationMs: number,
  serverConfig: Record<string, unknown>,
): number {
  const togetherMs = readPositiveMs(serverConfig['togetherMs'], 0);
  if (togetherMs <= 0) {
    return durationMs;
  }
  const minDuration = clampDurationMs(togetherMs + 3000);
  return durationMs < minDuration ? minDuration : durationMs;
}
