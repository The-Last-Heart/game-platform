import { validateEngineConfigs } from '@thelastheart/contracts';
import { assignSeatVariants } from '../seat-variants';
import type { ChallengeDefinition, ChallengeRound } from '../types';
import {
  CircuitRotationEvaluator,
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

  describe('CircuitRotationEvaluator', () => {
    const evaluator = new CircuitRotationEvaluator();
    const definition = def('precision.circuit_rotation', {
      assetIds: {
        boardBase: 'circuit_rotation.board_base',
        gridPlate: 'circuit_rotation.grid_plate',
        sparkRive: 'neon_cable.cable_spark',
      },
      grid: { rows: 1, columns: 2 },
      source: { cell: [0, 0], side: 'west' },
      target: { cell: [0, 1], side: 'east', kind: 'heart' },
      tiles: [
        {
          id: 'source-tile',
          cell: [0, 0],
          shape: 'straight',
          initialQuarterTurns: 0,
          movable: true,
        },
        {
          id: 'target-tile',
          cell: [0, 1],
          shape: 'straight',
          initialQuarterTurns: 0,
          movable: true,
        },
      ],
      stationaryConnections: [
        { cell: [0, 0], side: 'west' },
        { cell: [0, 1], side: 'east' },
      ],
      theme: {
        inactivePipeColor: '#173746',
        energyColor: '#55E9FF',
        energyCoreColor: '#EFFFFF',
        socketColor: '#B7C3CB',
      },
      rotationDegrees: 90,
      requireAllConfiguredTilesPowered: true,
    });

    it('succeeds only when submitted rotations power the full path', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: {
            tileQuarterTurns: {
              'source-tile': 1,
              'target-tile': 1,
            },
          },
          receivedMonoMs: 100,
          deadlineMonoMs: 8000,
        }),
      ).toMatchObject({
        success: true,
        reasonKey: 'result.success',
      });

      expect(
        evaluator.evaluate({
          definition,
          answer: {
            tileQuarterTurns: {
              'source-tile': 1,
              'target-tile': 0,
            },
          },
          receivedMonoMs: 100,
          deadlineMonoMs: 8000,
        }),
      ).toMatchObject({
        success: false,
        reasonKey: 'result.circuit_rotation.incomplete',
      });
    });

    it('rejects malformed rotation answers', () => {
      expect(
        evaluator.evaluate({
          definition,
          answer: { tileQuarterTurns: { 'source-tile': 4 } },
          receivedMonoMs: 100,
          deadlineMonoMs: 8000,
        }).reasonKey,
      ).toBe('result.circuit_rotation.incomplete');
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
    const targetId = definition.serverConfig['targetRegionId'] as string;
    const targetLabel = definition.clientConfig['targetLabelKey'] as string;
    expect(regions.some((r) => r.regionId === targetId)).toBe(true);
    expect(regions.find((r) => r.regionId === targetId)?.labelKey).toBe(
      targetLabel,
    );

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
    expect(new Set(targets).size).toBe(
      Math.min(targets.length, regions.length),
    );
    for (const seat of seats.values()) {
      expect(seat.clientOverlay['targetRegionId']).toBeUndefined();
      expect(seat.clientOverlay['targetLabelKey']).toBeTruthy();
      const regionId = seat.serverOverlay['targetRegionId'] as string;
      expect(regions.find((r) => r.regionId === regionId)?.labelKey).toBe(
        seat.clientOverlay['targetLabelKey'],
      );
    }
  });

  it('replaces a leftover target that is not on the chosen map', () => {
    const definition = def(
      'geography.select_on_map',
      {
        targetRegionId: 'mauritania',
        maps: [
          {
            mapId: 'map.levant',
            assetId: 'map.levant',
            imageWidth: 10,
            imageHeight: 10,
            regions: [
              {
                regionId: 'jordan',
                labelKey: 'geo.country.jordan',
                polygon: [
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                  { x: 0, y: 1 },
                ],
              },
            ],
          },
        ],
      },
      {
        categoryKey: 'challenge.category.geography',
        promptKey: 'challenge.map.prompt',
        mapId: 'x',
        assetId: 'x',
        imageWidth: 10,
        imageHeight: 10,
        targetLabelKey: 'geo.country.mauritania',
        regions: [],
      },
    );
    materializePack31Round(definition);
    expect(definition.serverConfig['targetRegionId']).toBe('jordan');
    expect(definition.clientConfig['targetLabelKey']).toBe(
      'geo.country.jordan',
    );
  });

  it('picks only maps that have curated questions', () => {
    const levant = {
      mapId: 'map.levant',
      assetId: 'map.levant',
      imageWidth: 10,
      imageHeight: 10,
      regions: [
        {
          regionId: 'jordan',
          labelKey: 'geo.country.jordan',
          polygon: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
        },
        {
          regionId: 'syria',
          labelKey: 'geo.country.syria',
          polygon: [
            { x: 1, y: 1 },
            { x: 2, y: 1 },
            { x: 1, y: 2 },
          ],
        },
      ],
    };
    const africa = {
      mapId: 'map.africa',
      assetId: 'map.africa',
      imageWidth: 10,
      imageHeight: 10,
      regions: [
        {
          regionId: 'egypt',
          labelKey: 'geo.country.egypt',
          polygon: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
        },
      ],
    };
    for (let i = 0; i < 12; i += 1) {
      const definition = def(
        'geography.select_on_map',
        {
          maps: [africa, levant],
          questions: [
            {
              mapId: 'map.levant',
              targetRegionId: 'jordan',
              targetLabelKey: 'geo.country.jordan',
            },
          ],
          targetRegionId: 'egypt',
        },
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
      expect(definition.serverConfig['mapId']).toBe('map.levant');
      expect(definition.serverConfig['targetRegionId']).toBe('jordan');
      expect(definition.clientConfig['targetLabelKey']).toBe(
        'geo.country.jordan',
      );
    }
  });

  it('assigns seats only from the curated question bank on the chosen map', () => {
    const definition = def(
      'geography.select_on_map',
      {
        mapId: 'map.levant',
        maps: [
          {
            mapId: 'map.levant',
            assetId: 'map.levant',
            imageWidth: 10,
            imageHeight: 10,
            regions: [
              {
                regionId: 'jordan',
                labelKey: 'geo.country.jordan',
                polygon: [
                  { x: 0, y: 0 },
                  { x: 1, y: 0 },
                  { x: 0, y: 1 },
                ],
              },
              {
                regionId: 'syria',
                labelKey: 'geo.country.syria',
                polygon: [
                  { x: 1, y: 1 },
                  { x: 2, y: 1 },
                  { x: 1, y: 2 },
                ],
              },
              {
                regionId: 'lebanon',
                labelKey: 'geo.country.lebanon',
                polygon: [
                  { x: 2, y: 2 },
                  { x: 3, y: 2 },
                  { x: 2, y: 3 },
                ],
              },
            ],
          },
        ],
        questions: [
          {
            mapId: 'map.levant',
            targetRegionId: 'jordan',
            targetLabelKey: 'geo.country.jordan',
          },
          {
            mapId: 'map.levant',
            targetRegionId: 'syria',
            targetLabelKey: 'geo.country.syria',
          },
        ],
        regions: [
          {
            regionId: 'jordan',
            labelKey: 'geo.country.jordan',
          },
          {
            regionId: 'syria',
            labelKey: 'geo.country.syria',
          },
          {
            regionId: 'lebanon',
            labelKey: 'geo.country.lebanon',
          },
        ],
      },
      {
        categoryKey: 'challenge.category.geography',
        promptKey: 'challenge.map.prompt',
        mapId: 'map.levant',
        assetId: 'map.levant',
        imageWidth: 10,
        imageHeight: 10,
        targetLabelKey: 'geo.country.jordan',
        regions: [],
      },
    );
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
      (s) => s.serverOverlay['targetRegionId'] as string,
    );
    expect(targets.every((id) => id === 'jordan' || id === 'syria')).toBe(true);
    expect(targets).not.toContain('lebanon');
    expect(new Set(targets).size).toBe(2);
  });

  it('accepts a curated geography question bank on the engine schema', () => {
    const region = {
      regionId: 'jordan',
      labelKey: 'geo.country.jordan',
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
    };
    const map = {
      mapId: 'map.levant',
      assetId: 'map.levant',
      imageWidth: 10,
      imageHeight: 10,
      regions: [region],
    };
    const client = {
      categoryKey: 'challenge.category.geography',
      promptKey: 'challenge.map.prompt',
      mapId: 'map.levant',
      assetId: 'map.levant',
      imageWidth: 10,
      imageHeight: 10,
      targetLabelKey: 'geo.country.jordan',
      regions: [region],
    };
    expect(
      validateEngineConfigs('geography.select_on_map', client, {
        maps: [map],
      }).engineId,
    ).toBe('geography.select_on_map');
    expect(
      validateEngineConfigs('geography.select_on_map', client, {
        maps: [map],
        questions: [
          {
            mapId: 'map.levant',
            targetRegionId: 'jordan',
            targetLabelKey: 'geo.country.jordan',
          },
        ],
      }).engineId,
    ).toBe('geography.select_on_map');
  });
});
