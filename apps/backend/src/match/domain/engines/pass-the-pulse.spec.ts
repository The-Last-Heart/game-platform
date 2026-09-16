import {
  PASS_THE_PULSE_DEFAULT_TIMING,
  validateEngineConfigs,
} from '@thelastheart/contracts';
import {
  applyPassThePulseTap,
  buildInitialPassThePulseState,
  computePassThePulseDurationMs,
  fitPassThePulseTimingToDuration,
  generatePassThePulseRoute,
  resolveDuePassThePulseMisses,
  resolvePassThePulseTiming,
  SOCIAL_PASS_THE_PULSE_ENGINE_ID,
} from './pass-the-pulse';

describe('social.pass_the_pulse generation', () => {
  it.each([2, 3, 4, 5, 6])(
    'builds a unique route for %i players',
    (n) => {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const route = generatePassThePulseRoute(ids, 42);
      expect(route).toHaveLength(n);
      expect(new Set(route).size).toBe(n);
      for (const id of ids) {
        expect(route).toContain(id);
      }
    },
  );

  it('is deterministic for a fixed seed', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(generatePassThePulseRoute(ids, 99)).toEqual(
      generatePassThePulseRoute(ids, 99),
    );
    expect(generatePassThePulseRoute(ids, 1)).not.toEqual(
      generatePassThePulseRoute(ids, 2),
    );
  });

  it('rejects fewer than 2 or more than 6', () => {
    expect(() => generatePassThePulseRoute(['a'], 1)).toThrow();
    expect(() =>
      generatePassThePulseRoute(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 1),
    ).toThrow();
  });

  it('builds timing windows that fit before the deadline', () => {
    const timing = resolvePassThePulseTiming({});
    const ids = ['p0', 'p1', 'p2', 'p3'];
    const duration = computePassThePulseDurationMs(ids.length, timing);
    const state = buildInitialPassThePulseState({
      participantIds: ids,
      displayNamesByPlayerId: {
        p0: 'وجدي',
        p1: 'أحمد',
        p2: 'Hajar',
        p3: 'محمد علي',
      },
      routePlayerIds: ids,
      pulseStartAtMs: 1_000_000,
      pulseStartMonoMs: 5000,
      timing,
    });
    expect(state.participants.every((p) => p.displayName.length > 0)).toBe(
      true,
    );
    for (const leg of state.legs) {
      expect(leg.windowClosesAtMs).toBeLessThanOrEqual(
        state.pulseStartAtMs + duration,
      );
      expect(leg.windowOpensAtMs).toBeLessThanOrEqual(leg.expectedArrivalAtMs);
      expect(leg.windowClosesAtMs).toBeGreaterThanOrEqual(
        leg.expectedArrivalAtMs,
      );
    }
  });

  it('compresses segments when Studio duration is shorter than natural timeline', () => {
    const timing = resolvePassThePulseTiming({
      startDelayMs: 800,
      segmentDurationMs: 1800,
      hitWindowEarlyMs: 280,
      hitWindowLateMs: 320,
      resultTransitionMs: 900,
    });
    const fitted = fitPassThePulseTimingToDuration(6, timing, 10_000);
    expect(fitted.segmentDurationMs).toBeLessThan(timing.segmentDurationMs);
    expect(computePassThePulseDurationMs(6, fitted)).toBeLessThanOrEqual(10_000);
  });

  it('keeps configured segments when Studio duration has headroom', () => {
    const timing = resolvePassThePulseTiming({
      segmentDurationMs: 1800,
    });
    const fitted = fitPassThePulseTimingToDuration(2, timing, 15_000);
    expect(fitted.segmentDurationMs).toBe(1800);
  });

  it('validates studio configs against contracts', () => {
    const result = validateEngineConfigs(
      SOCIAL_PASS_THE_PULSE_ENGINE_ID,
      {
        categoryKey: 'challenge.category.social',
        titleKey: 'challenge.pass_the_pulse.intro',
        promptKey: 'challenge.pass_the_pulse.prompt',
        actionKey: 'challenge.pass_the_pulse.action',
        youKey: 'challenge.pass_the_pulse.you',
        timeRemainingKey: 'challenge.pass_the_pulse.time_remaining',
      },
      { ...PASS_THE_PULSE_DEFAULT_TIMING },
    );
    expect(result.engineId).toBe(SOCIAL_PASS_THE_PULSE_ENGINE_ID);
  });
});

describe('social.pass_the_pulse tap validation', () => {
  function stateAt(monoOffset: number) {
    const timing = {
      startDelayMs: 1000,
      segmentDurationMs: 2000,
      hitWindowEarlyMs: 200,
      hitWindowLateMs: 300,
      resultTransitionMs: 500,
    };
    return buildInitialPassThePulseState({
      participantIds: ['p0', 'p1'],
      displayNamesByPlayerId: { p0: 'A', p1: 'B' },
      routePlayerIds: ['p0', 'p1'],
      pulseStartAtMs: 0,
      pulseStartMonoMs: 0,
      timing,
    });
  }

  // leg0: travel 1000→3000, window 2800→3300
  // leg1: travel 3000→5000, window 4800→5300

  it('accepts a correct tap inside the inclusive window', () => {
    const base = stateAt(0);
    const hit = applyPassThePulseTap({
      state: base,
      playerId: 'p0',
      legId: 'leg-0',
      nowMonoMs: 2800,
    });
    expect(hit.ok).toBe(true);
    if (!hit.ok) return;
    expect(hit.outcome).toBe('hit');
    expect(hit.state.results.p0).toBe('hit');
    expect(hit.state.currentTargetPlayerId).toBe('p1');
  });

  it('accepts taps at exact window boundaries', () => {
    const open = applyPassThePulseTap({
      state: stateAt(0),
      playerId: 'p0',
      legId: 'leg-0',
      nowMonoMs: 2800,
    });
    expect(open.ok && open.outcome).toBe('hit');

    const close = applyPassThePulseTap({
      state: stateAt(0),
      playerId: 'p0',
      legId: 'leg-0',
      nowMonoMs: 3300,
    });
    expect(close.ok && close.outcome).toBe('hit');
  });

  it('marks early taps as missed and continues the pulse', () => {
    const early = applyPassThePulseTap({
      state: stateAt(0),
      playerId: 'p0',
      legId: 'leg-0',
      nowMonoMs: 2000,
    });
    expect(early.ok).toBe(true);
    if (!early.ok) return;
    expect(early.outcome).toBe('missed');
    expect(early.state.results.p0).toBe('missed');
    expect(early.state.currentTargetPlayerId).toBe('p1');
    expect(early.state.results.p1).toBe('waiting');
  });

  it('rejects late taps after the window closed', () => {
    const late = applyPassThePulseTap({
      state: stateAt(0),
      playerId: 'p0',
      legId: 'leg-0',
      nowMonoMs: 3301,
    });
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.reason).toBe('late');
  });

  it('rejects taps from a non-target player', () => {
    const other = applyPassThePulseTap({
      state: stateAt(0),
      playerId: 'p1',
      legId: 'leg-0',
      nowMonoMs: 2900,
    });
    expect(other.ok).toBe(false);
    if (other.ok) return;
    expect(other.reason).toBe('not_your_turn');
  });

  it('rejects stale leg ids', () => {
    const stale = applyPassThePulseTap({
      state: stateAt(0),
      playerId: 'p0',
      legId: 'leg-9',
      nowMonoMs: 2900,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.reason).toBe('stale_leg');
  });

  it('rejects a second tap after resolution', () => {
    const first = applyPassThePulseTap({
      state: stateAt(0),
      playerId: 'p0',
      legId: 'leg-0',
      nowMonoMs: 2900,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyPassThePulseTap({
      state: first.state,
      playerId: 'p0',
      legId: 'leg-0',
      nowMonoMs: 2950,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('not_your_turn');
  });

  it('auto-misses when the window closes without a tap', () => {
    const missed = resolveDuePassThePulseMisses({
      state: stateAt(0),
      nowMonoMs: 3301,
    });
    expect(missed.changed).toBe(true);
    expect(missed.state.results.p0).toBe('missed');
    expect(missed.state.currentTargetPlayerId).toBe('p1');
  });

  it('completes after every participant is resolved', () => {
    let s = stateAt(0);
    const a = applyPassThePulseTap({
      state: s,
      playerId: 'p0',
      legId: 'leg-0',
      nowMonoMs: 2900,
    });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    s = a.state;
    const b = applyPassThePulseTap({
      state: s,
      playerId: 'p1',
      legId: 'leg-1',
      nowMonoMs: 5000,
    });
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.state.results.p0).toBe('hit');
    expect(b.state.results.p1).toBe('hit');
    expect(b.state.challengeStatus).toBe('completed');
    expect(b.state.completeResolveAtMonoMs).toBe(5000 + 500);
  });
});
