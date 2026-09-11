# The Last Heart — Five-Day Release-Candidate Roadmap

Status: execution-ready

This roadmap turns the completed platform, realtime core, playable slice, and administration foundation into a complete release candidate in five calendar days.

The target is not a prototype, a UI mock, or another technical foundation. The target is a production-shaped RC1 suitable for controlled playtesting and a limited launch:

- Arabic-first Android and iOS player experience.
- A complete six-player match from entry through rematch.
- Public Quick Survival, Private Room, and Training.
- Eleven reusable server-driven challenge families.
- Three-heart lifecycle, four-segment energy, three tactical powers, elimination, spectating, winner, and rematch.
- Authoritative synchronization, inclusive deadlines, reconnect/resume, idempotent actions, and deterministic resolution.
- Full Challenge Studio with structured editing, preview, review, publishing, catalog composition, pause, and rollback.
- Versioned mobile translations, game rules, power rules, and challenge catalogs.
- A professional English/LTR and Arabic/RTL administration control center.
- Real live operations, match investigation, player support, analytics, permissions, audit, and system health.
- Release builds, migration and deployment readiness, accessibility, security, and observed acceptance evidence.

## Authority

Use these sources in order:

1. The Last Heart Master Product Delivery Prompt.
2. This roadmap and its active milestone file.
3. The Last Heart Cursor Reference Pack: 30 screens, five flow boards, design tokens, source artwork, and app background.
4. Existing repository product documents and verified behavior that do not conflict with the above.

Do not ask Cursor to reinterpret the game. The milestone files divide delivery; they do not replace the product mandate.

## Five-day feasibility boundary

Five days is an aggressive delivery window. It is credible only because LH-001 through LH-004A already exist and because the release boundary is frozen.

RC1 means:

- Feature-complete and fully playable.
- Configurable and operable through real administration workflows.
- Tested with real builds and observed end-to-end journeys.
- Deployable once environment, domain, signing, and store credentials are supplied.

RC1 does not claim:

- App Store or Google Play approval inside five days.
- Production cloud accounts, domains, certificates, signing identities, or paid services that the Product Owner has not supplied.
- Proven internet-scale capacity without the target concurrency and production environment.
- A completed external penetration test or legal review.

Missing external credentials may block distribution, but they may not be used as an excuse to leave product code, release configuration, documentation, or local/staging verification incomplete.

## Frozen launch scope

Included:

- Quick Survival with six accepted seats and optional controlled bot fill.
- Private rooms with host, room code, ready state, leave, reconnect, and rematch.
- Training for supported non-social engines.
- Lightweight display name and visual identity; no large consumer-account program.
- Eleven launch challenge families.
- Danger Pulse, Shield, and Reflection.
- Spectating, winner summary, honest progression, and daily goals.
- Challenge Studio, localization, catalog and rule releases, Live Operations, player support, match explorer, analytics, audit, and system health.

Excluded:

- Voice recognition.
- Camera challenges.
- 3D characters or character animation.
- User-authored challenges.
- Chat, teams, large tournaments, ranked leagues, and social graph.
- Store, IAP, Battle Pass, seasons, loot boxes, trading, or pay-to-win.
- Paid external services without Product Owner approval.
- Decorative modules, fake numbers, dead controls, or placeholder product flows.

## Product invariants

- Six seated players in a standard match.
- Three hearts per player.
- Three-to-eight-second standard challenges.
- Up to 12 scheduled rounds, then announced sudden death if needed.
- Exact authoritative deadline is inclusive.
- Zero hearts means spectator, not removal from the experience.
- Standard success grants one energy.
- Four energy segments grant one power.
- Inventory holds up to three total charges and no duplicate charge of the same power.
- Active matches pin challenge, localization, game-rule, and power releases.
- The server decides accepted input, hearts, energy, powers, outcomes, elimination, and winner.
- Network arrival order is not presented as skill.
- One effective submission per player per challenge.
- A resumed connection takes lease ownership from the older socket without losing the player.
- Mobile is Arabic-first and true RTL.
- Admin is English-first/LTR with complete Arabic/RTL support.
- No competitive advantage is purchasable.

## Completed baseline (before the five-day window)

These milestones are **done**. Do not reopen them as implementation targets. Their specs record what RC1 inherits and what each later milestone must extend.

| ID | Title | Status | Spec |
| --- | --- | --- | --- |
| LH-001 | Monorepo and platform foundation | `done` | [LH-001.md](./LH-001.md) |
| LH-002 | Authoritative realtime match core | `done` | [LH-002.md](./LH-002.md) |
| LH-003 | Playable mobile match slice | `done` | [LH-003.md](./LH-003.md) |
| LH-004A | Admin authentication and operations foundation | `done` | [LH-004A.md](./LH-004A.md) |

Supporting maps:

- [RELEASE-BOUNDARY.md](./RELEASE-BOUNDARY.md) — locked RC1 inclusions and exclusions
- [COVERAGE-MATRIX.md](./COVERAGE-MATRIX.md) — product area → owning milestone
- [LH-DEFERRED.md](./LH-DEFERRED.md) — post-RC1 / excluded scope (do not implement in LH-005–LH-014)
- [CURSOR-START.md](./CURSOR-START.md) — execution prompt for the five-day window

## Schedule

| Day | Milestone | Required outcome |
| --- | --- | --- |
| 1 AM | LH-005 | Complete player entry, public matchmaking, private rooms, training, and rematch |
| 1 PM | LH-006 | Versioned challenge/content/rules platform with pinned releases and emergency controls |
| 2 AM | LH-007 | Core low-risk challenge pack and shared match presentation |
| 2 PM | LH-008 | Complete energy and tactical powers loop |
| 3 AM | LH-009 | Advanced sensor, audio, pair, and risk challenge pack |
| 3 PM | LH-010 | Full Challenge Studio, localization, preview, review, publishing, and analytics |
| 4 AM | LH-011 | Full administration operations center |
| 4 PM | LH-012 | Product intelligence, fairness, resilience, security, and recovery hardening |
| 5 AM | LH-013 | Mobile/admin visual fidelity, accessibility, real-device/browser, and release packaging |
| 5 PM | LH-014 | Final RC acceptance, defect closure, evidence, and clean handoff |

The AM/PM labels express sequence and urgency, not permission to cut acceptance criteria when a task takes longer. No new product scope may enter during the five-day window.

## Dependency order

```text
LH-001 → LH-002 → LH-003 → LH-004A   (done baseline)
                              ↓
                         LH-005 / LH-006
                              ↓
                    LH-007 → LH-008 → LH-009
                              ↓
                           LH-010 → LH-011
                              ↓
                           LH-012 → LH-013 → LH-014
```

LH-005 and LH-006 begin from the completed LH-001 through LH-004A baseline.

LH-007 depends on LH-006.
LH-008 depends on LH-006 and the playable paths in LH-005.
LH-009 depends on LH-007 and LH-008.
LH-010 depends on LH-006, LH-007, LH-008, and LH-009.
LH-011 depends on LH-005, LH-006, and LH-010.
LH-012 depends on all functional gameplay and operations milestones.
LH-013 depends on feature completeness.
LH-014 accepts the whole release and adds no feature scope.

## Cursor execution policy

Before the first milestone:

1. Confirm origin, branch, HEAD, and working-tree state.
2. Inspect existing commits and preserve all correct work.
3. Do not reset, clean, stash, rebase, switch branches, rewrite history, or push.
4. Resolve ownership of any unexpected dirty files before changing or committing them.
5. Read the product mandate, reference pack, this README, and the active milestone.

For every milestone:

1. State the player/operator outcome being completed.
2. Implement the outcome end to end; do not leave disconnected UI.
3. Use real backend behavior and real data.
4. Update shared contracts and all affected consumers together.
5. Run the milestone acceptance journeys and relevant regression checks.
6. Fix defects caused by the milestone.
7. Create exactly one focused local conventional commit after the milestone passes.
8. Record the full commit hash and observed checks.
9. Confirm an empty git status before beginning the next milestone.

Do not combine multiple unfinished milestones in one dirty tree. Do not create a commit that includes unrelated pre-existing changes. Do not claim a check passed unless it was run and its successful result was observed.

## Global definition of done

Every milestone must satisfy all applicable items:

- The player/operator journey works end to end.
- All visible controls work or are removed.
- No placeholder metrics or invented records.
- Shared contracts remain authoritative.
- Existing migrations remain safe and new migrations are repeatable.
- English/LTR and Arabic/RTL behavior is correct where admin is touched.
- Arabic-first RTL behavior is correct where mobile is touched.
- Authorization is enforced server-side, not only by hiding controls.
- High-risk actions require reason, confirmation, permission, and audit.
- Loading, empty, error, offline, reconnecting, and stale states are intentional.
- Relevant formatting, lint, tests, builds, simulations, migrations, audits, and live smoke paths pass.
- Product documentation and the delivery-status document reflect reality.
- One focused local commit exists and the tree is clean.

## Release acceptance

The release is accepted only after all 14 business journeys in LH-014 have been exercised with evidence. Test counts alone are insufficient.

