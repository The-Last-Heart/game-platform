import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fillChallengeDifficultyDefaults } from '@thelastheart/contracts';
import type { ChallengeDefinition } from '../domain/types';
import type { ChallengeDefinitionProvider } from './challenge-definition.provider';

const FIXTURE_FILES = [
  'reaction.wait_for_signal.v1.json',
  'trap.no_touch.v1.json',
  'gesture.reverse_swipe.v1.json',
  'tap.precision.v1.json',
  'memory.sequence.v1.json',
  'hold.multitouch.v1.json',
  'motion.shake.v1.json',
  'motion.tilt_balance.v1.json',
  'audio.cue.v1.json',
  'social.pair_sync.v1.json',
  'tactical.risk_choice.v1.json',
  'trivia.multiple_choice.v1.json',
  'audio.multiple_choice.v1.json',
  'trivia.common_word.v1.json',
  'trivia.symbol_cipher_word.v1.json',
  'logic.three_doors.v1.json',
  'geography.select_on_map.v1.json',
  'focus.odd_one_out.v1.json',
  'focus.vertical_reflection.v1.json',
  'order.sequence_sort.v1.json',
  'precision.maze_path.v1.json',
  'precision.neon_cable.v1.json',
  'gesture.fog_wipe.v1.json',
  'precision.circuit_rotation.v1.json',
  'precision.cable_untangle.v1.json',
  'logic.balance_scale.v1.json',
  'logic.complete_sum.v1.json',
  'focus.stroop.v1.json',
  'search.select_occurrences.v1.json',
  'social.pass_the_pulse.v1.json',
  'laser.routing.v1.json',
] as const;

/** Mixed launch playlist — live engines except paused risk choice / pair-sync (training filters pair). */
const PLAYLIST_DEFINITION_IDS = [
  'reaction.wait_for_signal.dev',
  'trap.no_touch.dev',
  'gesture.reverse_swipe.dev',
  'tap.precision.dev',
  'memory.sequence.dev',
  'hold.multitouch.dev',
  'motion.shake.dev',
  'motion.tilt_balance.dev',
  'audio.cue.dev',
  'social.pair_sync.dev',
  'trivia.multiple_choice.dev',
  'audio.multiple_choice.dev',
  'trivia.common_word.dev',
  'trivia.symbol_cipher_word.dev',
  'logic.three_doors.dev',
  'geography.select_on_map.dev',
  'focus.odd_one_out.dev',
  'focus.vertical_reflection.dev',
  'order.sequence_sort.dev',
  'precision.maze_path.dev',
  'precision.neon_cable.dev',
  'gesture.fog_wipe.dev',
  'precision.circuit_rotation.dev',
  'precision.cable_untangle.dev',
  'logic.balance_scale.dev',
  'logic.complete_sum.dev',
  'focus.stroop.dev',
  'search.select_occurrences.dev',
  'social.pass_the_pulse.dev',
  'laser.routing.dev',
] as const;

/**
 * Loads challenge definitions from JSON fixture files.
 * Development/test only — production uses the pinned catalog release.
 */
export class DevFixtureProvider implements ChallengeDefinitionProvider {
  private readonly definitions = new Map<string, ChallengeDefinition>();
  private readonly playlist: ChallengeDefinition[] = [];

  constructor() {
    for (const file of FIXTURE_FILES) {
      this.loadFixture(file);
    }
    for (const definitionId of PLAYLIST_DEFINITION_IDS) {
      const def = this.definitions.get(definitionId);
      if (!def) {
        throw new Error(`playlist fixture missing: ${definitionId}`);
      }
      this.playlist.push(def);
    }
  }

  getById(id: string): ChallengeDefinition | undefined {
    return this.definitions.get(id);
  }

  getDefaultDev(): ChallengeDefinition {
    const def = this.definitions.get('reaction.wait_for_signal.dev');
    if (!def) {
      throw new Error('default dev fixture not found');
    }
    return def;
  }

  /** Unique playable pool — MatchService orders easy → medium → hard. */
  getPlaylist(): readonly ChallengeDefinition[] {
    return this.playlist;
  }

  private loadFixture(filename: string): void {
    const raw = readFileSync(join(__dirname, 'fixtures', filename), 'utf-8');
    const parsed = JSON.parse(raw) as ChallengeDefinition;
    const difficulty = parsed.difficulty ?? 'medium';
    const filled = fillChallengeDifficultyDefaults({
      engineId: parsed.engineId,
      difficulty,
      durationMs: parsed.durationMs,
      clientConfig: parsed.clientConfig,
      serverConfig: parsed.serverConfig,
    });
    this.definitions.set(parsed.definitionId, {
      ...parsed,
      difficulty,
      durationMs: filled.durationMs,
      clientConfig: filled.clientConfig,
      serverConfig: filled.serverConfig,
    });
  }
}
