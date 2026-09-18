import { createHash } from 'node:crypto';

/** Chance to open a strike window on an eligible between-round. */
export const STRIKE_OFFER_CHANCE = 0.22;

/** Minimum rounds between strike windows (inclusive of the offered round). */
export const STRIKE_OFFER_COOLDOWN_ROUNDS = 3;

/** Do not offer a strike before this many challenges have been introduced. */
export const STRIKE_EARLIEST_ROUND = 2;

/**
 * Random, spaced Danger Pulse windows. Only call when at least one seated
 * player has a full meter and an unused pulse charge.
 */
export function shouldOfferStrikeWindow(options: {
  matchId: string;
  roundNumber: number;
  lastOfferedRound?: number;
}): boolean {
  const { matchId, roundNumber, lastOfferedRound = 0 } = options;
  if (roundNumber < STRIKE_EARLIEST_ROUND) {
    return false;
  }
  if (
    lastOfferedRound > 0 &&
    roundNumber - lastOfferedRound < STRIKE_OFFER_COOLDOWN_ROUNDS
  ) {
    return false;
  }
  return rollStrike(matchId, roundNumber) < STRIKE_OFFER_CHANCE;
}

function rollStrike(matchId: string, roundNumber: number): number {
  const digest = createHash('sha256')
    .update(`${matchId}:strike:${roundNumber}`)
    .digest();
  return digest.readUInt32BE(0) / 4294967296;
}
