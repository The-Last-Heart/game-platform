import { toPublicChallengeView } from '../match.engine';
import type { ChallengeRound } from '../types';
import { materializePack31Round } from './pack-31-evaluators';

describe('audio.multiple_choice public payload', () => {
  it('never leaks the correct answer, filenames, or identifying metadata', () => {
    const definition = {
      definitionId: 'audio.multiple_choice.test',
      definitionVersion: 1,
      engineId: 'audio.multiple_choice',
      durationMs: 8000,
      heartPenaltyOnFailure: 1 as const,
      energyRewardOnSuccess: 1,
      promptKey: 'challenge.audio_mc.intro',
      choiceKeys: [],
      clientConfig: {
        categoryKey: 'challenge.category.audio',
        promptKey: 'challenge.audio_mc.prompt_artist',
        questionKey: 'q1',
        optionKeys: ['a', 'b', 'c', 'd'],
        originalFilename: 'amr_diab.mp3',
        artist: 'Amr',
        title: 'Nour El Ein',
        correctOptionKey: 'b',
      },
      serverConfig: {
        questions: [
          {
            questionKey: 'q1',
            optionKeys: ['a', 'b', 'c', 'd'],
            correctOptionKey: 'b',
            answerTarget: 'artist',
            audioAssetId: 'ca_44384e12ad9a80f1',
            visualizationAssetId: 'cv_44384e12ad9a80f1',
            audioDurationMs: 2000,
            questionCopy: { ar: 'من صاحب هذا الصوت؟' },
            optionCopy: {
              a: { ar: 'رامي' },
              b: { ar: 'نور' },
              c: { ar: 'ليان' },
              d: { ar: 'سليم' },
            },
          },
        ],
      },
    };
    materializePack31Round(definition);
    const round: ChallengeRound = {
      challengeInstanceId: 'ch-1',
      engineId: 'audio.multiple_choice',
      definitionId: definition.definitionId,
      definitionVersion: 1,
      definition,
      participatingPlayerIds: ['p1', 'p2'],
      startsAtMs: 1_000,
      deadlineAtMs: 9_000,
      deadlineMonoMs: 9_000,
      status: 'active',
      roundPhase: 'answer',
      signalToken: null,
      signaledAtMs: null,
      signalAtMonoMs: null,
      signalEndsAtMs: null,
      signalEndsAtMonoMs: null,
      submissions: new Map(),
      resolutions: [],
    };
    const view = toPublicChallengeView(round, 1_200, 'p1');
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/correctOption/);
    expect(serialized).not.toMatch(/isCorrect/);
    expect(serialized).not.toMatch(/amr_diab/i);
    expect(serialized).not.toMatch(/Nour El Ein/);
    expect(serialized).not.toMatch(/originalFilename/);
    expect(view.clientConfig['audioAssetId']).toBe('ca_44384e12ad9a80f1');
    expect(view.clientConfig['playAtMs']).toBe(1_000);
    expect(view.clientConfig['answerTarget']).toBe('artist');
    expect(view.clientConfig['targetBadgeKey']).toBe(
      'challenge.audio_mc.badge_artist',
    );
    expect(view.clientConfig['audioDurationMs']).toBe(2000);
  });
});
