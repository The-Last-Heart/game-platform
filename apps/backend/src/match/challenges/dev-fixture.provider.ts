import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChallengeDefinition } from '../domain/types';
import type { ChallengeDefinitionProvider } from './challenge-definition.provider';

/**
 * Loads challenge definitions from JSON fixture files.
 * Development/test only — production would use a catalog service.
 */
export class DevFixtureProvider implements ChallengeDefinitionProvider {
  private readonly definitions = new Map<string, ChallengeDefinition>();

  constructor() {
    this.loadFixture('reaction.wait_for_signal.v1.json');
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

  /**
   * Live playlist for the current content pin. With a single wait-for-signal
   * definition the match service cycles this list until last-heart victory.
   */
  getPlaylist(): readonly ChallengeDefinition[] {
    return [this.getDefaultDev()];
  }

  private loadFixture(filename: string): void {
    const raw = readFileSync(join(__dirname, 'fixtures', filename), 'utf-8');
    const parsed = JSON.parse(raw) as ChallengeDefinition;
    // signalDelayMs / signalWindowMs are provisional development config —
    // will be replaced by a per-difficulty configuration system later.
    this.definitions.set(parsed.definitionId, parsed);
  }
}
