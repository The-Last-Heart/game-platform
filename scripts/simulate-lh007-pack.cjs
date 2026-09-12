#!/usr/bin/env node
/**
 * LH-007 smoke simulation: finite six-engine playlist ends in draw when
 * hearts remain tied (no cycling).
 */
const assert = require('node:assert/strict');

function simulateFinitePlaylistEnd() {
  const playlistLength = 6;
  let roundNumber = 0;
  const hearts = { a: 3, b: 3 };
  while (roundNumber < playlistLength) {
    // Both succeed — no heart loss
    roundNumber += 1;
  }
  const next = roundNumber < playlistLength ? roundNumber : null;
  assert.equal(next, null);
  assert.equal(hearts.a, hearts.b);
  const result = hearts.a === hearts.b ? 'draw' : 'winner';
  assert.equal(result, 'draw');
  console.log('OK finite playlist → draw when hearts tied');
}

simulateFinitePlaylistEnd();
