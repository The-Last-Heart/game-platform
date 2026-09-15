import { randomInt } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ChallengeDefinition,
  ChallengeEvaluation,
  ChallengeEvaluator,
} from '../types';

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function shuffleCopy<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

function pickVariant<T extends Record<string, unknown>>(
  server: Record<string, unknown>,
  fallback: T,
): T {
  const raw = server['variants'];
  if (!Array.isArray(raw) || raw.length === 0) {
    return fallback;
  }
  const pick = raw[randomInt(0, raw.length)];
  if (!pick || typeof pick !== 'object' || Array.isArray(pick)) {
    return fallback;
  }
  return { ...fallback, ...(pick as T) };
}

export const TRIVIA_MULTIPLE_CHOICE_ENGINE_ID = 'trivia.multiple_choice';
export const GEOGRAPHY_SELECT_ON_MAP_ENGINE_ID = 'geography.select_on_map';
export const FOCUS_ODD_ONE_OUT_ENGINE_ID = 'focus.odd_one_out';
export const ORDER_SEQUENCE_SORT_ENGINE_ID = 'order.sequence_sort';
export const PRECISION_MAZE_PATH_ENGINE_ID = 'precision.maze_path';
export const PRECISION_NEON_CABLE_ENGINE_ID = 'precision.neon_cable';
export const GESTURE_FOG_WIPE_ENGINE_ID = 'gesture.fog_wipe';
export const LOGIC_BALANCE_SCALE_ENGINE_ID = 'logic.balance_scale';
export const FOCUS_STROOP_ENGINE_ID = 'focus.stroop';
export const SEARCH_SELECT_OCCURRENCES_ENGINE_ID = 'search.select_occurrences';

export class TriviaMultipleChoiceEvaluator implements ChallengeEvaluator {
  readonly engineId = TRIVIA_MULTIPLE_CHOICE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const correct = str(input.definition.serverConfig['correctOptionKey']);
    const chosen = str(input.answer['chosenOptionKey']);
    if (!correct || !chosen || chosen !== correct) {
      return { success: false, reasonKey: 'result.trivia.wrong' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class GeographySelectOnMapEvaluator implements ChallengeEvaluator {
  readonly engineId = GEOGRAPHY_SELECT_ON_MAP_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const target = str(input.definition.serverConfig['targetRegionId']);
    const regionId = input.answer['regionId'];
    const chosen = typeof regionId === 'string' ? regionId : null;
    if (!target || !chosen || chosen !== target) {
      return { success: false, reasonKey: 'result.map.wrong' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class FocusOddOneOutEvaluator implements ChallengeEvaluator {
  readonly engineId = FOCUS_ODD_ONE_OUT_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const oddIndex = num(input.definition.serverConfig['oddIndex'], -1);
    const selected = num(input.answer['selectedIndex'], -2);
    if (oddIndex < 0 || selected !== oddIndex) {
      return { success: false, reasonKey: 'result.focus.wrong' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class OrderSequenceSortEvaluator implements ChallengeEvaluator {
  readonly engineId = ORDER_SEQUENCE_SORT_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const expected = input.definition.serverConfig['correctOrder'];
    const ordered = input.answer['orderedKeys'];
    if (!Array.isArray(expected) || !Array.isArray(ordered)) {
      return { success: false, reasonKey: 'result.order.invalid' };
    }
    if (expected.length !== ordered.length) {
      return { success: false, reasonKey: 'result.order.wrong' };
    }
    const ok = expected.every((v, i) => v === ordered[i]);
    return {
      success: ok,
      reasonKey: ok ? 'result.success' : 'result.order.wrong',
      measureMs: ok ? Math.max(0, Math.floor(input.receivedMonoMs)) : undefined,
    };
  }
}

export class PrecisionMazePathEvaluator implements ChallengeEvaluator {
  readonly engineId = PRECISION_MAZE_PATH_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const reached = input.answer['reachedGoal'] === true;
    const hitWall = input.answer['hitWall'] === true;
    if (!reached || hitWall) {
      return { success: false, reasonKey: 'result.maze.failed' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class PrecisionNeonCableEvaluator implements ChallengeEvaluator {
  readonly engineId = PRECISION_NEON_CABLE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const correct = str(input.definition.serverConfig['correctSocketId']);
    const socketId =
      typeof input.answer['socketId'] === 'string'
        ? input.answer['socketId']
        : null;
    const snapped = input.answer['snapped'] === true;
    if (!correct || !snapped || socketId !== correct) {
      return { success: false, reasonKey: 'result.neon_cable.wrong' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class GestureFogWipeEvaluator implements ChallengeEvaluator {
  readonly engineId = GESTURE_FOG_WIPE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const min = num(input.definition.serverConfig['clearanceRatioMin'], 0.55);
    const ratio = num(input.answer['clearanceRatio'], -1);
    if (ratio < 0 || ratio + 1e-6 < min) {
      return { success: false, reasonKey: 'result.fog_wipe.incomplete' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class LogicBalanceScaleEvaluator implements ChallengeEvaluator {
  readonly engineId = LOGIC_BALANCE_SCALE_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const correct = num(input.definition.serverConfig['correctWeight'], -1);
    const chosen = num(input.answer['chosenWeight'], -2);
    if (correct < 0 || chosen !== correct) {
      return { success: false, reasonKey: 'result.balance.wrong' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class FocusStroopEvaluator implements ChallengeEvaluator {
  readonly engineId = FOCUS_STROOP_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const correct = str(input.definition.serverConfig['correctOptionKey']);
    const chosen = str(input.answer['chosenOptionKey']);
    if (!correct || !chosen || chosen !== correct) {
      return { success: false, reasonKey: 'result.stroop.wrong' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export class SearchSelectOccurrencesEvaluator implements ChallengeEvaluator {
  readonly engineId = SEARCH_SELECT_OCCURRENCES_ENGINE_ID;

  evaluate(input: {
    definition: ChallengeDefinition;
    answer: Record<string, unknown>;
    receivedMonoMs: number;
    deadlineMonoMs: number;
  }): ChallengeEvaluation {
    if (input.receivedMonoMs > input.deadlineMonoMs) {
      return { success: false, reasonKey: 'result.timeout' };
    }
    const requiredRaw = input.definition.serverConfig['requiredIndices'];
    const selectedRaw = input.answer['selectedIndices'];
    if (!Array.isArray(requiredRaw) || !Array.isArray(selectedRaw)) {
      return { success: false, reasonKey: 'result.search.invalid' };
    }
    const required = requiredRaw
      .filter((v): v is number => typeof v === 'number')
      .slice()
      .sort((a, b) => a - b);
    const selected = selectedRaw
      .filter((v): v is number => typeof v === 'number')
      .slice()
      .sort((a, b) => a - b);
    const requiredSet = new Set(required);
    if (selected.some((i) => !requiredSet.has(i))) {
      return { success: false, reasonKey: 'result.search.wrong' };
    }
    if (
      selected.length !== required.length ||
      selected.some((v, i) => v !== required[i])
    ) {
      return { success: false, reasonKey: 'result.search.incomplete' };
    }
    return {
      success: true,
      reasonKey: 'result.success',
      measureMs: Math.max(0, Math.floor(input.receivedMonoMs)),
    };
  }
}

export function createPack31Evaluators(): ChallengeEvaluator[] {
  return [
    new TriviaMultipleChoiceEvaluator(),
    new GeographySelectOnMapEvaluator(),
    new FocusOddOneOutEvaluator(),
    new OrderSequenceSortEvaluator(),
    new PrecisionMazePathEvaluator(),
    new PrecisionNeonCableEvaluator(),
    new GestureFogWipeEvaluator(),
    new LogicBalanceScaleEvaluator(),
    new FocusStroopEvaluator(),
    new SearchSelectOccurrencesEvaluator(),
  ];
}

type GeoMap = {
  mapId: string;
  assetId: string;
  imageWidth: number;
  imageHeight: number;
  regions: Array<{
    regionId: string;
    labelKey: string;
    polygon: Array<{ x: number; y: number }>;
  }>;
};

let cachedMaps: GeoMap[] | null = null;

export function loadGeographyMaps(): GeoMap[] {
  if (cachedMaps) return cachedMaps;
  const candidates = [
    resolve(process.cwd(), 'content-pack/maps/geography-maps.json'),
    resolve(process.cwd(), 'apps/backend/content-pack/maps/geography-maps.json'),
    resolve(__dirname, '..', '..', '..', 'content-pack/maps/geography-maps.json'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as {
      maps?: GeoMap[];
    };
    if (Array.isArray(parsed.maps) && parsed.maps.length > 0) {
      cachedMaps = parsed.maps;
      return cachedMaps;
    }
  }
  cachedMaps = [];
  return cachedMaps;
}

/**
 * Materialize per-round / per-seat fields onto a pinned definition.
 * Shared maps are chosen once for geography; seat targets assigned later.
 */
export function materializePack31Round(definition: ChallengeDefinition): void {
  const server = definition.serverConfig;
  const client = definition.clientConfig;

  if (definition.engineId === TRIVIA_MULTIPLE_CHOICE_ENGINE_ID) {
    const questions = Array.isArray(server['questions'])
      ? (server['questions'] as Array<Record<string, unknown>>)
      : [];
    const q =
      questions.length > 0
        ? questions[randomInt(0, questions.length)]!
        : {
            questionKey: server['questionKey'],
            optionKeys: server['optionKeys'],
            correctOptionKey: server['correctOptionKey'],
          };
    const optionKeys = Array.isArray(q['optionKeys'])
      ? (q['optionKeys'] as string[])
      : [];
    const shuffled = shuffleCopy(optionKeys);
    server['questionKey'] = q['questionKey'];
    server['optionKeys'] = shuffled;
    server['correctOptionKey'] = q['correctOptionKey'];
    client['questionKey'] = q['questionKey'];
    client['optionKeys'] = shuffled;
    return;
  }

  if (definition.engineId === GEOGRAPHY_SELECT_ON_MAP_ENGINE_ID) {
    const maps =
      Array.isArray(server['maps']) && (server['maps'] as GeoMap[]).length > 0
        ? (server['maps'] as GeoMap[])
        : loadGeographyMaps();
    if (maps.length === 0) return;
    const map = maps[randomInt(0, maps.length)]!;
    server['mapId'] = map.mapId;
    server['assetId'] = map.assetId;
    server['imageWidth'] = map.imageWidth;
    server['imageHeight'] = map.imageHeight;
    server['regions'] = map.regions;
    // targetRegionId filled per-seat in seat-variants
    client['mapId'] = map.mapId;
    client['assetId'] = map.assetId;
    client['imageWidth'] = map.imageWidth;
    client['imageHeight'] = map.imageHeight;
    client['regions'] = map.regions;
    return;
  }

  if (definition.engineId === FOCUS_ODD_ONE_OUT_ENGINE_ID) {
    const variant = pickVariant(server, {
      columns: num(server['columns'], 4),
      glyphKeys: (server['glyphKeys'] as string[]) ?? [],
      oddIndex: num(server['oddIndex'], 0),
    });
    Object.assign(server, variant);
    client['columns'] = variant.columns;
    client['glyphKeys'] = variant.glyphKeys;
    return;
  }

  if (definition.engineId === ORDER_SEQUENCE_SORT_ENGINE_ID) {
    const variant = pickVariant(server, {
      itemKeys: (server['itemKeys'] as string[]) ?? [],
      correctOrder: (server['correctOrder'] as string[]) ?? [],
      ascending: server['ascending'] !== false,
    });
    const shuffled = shuffleCopy(variant.itemKeys);
    server['itemKeys'] = shuffled;
    server['correctOrder'] = variant.correctOrder;
    server['ascending'] = variant.ascending;
    client['itemKeys'] = shuffled;
    client['ascending'] = variant.ascending;
    return;
  }

  if (definition.engineId === PRECISION_MAZE_PATH_ENGINE_ID) {
    const variant = pickVariant(server, {
      cols: num(server['cols'], 5),
      rows: num(server['rows'], 5),
      cells: (server['cells'] as number[]) ?? [],
      startIndex: num(server['startIndex'], 0),
      goalIndex: num(server['goalIndex'], 0),
    });
    Object.assign(server, variant);
    Object.assign(client, {
      cols: variant.cols,
      rows: variant.rows,
      cells: variant.cells,
      startIndex: variant.startIndex,
      goalIndex: variant.goalIndex,
    });
    return;
  }

  if (definition.engineId === PRECISION_NEON_CABLE_ENGINE_ID) {
    applyNeonCableVariant(definition, pickNeonCableVariant(server));
    return;
  }

  if (definition.engineId === LOGIC_BALANCE_SCALE_ENGINE_ID) {
    const variant = pickVariant(server, {
      leftWeights: (server['leftWeights'] as number[]) ?? [],
      rightKnownWeights: (server['rightKnownWeights'] as number[]) ?? [],
      optionWeights: (server['optionWeights'] as number[]) ?? [],
      correctWeight: num(server['correctWeight'], 1),
    });
    const options = shuffleCopy(variant.optionWeights);
    server['leftWeights'] = variant.leftWeights;
    server['rightKnownWeights'] = variant.rightKnownWeights;
    server['optionWeights'] = options;
    server['correctWeight'] = variant.correctWeight;
    client['leftWeights'] = variant.leftWeights;
    client['rightKnownWeights'] = variant.rightKnownWeights;
    client['optionWeights'] = options;
    return;
  }

  if (definition.engineId === FOCUS_STROOP_ENGINE_ID) {
    const variant = pickVariant(server, {
      wordKey: str(server['wordKey']) ?? 'color.red',
      inkColorId: str(server['inkColorId']) ?? 'cyan',
      optionKeys: (server['optionKeys'] as string[]) ?? [],
      correctOptionKey: str(server['correctOptionKey']) ?? 'cyan',
    });
    const options = shuffleCopy(variant.optionKeys);
    server['wordKey'] = variant.wordKey;
    server['inkColorId'] = variant.inkColorId;
    server['optionKeys'] = options;
    server['correctOptionKey'] = variant.correctOptionKey;
    client['wordKey'] = variant.wordKey;
    client['inkColorId'] = variant.inkColorId;
    client['optionKeys'] = options;
    return;
  }

  if (definition.engineId === SEARCH_SELECT_OCCURRENCES_ENGINE_ID) {
    const variant = pickVariant(server, {
      columns: num(server['columns'], 4),
      cells: (server['cells'] as string[]) ?? [],
      targetValue: str(server['targetValue']) ?? '8',
      requiredIndices: (server['requiredIndices'] as number[]) ?? [],
    });
    Object.assign(server, variant);
    client['columns'] = variant.columns;
    client['cells'] = variant.cells;
    client['targetValue'] = variant.targetValue;
  }
}

function pickNeonCableVariant(
  server: Record<string, unknown>,
): Record<string, unknown> {
  const variants = Array.isArray(server['variants'])
    ? (server['variants'] as Array<Record<string, unknown>>)
    : [];
  if (variants.length === 0) {
    return {
      sockets: server['sockets'],
      correctSocketId: server['correctSocketId'],
      plugColor: server['plugColor'],
      plugStartXNorm: server['plugStartXNorm'],
      plugStartYNorm: server['plugStartYNorm'],
    };
  }
  return variants[randomInt(0, variants.length)]!;
}

export function applyNeonCableVariant(
  definition: ChallengeDefinition,
  variant: Record<string, unknown>,
): void {
  const server = definition.serverConfig;
  const client = definition.clientConfig;
  if (Array.isArray(variant['sockets'])) {
    server['sockets'] = variant['sockets'];
    client['sockets'] = variant['sockets'];
  }
  if (typeof variant['correctSocketId'] === 'string') {
    server['correctSocketId'] = variant['correctSocketId'];
    client['correctSocketId'] = variant['correctSocketId'];
  }
  if (typeof variant['plugColor'] === 'string') {
    server['plugColor'] = variant['plugColor'];
    client['plugColor'] = variant['plugColor'];
  }
  if (typeof variant['plugStartXNorm'] === 'number') {
    server['plugStartXNorm'] = variant['plugStartXNorm'];
    client['plugStartXNorm'] = variant['plugStartXNorm'];
  }
  if (typeof variant['plugStartYNorm'] === 'number') {
    server['plugStartYNorm'] = variant['plugStartYNorm'];
    client['plugStartYNorm'] = variant['plugStartYNorm'];
  }
  // Mirror shared layout/asset fields onto client for mobile.
  for (const key of [
    'assetIds',
    'cableAnchorXNorm',
    'cableAnchorYNorm',
    'plugCableAnchorNorm',
    'plugTipAnchorNorm',
    'socketTargetAnchorNorm',
    'snapRadiusNorm',
    'wrongDropPolicy',
    'plugStartXNorm',
    'plugStartYNorm',
  ] as const) {
    if (server[key] != null && client[key] == null) {
      client[key] = server[key];
    }
  }
}

export { shuffleCopy };
