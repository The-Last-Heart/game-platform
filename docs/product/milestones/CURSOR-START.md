# Cursor Execution Prompt

You are responsible for completing The Last Heart RC1 inside the existing game-platform repository in five calendar days.

This is not a request for a prototype, architecture proposal, milestone rewrite, or partial UI. Continue the existing product from its current clean committed state and implement every remaining milestone.

Before making changes, read in this order:

1. The Last Heart Master Product Delivery Prompt.
2. The supplied Last Heart Cursor Reference Pack.
3. The milestone roadmap README.
4. RELEASE-BOUNDARY.md.
5. COVERAGE-MATRIX.md.
6. Completed baseline specs LH-001 through LH-004A (context only — do not reimplement).
7. The first milestone whose acceptance criteria are not already fully satisfied by committed code (today: LH-005 unless proven otherwise).

Confirm origin, branch, HEAD, recent commits, and git status. Preserve existing correct work. Do not reset, clean, stash, rebase, switch branches, rewrite history, or push.

Execute LH-005 through LH-014 in order. For each milestone:

1. Inspect the current implementation before deciding what remains.
2. Implement the player/operator outcome end to end.
3. Do not create dead UI, fake analytics, placeholder settings, or disconnected backend features.
4. Use shared contracts and preserve server authority.
5. Verify the exact milestone acceptance journeys and all affected regressions.
6. Fix issues caused by the milestone.
7. Create one focused conventional local commit.
8. Record the full hash, evidence, and checks.
9. Confirm the working tree is clean before continuing.

**Hard gate (Product Owner):** A milestone is closed only after acceptance journeys are observed on the real path that matters, verification bugs are fixed, required evidence exists, the focused commit is done, and `git status` is clean. Do not start the next milestone on partial green tests or a dirty tree. Track live status in [DELIVERY-STATUS.md](./DELIVERY-STATUS.md).

Do not stop after providing a plan. Do not ask the Product Owner to repeat decisions already locked in RELEASE-BOUNDARY.md. Escalate only a genuinely missing external credential or a contradiction among higher-authority sources.

If one context window cannot finish the work, update a durable delivery-status file with:

- Last completed milestone.
- Full commit hashes in order.
- Acceptance journeys actually observed.
- Current blocker or next exact action.
- Tests and evidence already produced.
- Empty git status.

Then continue from that committed checkpoint in the next Cursor session.

The project is complete only when LH-014 concludes RC1 accepted for controlled release. Anything else must be reported as RC1 blocked with the exact failed journey and correction.

