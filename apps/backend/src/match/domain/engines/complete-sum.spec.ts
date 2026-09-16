import {
  COMPLETE_SUM_DEFAULT_GENERATION_RULES,
  validateEngineConfigs,
} from '@thelastheart/contracts';
import {
  applyCompleteSumSelection,
  buildSafeFallback,
  CompleteSumConfigError,
  generateCompleteSumRound,
  isTargetReachable,
  resolveGenerationRule,
  toCompleteSumPublicPayload,
} from './complete-sum';

function participantIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `player-${i + 1}`);
}

describe('complete-sum generator', () => {
  const counts = [2, 3, 4, 5, 6] as const;

  it.each(counts)(
    'produces reachable rounds for %i players across 1000 seeds',
    (n) => {
      const ids = participantIds(n);
      const rule = COMPLETE_SUM_DEFAULT_GENERATION_RULES[n];
      for (let seed = 0; seed < 1000; seed += 1) {
        const generated = generateCompleteSumRound({
          participantIds: ids,
          seed,
          maxAttempts: 48,
        });
        expect(Object.keys(generated.optionsByPlayerId)).toHaveLength(n);
        for (const id of ids) {
          const choices = generated.optionsByPlayerId[id]!;
          expect(choices).toHaveLength(rule.choicesPerPlayer);
          expect(new Set(choices).size).toBe(rule.choicesPerPlayer);
          for (const v of choices) {
            expect(v).toBeGreaterThanOrEqual(rule.minValue);
            expect(v).toBeLessThanOrEqual(rule.maxValue);
            // Target as a seat option lets one player force others to need 0.
            expect(v).not.toBe(generated.target);
          }
          const solution = generated.hidden.solutionByPlayerId[id]!;
          expect(choices).toContain(solution);
          expect(solution).not.toBe(generated.target);
        }
        const lists = ids.map((id) => generated.optionsByPlayerId[id]!);
        expect(isTargetReachable(lists, generated.target)).toBe(true);

        const publicPayload = toCompleteSumPublicPayload({
          target: generated.target,
          participantIds: ids,
          optionsByPlayerId: generated.optionsByPlayerId,
          selections: Object.fromEntries(ids.map((id) => [id, null])),
          currentTotal: 0,
          allSelected: false,
          stateSequence: 0,
          incorrectTotal: false,
          hidden: generated.hidden,
        });
        expect(JSON.stringify(publicPayload)).not.toContain('solution');
        expect(
          JSON.stringify(publicPayload).includes(
            Object.values(generated.hidden.solutionByPlayerId).join(','),
          ),
        ).toBe(false);
        // Hidden witness must not appear as a named field on the public payload.
        expect(
          Object.keys(publicPayload as Record<string, unknown>),
        ).not.toContain('hidden');
        expect(
          Object.keys(publicPayload as Record<string, unknown>),
        ).not.toContain('optionsByPlayerId');
      }
    },
  );

  it('rejects invalid generation configuration clearly', () => {
    expect(() =>
      resolveGenerationRule(4, {
        4: { minValue: 0, maxValue: 1, choicesPerPlayer: 4 },
      }),
    ).toThrow(CompleteSumConfigError);

    expect(() =>
      generateCompleteSumRound({
        participantIds: ['a'],
        seed: 1,
      }),
    ).toThrow(CompleteSumConfigError);

    expect(() =>
      generateCompleteSumRound({
        participantIds: participantIds(7),
        seed: 1,
      }),
    ).toThrow(CompleteSumConfigError);
  });

  it('bounded attempts then safe fallback (never unbounded)', () => {
    const ids = participantIds(3);
    const generated = generateCompleteSumRound({
      participantIds: ids,
      seed: 42,
      maxAttempts: 1,
    });
    expect(generated.attempts).toBeLessThanOrEqual(1);
    // Either first try succeeded or fallback after 1 attempt.
    expect(generated.attempts).toBe(1);
    const lists = ids.map((id) => generated.optionsByPlayerId[id]!);
    expect(isTargetReachable(lists, generated.target)).toBe(true);
  });

  it('safe fallback is always reachable and non-trivial when possible', () => {
    const ids = participantIds(6);
    const rule = COMPLETE_SUM_DEFAULT_GENERATION_RULES[6];
    const rng = () => 0.25;
    const fallback = buildSafeFallback(ids, rule, rng);
    const lists = ids.map((id) => fallback.optionsByPlayerId[id]!);
    expect(isTargetReachable(lists, fallback.target)).toBe(true);
    for (const choices of lists) {
      expect(choices).not.toContain(fallback.target);
    }
  });

  it('never offers the target as a selectable option (anti-grief)', () => {
    const ids = participantIds(2);
    for (let seed = 0; seed < 500; seed += 1) {
      const generated = generateCompleteSumRound({
        participantIds: ids,
        seed,
        maxAttempts: 64,
      });
      for (const id of ids) {
        expect(generated.optionsByPlayerId[id]).not.toContain(generated.target);
      }
    }
  });

  it('selection replacement recalculates total; null ≠ zero', () => {
    const ids = participantIds(2);
    const generated = generateCompleteSumRound({
      participantIds: ids,
      seed: 7,
    });
    const state = {
      target: generated.target,
      participantIds: ids,
      optionsByPlayerId: generated.optionsByPlayerId,
      selections: { [ids[0]!]: null, [ids[1]!]: null } as Record<
        string,
        number | null
      >,
      currentTotal: 0,
      allSelected: false,
      stateSequence: 0,
      incorrectTotal: false,
      hidden: generated.hidden,
    };

    const firstChoice = generated.optionsByPlayerId[ids[0]!]![0]!;
    const secondChoice = generated.optionsByPlayerId[ids[0]!]![1]!;
    const otherChoice = generated.optionsByPlayerId[ids[1]!]![0]!;

    const a = applyCompleteSumSelection({
      state,
      playerId: ids[0]!,
      selectedValue: firstChoice,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.state.selections[ids[0]!]).toBe(firstChoice);
    expect(a.state.currentTotal).toBe(firstChoice);
    expect(a.state.allSelected).toBe(false);
    expect(a.succeeded).toBe(false);

    const b = applyCompleteSumSelection({
      state: a.state,
      playerId: ids[0]!,
      selectedValue: secondChoice,
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.state.currentTotal).toBe(secondChoice);

    const zeroOk = generated.optionsByPlayerId[ids[0]!]?.includes(0);
    if (zeroOk) {
      const z = applyCompleteSumSelection({
        state: b.state,
        playerId: ids[0]!,
        selectedValue: 0,
      });
      expect(z.ok).toBe(true);
      if (z.ok) {
        expect(z.state.selections[ids[0]!]).toBe(0);
        expect(z.state.selections[ids[0]!] === null).toBe(false);
      }
    }

    const bad = applyCompleteSumSelection({
      state: b.state,
      playerId: ids[0]!,
      selectedValue: 999,
    });
    expect(bad.ok).toBe(false);

    const c = applyCompleteSumSelection({
      state: b.state,
      playerId: ids[1]!,
      selectedValue: otherChoice,
    });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.state.allSelected).toBe(true);
    expect(c.state.currentTotal).toBe(secondChoice + otherChoice);
    expect(c.succeeded).toBe(c.state.currentTotal === c.state.target);
  });

  it('definition configs validate via contracts', () => {
    const result = validateEngineConfigs(
      'logic.complete_sum',
      {
        categoryKey: 'challenge.category.logic',
        titleKey: 'challenge.complete_sum.intro',
        promptKey: 'challenge.complete_sum.prompt',
        currentTotalKey: 'challenge.complete_sum.current_total',
        chooseNumberKey: 'challenge.complete_sum.choose',
        readyKey: 'challenge.complete_sum.ready',
        thinkingKey: 'challenge.complete_sum.thinking',
        youKey: 'challenge.complete_sum.you',
      },
      {
        maxGenerationAttempts: 48,
        generationRules: COMPLETE_SUM_DEFAULT_GENERATION_RULES,
      },
    );
    expect(result.engineId).toBe('logic.complete_sum');
  });
});
