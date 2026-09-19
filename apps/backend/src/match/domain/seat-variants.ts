import { randomBytes, randomInt } from 'node:crypto';

import {
  assignAudioMultipleChoiceSeatVariants,
  readGeographyQuestionBank,
} from './engines/pack-31-evaluators';
import type { ChallengeDefinition, ChallengeRound } from './types';

export type TiltTargetShape = 'circle' | 'square' | 'diamond' | 'heart';

export type SeatChallengeVariant = {
  /** Merged into the viewer's public clientConfig (never broadcast room-wide). */
  clientOverlay: Record<string, unknown>;
  /** Authoritative params for evaluation of this seat. */
  serverOverlay: Record<string, unknown>;
  /** wait_for_signal: per-seat blue-heart schedule. */
  signalToken?: string | null;
  signalAtMonoMs?: number | null;
  signaledAtMs?: number | null;
  signalEndsAtMs?: number | null;
  signalEndsAtMonoMs?: number | null;
  signalPhase?: 'waiting_signal' | 'signal_active' | 'signal_expired';
};

const DEFAULT_TILT_SHAPES: TiltTargetShape[] = [
  'circle',
  'square',
  'diamond',
  'heart',
];

const DEFAULT_TILT_TARGETS: Array<{
  targetX: number;
  targetY: number;
  targetShape: TiltTargetShape;
}> = [
  { targetX: 0.35, targetY: 0, targetShape: 'circle' },
  { targetX: -0.4, targetY: 0.15, targetShape: 'square' },
  { targetX: 0.1, targetY: -0.4, targetShape: 'diamond' },
  { targetX: -0.25, targetY: 0.35, targetShape: 'heart' },
  { targetX: 0.45, targetY: -0.2, targetShape: 'circle' },
  { targetX: -0.15, targetY: -0.3, targetShape: 'square' },
];

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

type OddOneOutLayout = {
  columns: number;
  glyphKeys: string[];
  majorityGlyph: string;
  oddGlyph: string;
};

function buildOddOneOutGlyphs(
  length: number,
  majorityGlyph: string,
  oddGlyph: string,
  oddIndex: number,
): string[] {
  const glyphs = Array.from({ length }, () => majorityGlyph);
  const idx = clamp(oddIndex, 0, Math.max(0, length - 1));
  if (length > 0) {
    glyphs[idx] = oddGlyph;
  }
  return glyphs;
}

function resolveOddPair(
  glyphKeys: string[],
  oddIndex: number,
): { majorityGlyph: string; oddGlyph: string } {
  const safeIndex = clamp(oddIndex, 0, Math.max(0, glyphKeys.length - 1));
  const oddGlyph =
    (glyphKeys[safeIndex] && String(glyphKeys[safeIndex])) || 'pulse.b';
  const majorityGlyph =
    glyphKeys.find((g, i) => i !== safeIndex && g !== oddGlyph) ??
    glyphKeys.find((g) => g !== oddGlyph) ??
    'pulse.a';
  return { majorityGlyph, oddGlyph };
}

function readOddOneOutLayouts(
  serverConfig: Record<string, unknown>,
): OddOneOutLayout[] {
  const layouts: OddOneOutLayout[] = [];
  const pushLayout = (row: Record<string, unknown>) => {
    const glyphKeysRaw = row['glyphKeys'];
    const glyphKeys = Array.isArray(glyphKeysRaw)
      ? glyphKeysRaw.filter((g): g is string => typeof g === 'string')
      : [];
    if (glyphKeys.length < 4) return;
    const columns = num(row['columns'], 4);
    const oddIndex = num(row['oddIndex'], 0);
    const pair = resolveOddPair(glyphKeys, oddIndex);
    layouts.push({
      columns,
      glyphKeys,
      majorityGlyph: pair.majorityGlyph,
      oddGlyph: pair.oddGlyph,
    });
  };

  const variants = serverConfig['variants'];
  if (Array.isArray(variants)) {
    for (const entry of variants) {
      if (entry && typeof entry === 'object') {
        pushLayout(entry as Record<string, unknown>);
      }
    }
  }
  pushLayout(serverConfig);
  return layouts;
}

function readAudioPulseCountOptions(
  serverConfig: Record<string, unknown>,
): number[] {
  const raw = serverConfig['pulseCountOptions'];
  if (Array.isArray(raw) && raw.length > 0) {
    const parsed = [
      ...new Set(
        raw
          .map((v) => num(v, NaN))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 8)
          .map((n) => Math.floor(n)),
      ),
    ];
    if (parsed.length > 0) {
      return parsed;
    }
  }
  const base = clamp(Math.floor(num(serverConfig['pulseCount'], 3)), 1, 8);
  return [
    ...new Set(
      [base - 1, base, base + 1, base + 2]
        .map((n) => clamp(n, 1, 8))
        .filter((n) => n >= 1),
    ),
  ];
}

function readTiltVariants(
  serverConfig: Record<string, unknown>,
): Array<{ targetX: number; targetY: number; targetShape: TiltTargetShape }> {
  const raw = serverConfig['targetVariants'];
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_TILT_TARGETS;
  }
  const parsed: Array<{
    targetX: number;
    targetY: number;
    targetShape: TiltTargetShape;
  }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const targetX = num(row['targetX'], NaN);
    const targetY = num(row['targetY'], NaN);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) continue;
    const shapeRaw = row['targetShape'];
    const targetShape =
      typeof shapeRaw === 'string' &&
      (DEFAULT_TILT_SHAPES as string[]).includes(shapeRaw)
        ? (shapeRaw as TiltTargetShape)
        : 'circle';
    parsed.push({
      targetX: clamp(targetX, -1, 1),
      targetY: clamp(targetY, -1, 1),
      targetShape,
    });
  }
  return parsed.length > 0 ? parsed : DEFAULT_TILT_TARGETS;
}

function signalDelayRangeMs(
  definition: ChallengeDefinition,
  participantCount: number,
): { min: number; max: number } {
  const windowMs = num(definition.serverConfig['signalWindowMs'], 750);
  const fixed = num(definition.serverConfig['signalDelayMs'], 1500);
  const raw = definition.serverConfig['signalDelayRangeMs'];
  let min = fixed;
  let max = fixed;
  if (raw && typeof raw === 'object') {
    const range = raw as Record<string, unknown>;
    min = num(range['min'], fixed);
    max = num(range['max'], fixed);
  } else if (participantCount > 1) {
    // Multi-seat matches spread delays so the blue heart cannot be synced.
    min = Math.max(500, Math.floor(fixed * 0.45));
    max = Math.min(
      Math.max(min, fixed + 1200),
      Math.max(min, definition.durationMs - windowMs - 50),
    );
  }
  if (max < min) {
    max = min;
  }
  const latest = Math.max(0, definition.durationMs - windowMs - 1);
  min = clamp(min, 0, latest);
  max = clamp(max, min, latest);
  return { min, max };
}

/**
 * Freeze server-driven per-seat play params at challenge start.
 * Reconnects must reuse these values — never re-roll.
 */
function pinSharedTiltVariant(
  definition: ChallengeDefinition,
): {
  targetX: number;
  targetY: number;
  targetShape: TiltTargetShape;
  holdMs: number;
  varianceTolerance: number;
} {
  const existingX = num(definition.serverConfig['targetX'], Number.NaN);
  const existingY = num(definition.serverConfig['targetY'], Number.NaN);
  const existingShapeRaw = definition.serverConfig['targetShape'];
  const holdMs = num(definition.serverConfig['holdMs'], 1500);
  const varianceTolerance = num(
    definition.serverConfig['varianceTolerance'],
    0.22,
  );
  const alreadyPinned =
    Number.isFinite(existingX) &&
    Number.isFinite(existingY) &&
    definition.serverConfig['tiltVariantPinned'] === true;
  const pick = alreadyPinned
    ? {
        targetX: clamp(existingX, -1, 1),
        targetY: clamp(existingY, -1, 1),
        targetShape:
          typeof existingShapeRaw === 'string' &&
          (DEFAULT_TILT_SHAPES as string[]).includes(existingShapeRaw)
            ? (existingShapeRaw as TiltTargetShape)
            : 'circle',
      }
    : (() => {
        const variants = readTiltVariants(definition.serverConfig);
        return variants[randomInt(0, variants.length)]!;
      })();
  definition.serverConfig['targetX'] = pick.targetX;
  definition.serverConfig['targetY'] = pick.targetY;
  definition.serverConfig['targetShape'] = pick.targetShape;
  definition.serverConfig['holdMs'] = holdMs;
  definition.serverConfig['varianceTolerance'] = varianceTolerance;
  definition.serverConfig['tiltVariantPinned'] = true;
  definition.clientConfig['targetX'] = pick.targetX;
  definition.clientConfig['targetY'] = pick.targetY;
  definition.clientConfig['targetShape'] = pick.targetShape;
  definition.clientConfig['holdMs'] = holdMs;
  definition.clientConfig['varianceTolerance'] = varianceTolerance;
  return { ...pick, holdMs, varianceTolerance };
}

export function assignSeatVariants(
  challenge: ChallengeRound,
  nowMonoMs: number,
): Map<string, SeatChallengeVariant> {
  const seats = new Map<string, SeatChallengeVariant>();
  const ids = challenge.participatingPlayerIds;
  if (ids.length === 0) {
    return seats;
  }

  if (challenge.engineId === 'reaction.wait_for_signal') {
    const { min, max } = signalDelayRangeMs(challenge.definition, ids.length);
    for (const playerId of ids) {
      const delayMs = min === max ? min : randomInt(min, max + 1);
      seats.set(playerId, {
        clientOverlay: {},
        serverOverlay: {
          signalDelayMs: delayMs,
          signalWindowMs: num(
            challenge.definition.serverConfig['signalWindowMs'],
            750,
          ),
        },
        signalToken: randomBytes(16).toString('base64url'),
        signalAtMonoMs: nowMonoMs + delayMs,
        signaledAtMs: null,
        signalEndsAtMs: null,
        signalEndsAtMonoMs: null,
        signalPhase: 'waiting_signal',
      });
    }
    return seats;
  }

  if (challenge.engineId === 'motion.tilt_balance') {
    const pinned = pinSharedTiltVariant(challenge.definition);
    // Same target for every seat so room-broadcast and evaluation stay aligned.
    for (const playerId of ids) {
      seats.set(playerId, {
        clientOverlay: {
          targetX: pinned.targetX,
          targetY: pinned.targetY,
          targetShape: pinned.targetShape,
          holdMs: pinned.holdMs,
          varianceTolerance: pinned.varianceTolerance,
        },
        serverOverlay: {
          targetX: pinned.targetX,
          targetY: pinned.targetY,
          targetShape: pinned.targetShape,
          holdMs: pinned.holdMs,
          varianceTolerance: pinned.varianceTolerance,
        },
      });
    }
    return seats;
  }

  if (challenge.engineId === 'gesture.reverse_swipe') {
    const pairs: Array<{
      displayed: 'left' | 'right';
      required: 'left' | 'right';
    }> = [
      { displayed: 'right', required: 'left' },
      { displayed: 'left', required: 'right' },
    ];
    const deck = [...pairs];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i + 1);
      const tmp = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = tmp;
    }
    const minDistance = num(
      challenge.definition.serverConfig['minDistancePx'],
      num(challenge.definition.clientConfig['minDistancePx'], 80),
    );
    ids.forEach((playerId, index) => {
      const pick = deck[index % deck.length]!;
      seats.set(playerId, {
        clientOverlay: {
          displayedDirection: pick.displayed,
          minDistancePx: minDistance,
        },
        serverOverlay: {
          displayedDirection: pick.displayed,
          requiredDirection: pick.required,
          minDistancePx: minDistance,
        },
      });
    });
    return seats;
  }

  if (challenge.engineId === 'geography.select_on_map') {
    const regionsRaw = challenge.definition.serverConfig['regions'];
    const regions = Array.isArray(regionsRaw)
      ? regionsRaw.filter(
          (r): r is { regionId: string; labelKey: string } =>
            !!r &&
            typeof r === 'object' &&
            typeof (r as { regionId?: unknown }).regionId === 'string' &&
            typeof (r as { labelKey?: unknown }).labelKey === 'string',
        )
      : [];
    const mapId =
      typeof challenge.definition.serverConfig['mapId'] === 'string'
        ? challenge.definition.serverConfig['mapId']
        : null;
    const mapQuestions = readGeographyQuestionBank(
      challenge.definition.serverConfig,
    ).filter((q) => (mapId ? q.mapId === mapId : true));
    const pool =
      mapQuestions.length > 0
        ? mapQuestions.map((q) => ({
            regionId: q.targetRegionId,
            labelKey: q.targetLabelKey,
          }))
        : regions;
    if (pool.length === 0) {
      return seats;
    }
    const deck = [...pool];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i + 1);
      const tmp = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = tmp;
    }
    ids.forEach((playerId, index) => {
      const pick = deck[index % deck.length]!;
      seats.set(playerId, {
        clientOverlay: {
          targetLabelKey: pick.labelKey,
        },
        serverOverlay: {
          targetRegionId: pick.regionId,
        },
      });
    });
    return seats;
  }

  if (challenge.engineId === 'focus.odd_one_out') {
    const layouts = readOddOneOutLayouts(challenge.definition.serverConfig);
    if (layouts.length === 0) {
      return seats;
    }
    // Shuffle layout templates, then give each seat a unique odd cell index.
    const deck = [...layouts];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i + 1);
      const tmp = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = tmp;
    }
    ids.forEach((playerId, index) => {
      const base = deck[index % deck.length]!;
      const length = base.glyphKeys.length;
      const oddIndex = length <= 1 ? 0 : randomInt(0, length);
      const glyphKeys = buildOddOneOutGlyphs(
        length,
        base.majorityGlyph,
        base.oddGlyph,
        oddIndex,
      );
      seats.set(playerId, {
        clientOverlay: {
          columns: base.columns,
          glyphKeys,
        },
        serverOverlay: {
          columns: base.columns,
          glyphKeys,
          oddIndex,
        },
      });
    });
    return seats;
  }

  if (challenge.engineId === 'audio.multiple_choice') {
    return assignAudioMultipleChoiceSeatVariants(
      challenge.definition.serverConfig,
      ids,
    );
  }

  if (challenge.engineId === 'audio.cue') {
    const options = readAudioPulseCountOptions(
      challenge.definition.serverConfig,
    );
    const deck = [...options];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i + 1);
      const tmp = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = tmp;
    }
    ids.forEach((playerId, index) => {
      const pulseCount = deck[index % deck.length]!;
      seats.set(playerId, {
        clientOverlay: { pulseCount },
        serverOverlay: { pulseCount },
      });
    });
    return seats;
  }

  if (challenge.engineId === 'precision.neon_cable') {
    const variantsRaw = challenge.definition.serverConfig['variants'];
    const variants = Array.isArray(variantsRaw)
      ? (variantsRaw as Array<Record<string, unknown>>)
      : [];
    const deck =
      variants.length > 0
        ? [...variants]
        : [
            {
              sockets: challenge.definition.serverConfig['sockets'],
              correctSocketId:
                challenge.definition.serverConfig['correctSocketId'],
              plugColor: challenge.definition.serverConfig['plugColor'],
            },
          ];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i + 1);
      const tmp = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = tmp;
    }
    ids.forEach((playerId, index) => {
      const pick = deck[index % deck.length]!;
      const overlay: Record<string, unknown> = {
        sockets: pick['sockets'],
        correctSocketId: pick['correctSocketId'],
        plugColor: pick['plugColor'],
      };
      if (typeof pick['plugStartXNorm'] === 'number') {
        overlay['plugStartXNorm'] = pick['plugStartXNorm'];
      }
      if (typeof pick['plugStartYNorm'] === 'number') {
        overlay['plugStartYNorm'] = pick['plugStartYNorm'];
      }
      seats.set(playerId, {
        clientOverlay: { ...overlay },
        serverOverlay: { ...overlay },
      });
    });
    return seats;
  }

  if (challenge.engineId === 'gesture.fog_wipe') {
    const baseAssetIds = challenge.definition.serverConfig['assetIds'];
    if (!baseAssetIds || typeof baseAssetIds !== 'object') {
      return seats;
    }
    const base = { ...(baseAssetIds as Record<string, unknown>) };
    const variantsRaw =
      challenge.definition.serverConfig['revealContentVariants'];
    const pool = Array.isArray(variantsRaw)
      ? variantsRaw.filter(
          (id): id is string => typeof id === 'string' && id.length > 0,
        )
      : [];
    const fallback =
      typeof base['revealContent'] === 'string' ? [base['revealContent']] : [];
    const deck = [...(pool.length > 0 ? pool : fallback)];
    if (deck.length === 0) {
      return seats;
    }
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = randomInt(0, i + 1);
      const tmp = deck[i]!;
      deck[i] = deck[j]!;
      deck[j] = tmp;
    }
    ids.forEach((playerId, index) => {
      const revealContent = deck[index % deck.length]!;
      // Shallow merge replaces nested assetIds — send the full map.
      const assetIds = { ...base, revealContent };
      seats.set(playerId, {
        clientOverlay: { assetIds },
        serverOverlay: { assetIds },
      });
    });
    return seats;
  }

  return seats;
}

export function cloneSeatVariants(
  source: Map<string, SeatChallengeVariant> | undefined,
): Map<string, SeatChallengeVariant> | undefined {
  if (!source) return undefined;
  const next = new Map<string, SeatChallengeVariant>();
  for (const [playerId, seat] of source) {
    next.set(playerId, {
      clientOverlay: { ...seat.clientOverlay },
      serverOverlay: { ...seat.serverOverlay },
      signalToken: seat.signalToken,
      signalAtMonoMs: seat.signalAtMonoMs,
      signaledAtMs: seat.signaledAtMs,
      signalEndsAtMs: seat.signalEndsAtMs,
      signalEndsAtMonoMs: seat.signalEndsAtMonoMs,
      signalPhase: seat.signalPhase,
    });
  }
  return next;
}

/** Earliest waiting seat signal delay remaining (ms), or null. */
export function nextSeatSignalDelayMs(
  challenge: ChallengeRound,
  nowMonoMs: number,
): number | null {
  if (!challenge.seatVariants || challenge.seatVariants.size === 0) {
    return null;
  }
  let earliest: number | null = null;
  for (const seat of challenge.seatVariants.values()) {
    if (seat.signalPhase !== 'waiting_signal' || seat.signalAtMonoMs == null) {
      continue;
    }
    const remaining = seat.signalAtMonoMs - nowMonoMs;
    if (earliest == null || remaining < earliest) {
      earliest = remaining;
    }
  }
  return earliest;
}
