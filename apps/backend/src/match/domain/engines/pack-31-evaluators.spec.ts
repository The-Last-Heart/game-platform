import {
  FocusOddOneOutEvaluator,
  FocusStroopEvaluator,
  GeographySelectOnMapEvaluator,
  GestureFogWipeEvaluator,
  LogicBalanceScaleEvaluator,
  OrderSequenceSortEvaluator,
  PrecisionMazePathEvaluator,
  PrecisionNeonCableEvaluator,
  SearchSelectOccurrencesEvaluator,
  TriviaMultipleChoiceEvaluator,
  loadGeographyMaps,
  materializePack31Round,
} from './pack-31-evaluators';
import { assignSeatVariants } from '../seat-variants';
import type { ChallengeDefinition, ChallengeRound } from '../types';

function def(
  engineId: string,
  serverConfig: Record<string, unknown>,
  clientConfig: Record<string, unknown> = {},
): ChallengeDefinition {
  return {
    definitionId: `${engineId}.test`,
    definitionVersion: 1,
    engineId,
    durationMs: 5000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    promptKey: 'prompt',
    choiceKeys: [],
    clientConfig,
    serverConfig,
  };
}

describe('pack-31 evaluators', () => {
  describe('TriviaMultipleChoiceEvaluator', () => {
    const evaluator = new TriviaMultipleChoiceEvaluator();
    const definition = def('trivia.multiple_choice', {
      correctOptionKey: 'trivia.opt.tokyo',
    });

    it('succeeds on correct option', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { chosenOptionKey: 'trivia.opt.tokyo' },
          receivedMonoMs: 100,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(true);
    });

    it('fails on wrong option', () => {
      const result = evaluator.evaluate({
        definition,
        answer: { chosenOptionKey: 'trivia.opt.osaka' },
        receivedMonoMs: 100,
        deadlineMonoMs: 5000,
      });
      expect(result.success).toBe(false);
      expect(result.reasonKey).toBe('result.trivia.wrong');
    });
  });

  describe('GeographySelectOnMapEvaluator', () => {
    const evaluator = new GeographySelectOnMapEvaluator();
    const definition = def('geography.select_on_map', {
      targetRegionId: 'jordan',
    });

    it('succeeds when region matches', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { regionId: 'jordan' },
          receivedMonoMs: 100,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(true);
    });

    it('fails on miss or wrong region', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { regionId: null },
          receivedMonoMs: 100,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(false);
      expect(
        evaluator.evaluate({
          definition,
          answer: { regionId: 'egypt' },
          receivedMonoMs: 100,
          deadlineMonoMs: 5000,
        }).reasonKey,
      ).toBe('result.map.wrong');
    });
  });

  describe('FocusOddOneOutEvaluator', () => {
    const evaluator = new FocusOddOneOutEvaluator();
    const definition = def('focus.odd_one_out', { oddIndex: 3 });

    it('succeeds on odd index', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { selectedIndex: 3 },
          receivedMonoMs: 50,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(true);
    });
  });

  describe('PrecisionNeonCableEvaluator', () => {
    const evaluator = new PrecisionNeonCableEvaluator();
    const definition = def('precision.neon_cable', {
      correctSocketId: 'socket.cyan',
    });

    it('succeeds on correct snapped socket', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { socketId: 'socket.cyan', snapped: true },
          receivedMonoMs: 100,
          deadlineMonoMs: 8000,
        }).success,
      ).toBe(true);
    });

    it('fails on wrong socket', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { socketId: 'socket.red', snapped: true },
          receivedMonoMs: 100,
          deadlineMonoMs: 8000,
        }).reasonKey,
      ).toBe('result.neon_cable.wrong');
    });
  });

  describe('GestureFogWipeEvaluator', () => {
    const evaluator = new GestureFogWipeEvaluator();
    const definition = def('gesture.fog_wipe', {
      clearanceRatioMin: 0.55,
    });

    it('succeeds when clearance meets threshold', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { clearanceRatio: 0.62 },
          receivedMonoMs: 100,
          deadlineMonoMs: 10000,
        }).success,
      ).toBe(true);
    });

    it('fails when clearance is below threshold', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { clearanceRatio: 0.4 },
          receivedMonoMs: 100,
          deadlineMonoMs: 10000,
        }).reasonKey,
      ).toBe('result.fog_wipe.incomplete');
    });
  });

  describe('OrderSequenceSortEvaluator', () => {
    const evaluator = new OrderSequenceSortEvaluator();
    const definition = def('order.sequence_sort', {
      correctOrder: ['num.2', 'num.4', 'num.7', 'num.9'],
    });

    it('succeeds on exact order', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { orderedKeys: ['num.2', 'num.4', 'num.7', 'num.9'] },
          receivedMonoMs: 50,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(true);
    });
  });

  describe('PrecisionMazePathEvaluator', () => {
    const evaluator = new PrecisionMazePathEvaluator();
    const definition = def('precision.maze_path', {});

    it('requires reachedGoal without wall hit', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { reachedGoal: true, hitWall: false },
          receivedMonoMs: 50,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(true);
      expect(
        evaluator.evaluate({
          definition,
          answer: { reachedGoal: false, hitWall: true },
          receivedMonoMs: 50,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(false);
    });
  });

  describe('LogicBalanceScaleEvaluator', () => {
    const evaluator = new LogicBalanceScaleEvaluator();
    const definition = def('logic.balance_scale', { correctWeight: 2 });

    it('succeeds on correct weight', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { chosenWeight: 2 },
          receivedMonoMs: 50,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(true);
    });
  });

  describe('FocusStroopEvaluator', () => {
    const evaluator = new FocusStroopEvaluator();
    const definition = def('focus.stroop', { correctOptionKey: 'cyan' });

    it('succeeds on ink color option', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { chosenOptionKey: 'cyan' },
          receivedMonoMs: 50,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(true);
    });
  });

  describe('SearchSelectOccurrencesEvaluator', () => {
    const evaluator = new SearchSelectOccurrencesEvaluator();
    const definition = def('search.select_occurrences', {
      requiredIndices: [1, 7, 10],
    });

    it('succeeds when all required indices selected', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { selectedIndices: [10, 1, 7] },
          receivedMonoMs: 50,
          deadlineMonoMs: 5000,
        }).success,
      ).toBe(true);
    });

    it('fails on wrong index', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { selectedIndices: [1, 2] },
          receivedMonoMs: 50,
          deadlineMonoMs: 5000,
        }).reasonKey,
      ).toBe('result.search.wrong');
    });
  });
});

describe('pack-31 materialize + geography seats', () => {
  it('loads geography maps from content-pack', () => {
    const maps = loadGeographyMaps();
    expect(maps.length).toBeGreaterThanOrEqual(4);
    expect(maps[0]?.regions.length).toBeGreaterThan(0);
  });

  it('materializes a shared map and assigns unique seat targets', () => {
    const maps = loadGeographyMaps();
    const definition = def(
      'geography.select_on_map',
      { maps },
      {
        categoryKey: 'challenge.category.geography',
        promptKey: 'challenge.map.prompt',
        mapId: 'x',
        assetId: 'x',
        imageWidth: 10,
        imageHeight: 10,
        targetLabelKey: 'geo.country.egypt',
        regions: [],
      },
    );
    materializePack31Round(definition);
    expect(definition.serverConfig['mapId']).toBeTruthy();
    expect(definition.clientConfig['assetId']).toBe(
      definition.serverConfig['assetId'],
    );
    const regions = definition.serverConfig['regions'] as Array<{
      regionId: string;
      labelKey: string;
    }>;
    expect(regions.length).toBeGreaterThan(1);

    const challenge = {
      challengeInstanceId: 'c1',
      definitionId: definition.definitionId,
      definitionVersion: 1,
      engineId: 'geography.select_on_map',
      definition,
      participatingPlayerIds: ['p0', 'p1', 'p2'],
      startsAtMs: 0,
      deadlineAtMs: 5000,
      startsAtMonoMs: 0,
      deadlineMonoMs: 5000,
      submissions: new Map(),
      roundPhase: 'answer' as const,
    } as ChallengeRound;
    const seats = assignSeatVariants(challenge, 0);
    const targets = [...seats.values()].map(
      (s) => s.serverOverlay['targetRegionId'],
    );
    expect(new Set(targets).size).toBe(Math.min(targets.length, regions.length));
    for (const seat of seats.values()) {
      expect(seat.clientOverlay['targetRegionId']).toBeUndefined();
      expect(seat.clientOverlay['targetLabelKey']).toBeTruthy();
    }
  });
});
