import {
  shouldOfferStrikeWindow,
  STRIKE_EARLIEST_ROUND,
  STRIKE_OFFER_COOLDOWN_ROUNDS,
} from './strike-offer';

describe('shouldOfferStrikeWindow', () => {
  it('never offers before the earliest round', () => {
    for (let round = 0; round < STRIKE_EARLIEST_ROUND; round += 1) {
      expect(
        shouldOfferStrikeWindow({
          matchId: 'match-early',
          roundNumber: round,
        }),
      ).toBe(false);
    }
  });

  it('respects cooldown after an actual offer', () => {
    expect(
      shouldOfferStrikeWindow({
        matchId: 'match-cool',
        roundNumber: 8,
        lastOfferedRound: 7,
      }),
    ).toBe(false);
    expect(
      shouldOfferStrikeWindow({
        matchId: 'match-cool',
        roundNumber: 7 + STRIKE_OFFER_COOLDOWN_ROUNDS - 1,
        lastOfferedRound: 7,
      }),
    ).toBe(false);
  });

  it('does not offer after every eligible round', () => {
    let offers = 0;
    let lastOffered = 0;
    for (let round = 2; round <= 40; round += 1) {
      if (
        shouldOfferStrikeWindow({
          matchId: 'match-sparse',
          roundNumber: round,
          lastOfferedRound: lastOffered,
        })
      ) {
        offers += 1;
        lastOffered = round;
      }
    }
    expect(offers).toBeGreaterThanOrEqual(1);
    expect(offers).toBeLessThan(12);
  });

  it('is deterministic for the same match and round', () => {
    const a = shouldOfferStrikeWindow({
      matchId: 'stable',
      roundNumber: 9,
      lastOfferedRound: 0,
    });
    const b = shouldOfferStrikeWindow({
      matchId: 'stable',
      roundNumber: 9,
      lastOfferedRound: 0,
    });
    expect(a).toBe(b);
  });
});
