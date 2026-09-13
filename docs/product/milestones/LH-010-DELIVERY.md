# LH-010 delivery note

## Status

- Milestone: LH-010 — Full Challenge Studio and Content Operations
- Feature commit: *(filled at commit time)*
- Formal close: pending operator Studio walkthrough + create→publish→new-match proof on live admin/API
- LH-009 gameplay pack: **deferred** (schema-only engine forms registered in Studio)

## What shipped

- Challenge Studio admin IA: home, library, guided editor, template detail, catalog, localization, powers, modes, daily goals, analytics, ops, preview
- Production Studio UI building blocks (headers, metrics, tables, fields, device preview, publish wizard, lifecycle/diff)
- Contracts: 11-family engine registry (6 live + 5 schema_only), lifecycle statuses `in_review`/`scheduled`, `daily_goals` releases
- Migration `007_lh010_challenge_studio` (statuses, scheduled publishes, attempt events, LH-009 families)
- Lifecycle APIs: studio home, filtered library, detail, draft update, reject, in-review, SoD approve, catalog compose/proof, kind publishes, analytics, diff
- Runtime playlist skips `schema_only` engines; challenge attempt analytics writes on resolve
- Live catalog remains wait_for_signal-only until operators publish via Studio

## Checks run

- `pnpm --filter @thelastheart/contracts build`
- `npx jest content-lifecycle.lh010.spec.ts` + `lh010-engines.spec.ts` — PASS
- `pnpm exec tsc --noEmit` in admin-web — PASS
- Docker migration `007_lh010_challenge_studio` applied

## Gaps (honest)

- Operator visual confirmation of Studio EN/AR matrix and full create→publish→new-match journey
- Interactive playtest harness depth beyond device-frame preview states
- Catalog fairness proof AR key completeness still shallow vs full localization graph
- Family parameter forms for schema_only engines are complete in Studio; runtime evaluators remain LH-009
