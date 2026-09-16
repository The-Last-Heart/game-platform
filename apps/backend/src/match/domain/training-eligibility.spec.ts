import {
  filterPlaylistForMode,
  isSoloTrainingEngine,
  MULTI_SEAT_ENGINE_IDS,
} from './training-eligibility';
import type { ChallengeDefinition } from './types';

function def(engineId: string): ChallengeDefinition {
  return {
    definitionId: `${engineId}.dev`,
    definitionVersion: 1,
    engineId,
    durationMs: 5000,
    heartPenaltyOnFailure: 1,
    energyRewardOnSuccess: 1,
    promptKey: 'x',
    clientConfig: {},
    serverConfig: {},
  };
}

describe('training-eligibility', () => {
  it('treats pair sync and complete_sum as multi-seat', () => {
    expect(MULTI_SEAT_ENGINE_IDS.has('social.pair_sync')).toBe(true);
    expect(MULTI_SEAT_ENGINE_IDS.has('logic.complete_sum')).toBe(true);
    expect(isSoloTrainingEngine('social.pair_sync')).toBe(false);
    expect(isSoloTrainingEngine('logic.complete_sum')).toBe(false);
    expect(isSoloTrainingEngine('memory.sequence')).toBe(true);
    expect(isSoloTrainingEngine('hold.multitouch')).toBe(true);
  });

  it('filters multi-seat engines from training playlists but keeps live intact', () => {
    const playlist = [
      def('memory.sequence'),
      def('social.pair_sync'),
      def('logic.complete_sum'),
      def('audio.cue'),
      def('motion.shake'),
    ];
    const training = filterPlaylistForMode(playlist, 'training');
    expect(training.map((d) => d.engineId)).toEqual([
      'memory.sequence',
      'audio.cue',
      'motion.shake',
    ]);
    expect(filterPlaylistForMode(playlist, 'quick_survival')).toHaveLength(5);
  });
});
