# LH-006 delivery evidence

**Status:** CLOSED  
**Commit message:** `feat(content): add versioned game content releases`  
**Verify hash:** c1fd844079d13a75a766f9910504db403b9e7dfb

## Product outcome

Wait-for-state content is served from published immutable releases. Every new match pins four release ids; active matches keep prior pins across later publishes. Admins can draft/validate/submit/approve/publish, pause future selection, roll back via a new release, and operate durable emergency controls.

## Observed checks

| Check | Result |
| --- | --- |
| `pnpm --filter @thelastheart/contracts build` | pass |
| `db:migrate` (first run applies `003_versioned_game_content`) | pass |
| `db:migrate` (second run skips) | pass (`appliedNow: []`) |
| `match.engine.spec.ts` / `matchmaking.service.spec.ts` / `admin-matchmaking.controller.spec.ts` | pass |
| `match.gateway.integration.spec.ts` | pass (28) |
| `scripts/lh006-acceptance.ts` (local Postgres) | pass — see evidence below |
| Admin-web `tsc --noEmit` | pass |
| Mobile envelope + `MatchSnapshotPayload.releasePins` analyze | pass |
| Admin-web vitest `proxy.test` secure-cookie https | **pre-existing fail** (unrelated to content surface) |

## Acceptance journeys (evidence)

Acceptance script output (abridged):

- **Match A** pinned bootstrap catalog `11111111-1111-4111-8111-111111111111`.
- **Publish** new catalog → current pointer moved to new release id.
- **Match A** pins unchanged after publish (active-match stability).
- **Match B** pinned the new catalog release id.
- **Invalid definition** rejected (`durationMs` / empty Arabic / missing fallback).
- **Pause + rollback** wrote audit actions: `content.pause`, `content.catalog.publish`, `content.catalog.rollback`.
- Migration applied once, skipped on second run.

## Surfaces shipped

- Contracts: content/release Zod, admin content + emergency DTOs, permissions, optional `releasePins` on snapshot.
- Backend: migration `003`, `ContentModule`, lifecycle + release resolver + emergency services, admin APIs, match create pinning + pinned playlist, durable bot-fill / matchmaking pause.
- Admin-web: Content nav/page, emergency controls on System, bot-fill reason/audit.
- Mobile: snapshot allowlist + DTO parity for `releasePins`.

## Explicit gaps (none in-scope)

- Full Studio editor/playtest remains LH-010.
- Extra engines remain LH-007/009.
- Offensive powers disable is stored + audited; gameplay gate is LH-008.

## Completion

Do not begin LH-007 until this file’s commit is on HEAD and `git status` is clean. See [DELIVERY-STATUS.md](./DELIVERY-STATUS.md).
