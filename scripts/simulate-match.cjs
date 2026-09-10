#!/usr/bin/env node
/**
 * @deprecated Prefer `pnpm run simulate:playable`.
 * LH-003 replaced the six-human deterministic_choice simulation with the
 * human + five-bots wait_for_signal playable slice.
 */
require('./simulate-playable-slice.cjs');
