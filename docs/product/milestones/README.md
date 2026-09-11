# Milestone roadmap — The Last Heart (آخر قلب)

Authoritative index of product/engineering milestones.
Individual milestone specs live in this directory and are the documents to cite when opening implementation work.

## Binding references

- [`../PRODUCT_BASELINE.md`](../PRODUCT_BASELINE.md)
- [`../../PROJECT_RULES.md`](../../PROJECT_RULES.md)
- UI pack: `Last-Heart-Cursor-Reference-Pack.zip` (`README-CURSOR.md`, `design-tokens.json`, screens 01–30)
- [`../ui-reference/README.md`](../ui-reference/README.md)

## Discipline

- Implement **only** the active milestone.
- Do not invent mechanics, redesign reference UI, or pull in pack “later” features.
- Escalate missing product decisions; do not silently decide them.
- Each milestone must remain independently reviewable (contracts, tests, docs, demo path).

## Status legend

| Status | Meaning |
| --- | --- |
| `done` | Delivered in repo |
| `next` | Recommended as the next implementation target |
| `planned` | Specified; not started |
| `deferred` | Explicitly after the base product |

## Roadmap

| ID | Title | Status | Spec |
| --- | --- | --- | --- |
| LH-001 | Monorepo & platform foundation | `done` | [LH-001.md](./LH-001.md) |
| LH-002 | Authoritative realtime match core | `done` | [LH-002.md](./LH-002.md) |
| LH-003 | Playable mobile match slice | `done` | [LH-003.md](./LH-003.md) |
| LH-004A | Admin authentication & operations foundation | `done` | [LH-004A.md](./LH-004A.md) |
| LH-005 | Pre-match shell (splash → home → modes → queue) | `next` | [LH-005.md](./LH-005.md) |
| LH-006 | Challenge Studio foundation (data-driven challenges) | `planned` | [LH-006.md](./LH-006.md) |
| LH-007 | Mobile translation publishing | `planned` | [LH-007.md](./LH-007.md) |
| LH-008 | Challenge engines wave A | `planned` | [LH-008.md](./LH-008.md) |
| LH-009 | Challenge engines wave B | `planned` | [LH-009.md](./LH-009.md) |
| LH-010 | Energy & powers loop | `planned` | [LH-010.md](./LH-010.md) |
| LH-011 | Matchmaking & private-room productization | `planned` | [LH-011.md](./LH-011.md) |
| LH-012 | Admin live ops & game configuration | `planned` | [LH-012.md](./LH-012.md) |
| LH-013 | Visual polish & accessibility pass | `planned` | [LH-013.md](./LH-013.md) |
| LH-1xx | Post-base features | `deferred` | [LH-DEFERRED.md](./LH-DEFERRED.md) |

## Dependency order

```text
LH-001 → LH-002 → LH-003 → LH-004A
                              ↓
                           LH-005
                              ↓
                           LH-006 → LH-007
                              ↓
                     LH-008 → LH-009
                              ↓
                           LH-010
                              ↓
                           LH-011
                              ↓
                           LH-012
                              ↓
                           LH-013
                              ↓
                         LH-DEFERRED
```

LH-005 may start before LH-006 only if it does **not** add new challenge types.
LH-006 should land before LH-008/LH-009 so new engines remain server-driven.

## Reference-pack screen ownership

| Screens | Milestone |
| --- | --- |
| 01–05 | LH-005 |
| 03, 06–10, 22–23, 29–30 | LH-003 (baseline playable) |
| 11–15 | LH-008 |
| 16–21 | LH-009 |
| 24–28 | LH-010 |
| Admin Challenge Studio / translations / live ops | LH-006, LH-007, LH-012 |

## Definition of done (every milestone)

1. Scope limited to the milestone spec’s In-scope section.
2. Shared contracts updated; clients consume contracts (no divergent hand-written API types).
3. Reference layout/tokens respected for owned screens.
4. Automated tests green; playable/regression simulations green when gameplay is touched.
5. Open questions recorded in the milestone file; no silent product invention.
