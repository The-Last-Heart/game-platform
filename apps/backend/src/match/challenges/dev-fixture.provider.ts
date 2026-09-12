import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChallengeDefinition } from '../domain/types';
import type { ChallengeDefinitionProvider } from './challenge-definition.provider';

const FIXTURE_FILES = [
  'reaction.wait_for_signal.v1.json',
  'trap.no_touch.v1.json',
  'gesture.reverse_swipe.v1.json',
  'tap.precision.v1.json',
  'memory.sequence.v1.json',
  'hold.multitouch.v1.json',
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

  /** Finite six-engine pack — played in order once (no infinite cycle). */
  getPlaylist(): readonly ChallengeDefinition[] {
    return this.playlist;
  }

  private loadFixture(filename: string): void {
    const raw = readFileSync(join(__dirname, 'fixtures', filename), 'utf-8');
    const parsed = JSON.parse(raw) as ChallengeDefinition;
    this.definitions.set(parsed.definitionId, parsed);
    this.playlist.push(parsed);
  }
}
