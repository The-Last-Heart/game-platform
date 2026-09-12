# RC1 delivery status

Updated: 2026-09-12

## Last closed milestone

**LH-005 — Complete Player Entry and Match Access**

Previously closed baseline: **LH-001 → LH-004A**.

## Current milestone

**LH-006** is the first incomplete milestone (versioned content releases). Tree is clean after the LH-005 live-path follow-up.

## LH-005 close summary

- Close commit: `9d3cfdeca422076cff49b2d6b7993da7270bacd4` — `fix(lh-005): close player entry and match access on real path`
- Cleanup commit: `4fbb3dd6d47e3d0c558e1223bafadc09d78f3085` — docs/reference pack + closure-gate wording
- Live-path follow-up: `278d8566ee6bc060a3b7efdaa44042f7b08b58e1` — `fix(match): harden live lobby, host start, and finite playlist`
- Evidence: [LH-005-DELIVERY.md](./LH-005-DELIVERY.md)
- Known unrelated: admin integration `idempotent logout` CSRF-without-session expects 200, gets 403 (pre-existing outside this milestone)

## Closure rule (product owner lock)

After every milestone: acceptance on the real path, verification bugs fixed, required evidence, focused commit, **clean tree** — then advance.
