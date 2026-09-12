# LH-005 delivery evidence

**Status:** CLOSED  
**Commit message:** `fix(lh-005): close player entry and match access on real path`  
**Verify:** `git log -1 --format=%H` on `main` after this commit; `git status` empty.

## Why a follow-up close commit

`43f4b06` shipped LH-005 product surfaces and suite coverage, but device/LAN verification exposed blockers:

- Mobile envelope allowlist rejected live LH-005 snapshot/player fields → Training never bound.
- Fresh-join disconnect raced and wiped the join handshake.
- Training capacity-1 crowned sole survivor even after failure → false victory.
- Winner UI showed truncated `playerId` instead of `displayName`.
- Admin bot-fill had API only; System UI toggle was missing.

This commit closes those gaps and the milestone gate.

## Observed checks (this close)

| Check | Result |
| --- | --- |
| `match.engine.spec.ts` | pass (incl. training failure ≠ winner, training success = winner) |
| `matchmaking.service.spec.ts` | pass |
| `match.service.spec.ts` | pass |
| `match.gateway.integration.spec.ts` | pass (private+leave, queue cancel, training+rematch) |
| Flutter `session_controller_test` + `ui_views_test` + `training_snapshot_validation_test` + `contract_parity_test` | pass (116) |
| `simulate:playable` (SIM_PORT=3015) | 9/9 ok |
| Live Nest `:3000` Training probe | fail path: `winnerId=null`, hearts=2, not completed; success path: `match.finished`, `displayName=وجدي` |
| Admin bot-fill policy integration | pass (`live_ops` R/W) |
| Admin `idempotent logout` integration | **pre-existing fail** (403 without session) — reproduces with LH-005 admin UI changes stashed; not introduced here; tracked outside LH-005 close |

## Journeys covered

- Entry: splash → onboarding → identity → home (Quick Survival / Private / Training only)
- Training enter + wait-for-signal; failure does not trophy; success completes with display name
- Queue enqueue/cancel; matchmaking seat broadcast; admin bot-fill System panel
- Private create/join/leave (gateway suite)
- Snapshot allowlist parity with contracts (`mode`, identity, lobby fields)
- LAN APK bake script + clear Arabic connection errors

## Required evidence notes

- Reference pack screens for modes 01–07 / 29–30 are in `docs/ui-reference/screens/` (including newly added 01, 02, 04, 05).
- Live protocol evidence: Nest Training fail/success probe commands/results above.
- Six-seat public/private flows remain covered by backend/gateway suites + prior LH-005 simulate path; bot-fill is admin-toggleable for observed public fill.

## Explicitly out of scope (unchanged)

Challenge Studio, full powers, multi-engine pack (LH-007+), full Live Ops depth, store/IAP/chat, consumer auth — per RELEASE-BOUNDARY.

## Completion

Do not begin LH-006 until this file’s commit is on HEAD and `git status` is clean. See [DELIVERY-STATUS.md](./DELIVERY-STATUS.md).
