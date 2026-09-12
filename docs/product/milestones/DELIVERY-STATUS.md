# RC1 delivery status

Updated: 2026-09-12

## Last closed milestone

**LH-006 — Versioned Game Content and Release Platform**

Previously closed: **LH-001 → LH-005**.

## Current milestone

**LH-007** is the first incomplete milestone (next challenge engines / content expansion per roadmap). Tree must be clean on the LH-006 close commit before starting it.

## LH-006 close summary

- Close commit: c1fd844079d13a75a766f9910504db403b9e7dfb — `feat(content): add versioned game content releases`
- Evidence: [LH-006-DELIVERY.md](./LH-006-DELIVERY.md)
- Migrations: `003_versioned_game_content` applied once; second run skips
- Known unrelated: admin-web `proxy.test` https secure-cookie expectation (pre-existing)

## LH-005 close summary (prior)

- Close commit: `9d3cfdeca422076cff49b2d6b7993da7270bacd4`
- Live-path follow-up: `278d8566ee6bc060a3b7efdaa44042f7b08b58e1`
- Evidence: [LH-005-DELIVERY.md](./LH-005-DELIVERY.md)

## Closure rule (product owner lock)

After every milestone: acceptance on the real path, verification bugs fixed, required evidence, focused commit, **clean tree** — then advance.
