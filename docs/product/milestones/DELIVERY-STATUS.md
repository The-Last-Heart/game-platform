# RC1 delivery status

Updated: 2026-09-12

## Last closed milestone

**LH-005 — Complete Player Entry and Match Access**

Previously closed baseline: **LH-001 → LH-004A**.

## Current milestone

**LH-006** is next. Do not start until `git status` is clean after the LH-005 close commit.

## LH-005 close summary

- Follow-up close commit after `43f4b06` fixed real-path blockers (snapshot allowlist, join socket race, training false-win, winner displayName, admin bot-fill UI, LAN entry hardening).
- Evidence: [LH-005-DELIVERY.md](./LH-005-DELIVERY.md).
- Known unrelated: admin integration `idempotent logout` CSRF-without-session expects 200, gets 403 (pre-existing outside this milestone).

## Closure rule (product owner lock)

After every milestone: acceptance on the real path, verification bugs fixed, required evidence, focused commit, **clean tree** — then advance.
