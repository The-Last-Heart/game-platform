import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChallengeEvaluatorRegistryImpl } from '../dev-challenge.evaluator';
import { WaitForSignalEvaluator } from '../wait-for-signal.evaluator';
import { createLaunchEvaluators } from './launch-evaluators';
import { createAdvancedEvaluators } from './advanced-evaluators';
import { createPack31Evaluators } from './pack-31-evaluators';
import { MatchEngine, toPublicChallengeView } from '../match.engine';
import { FakeClock, type ChallengeDefinition } from '../types';

const definition = JSON.parse(
  readFileSync(
    join(__dirname, '../../challenges/fixtures/audio.multiple_choice.v1.json'),
    'utf8',
  ),
) as ChallengeDefinition;

describe('audio.multiple_choice match behavior', () => {
  function engine(clock: FakeClock) {
    const registry = new ChallengeEvaluatorRegistryImpl();
    registry.register(new WaitForSignalEvaluator());
    for (const e of createLaunchEvaluators()) registry.register(e);
    for (const e of createAdvancedEvaluators()) registry.register(e);
    for (const e of createPack31Evaluators()) registry.register(e);
    return new MatchEngine(clock, registry);
  }

  function fill(eng: MatchEngine, n: number) {
    let match = eng.createMatch('m-audio', {
      mode: 'quick_survival',
      playerCapacity: 6,
    });
    for (let i = 0; i < n; i += 1) {
      match = eng.joinPlayer(match, {
        playerId: `p${i}`,
        resumeTokenHash: `h${i}`,
      }).match;
      match = eng.acceptJoin(match, `p${i}`).match;
    }
    return match;
  }

  it.each([2, 3, 4, 5, 6])(
    'scores %i players independently without leaking private answers',
    (n) => {
      const clock = new FakeClock(1_000_000);
      const eng = engine(clock);
      let match = fill(eng, n);
      match = eng.startChallenge(match, definition).match;
      const challenge = match.currentChallenge!;
      const seat0 = challenge.seatVariants?.get('p0');
      const optionKeys = (seat0?.clientOverlay['optionKeys'] ??
        challenge.definition.clientConfig['optionKeys']) as string[];
      const correct = (seat0?.serverOverlay['correctOptionKey'] ??
        challenge.definition.serverConfig['correctOptionKey']) as string;
      const wrong = optionKeys.find((k) => k !== correct)!;

      match = eng.submitAnswer(match, {
        playerId: 'p0',
        challengeInstanceId: challenge.challengeInstanceId,
        commandId: 'cmd-p0',
        answer: { chosenOptionKey: correct },
      }).match;

      const afterFirst = match.currentChallenge;
      if (afterFirst) {
        match = eng.submitAnswer(match, {
          playerId: 'p1',
          challengeInstanceId: afterFirst.challengeInstanceId,
          commandId: 'cmd-p1',
          answer: { chosenOptionKey: wrong },
        }).match;
      }

      const view0 = toPublicChallengeView(
        match.currentChallenge ?? challenge,
        clock.nowMs(),
        'p0',
      );
      const view1 = toPublicChallengeView(
        match.currentChallenge ?? challenge,
        clock.nowMs(),
        'p1',
      );
      expect(JSON.stringify(view0)).not.toMatch(/correctOption/);
      expect(JSON.stringify(view1)).not.toMatch(/p0/);
      expect(JSON.stringify(view0.clientConfig)).not.toMatch(
        /amr|secret|filename/i,
      );

      if (n === 2) {
        const resolutions = match.currentChallenge?.resolutions ?? [];
        const p0 = resolutions.find((r) => r.playerId === 'p0');
        const p1 = resolutions.find((r) => r.playerId === 'p1');
        expect(p0?.outcome).toBe('success');
        expect(p1?.outcome).toBe('failure');
      }
    },
  );

  it('rejects a duplicate command as idempotent and ignores a second distinct answer', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 3);
    match = eng.startChallenge(match, definition).match;
    const cid = match.currentChallenge!.challengeInstanceId;
    const optionKeys = (match.currentChallenge!.seatVariants?.get('p0')
      ?.clientOverlay['optionKeys'] ??
      match.currentChallenge!.definition.clientConfig['optionKeys']) as string[];
    const first = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: cid,
      commandId: 'same-cmd',
      answer: { chosenOptionKey: optionKeys[0] },
    });
    const dup = eng.submitAnswer(first.match, {
      playerId: 'p0',
      challengeInstanceId: cid,
      commandId: 'same-cmd',
      answer: { chosenOptionKey: optionKeys[0] },
    });
    expect(dup.duplicate).toBe(true);
    expect(dup.ack.accepted).toBe(true);
    const second = eng.submitAnswer(dup.match, {
      playerId: 'p0',
      challengeInstanceId: cid,
      commandId: 'other-cmd',
      answer: { chosenOptionKey: optionKeys[1] },
    });
    expect(second.ack.accepted).toBe(true);
    expect(second.ack.reason).toBe('already_submitted');
  });

  it('rejects answers after the deadline', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const cid = match.currentChallenge!.challengeInstanceId;
    const optionKeys = (match.currentChallenge!.seatVariants?.get('p0')
      ?.clientOverlay['optionKeys'] ??
      match.currentChallenge!.definition.clientConfig['optionKeys']) as string[];
    clock.advance(definition.durationMs + 1);
    const late = eng.submitAnswer(match, {
      playerId: 'p0',
      challengeInstanceId: cid,
      commandId: 'late',
      answer: { chosenOptionKey: optionKeys[0] },
    });
    expect(late.ack.accepted).toBe(false);
  });

  it('restores the same challenge and option order on a cloned reconnect view', () => {
    const clock = new FakeClock(1_000_000);
    const eng = engine(clock);
    let match = fill(eng, 2);
    match = eng.startChallenge(match, definition).match;
    const before = [
      ...((match.currentChallenge!.seatVariants?.get('p0')?.clientOverlay[
        'optionKeys'
      ] ??
        match.currentChallenge!.definition.clientConfig[
          'optionKeys'
        ]) as string[]),
    ];
    const view = toPublicChallengeView(
      match.currentChallenge!,
      clock.nowMs() + 400,
      'p0',
    );
    expect(view.clientConfig['optionKeys']).toEqual(before);
    expect(view.clientConfig['playAtMs']).toBe(
      match.currentChallenge!.startsAtMs,
    );
    expect(view.challengeInstanceId).toBe(
      match.currentChallenge!.challengeInstanceId,
    );
  });
});
