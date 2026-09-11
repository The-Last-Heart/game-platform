# LH-005 delivery evidence

**Commit message:** `feat(mobile): complete player entry and match access`  
**Verify hash:** `git log -1 --format=%H` on `main` (clean tree; ahead of origin; not pushed)

## Observed checks (this session)

| Check | Result |
| --- | --- |
| `packages/contracts` `npm run build` | pass |
| `matchmaking.service.spec.ts` | 3/3 pass |
| `match.service.spec.ts` | 14/14 pass (leave, private, training, rematch, bot-fill, cancel) |
| `match.gateway.integration.spec.ts` LH-005 cases | 3/3 pass (private+leave, queue cancel, training+rematch) |
| `admin.integration.spec.ts` bot-fill policy | pass (`live_ops` R/W; viewer forbidden) |
| `simulate:playable` (SIM_PORT=3015) | 9/9 scenarios ok |
| Flutter `ui_views_test.dart` | 8/8 pass |
| Flutter `session_controller_test.dart` | 81/81 pass |

## Journeys covered

- Product entry: splash → onboarding persist → identity → home (Quick Survival / Private / Training only)
- Queue enqueue/cancel without ghost tickets
- Private create/join, invalid code error, leave frees seat
- Training capacity-1 + rematch/retry new `matchId`
- Lobby: real `roomCode`, ready/leave/share, host/bot/disconnected presentation
- Bot-fill policy: env default off + admin `PATCH /api/admin/v1/matchmaking/bot-fill-policy` (`matchmaking:write` for `live_ops`)
- Existing playable loop regressions via simulate + gateway suite

## Explicitly out of scope (unchanged)

Challenge Studio, full powers, full Live Ops UI, store/IAP/chat, consumer auth — per RELEASE-BOUNDARY.
