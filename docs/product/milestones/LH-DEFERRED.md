# Deferred and Excluded Scope (Post-RC1)

Status: deferred / excluded from the five-day RC1 window
Index: [README.md](./README.md) · Bound by [RELEASE-BOUNDARY.md](./RELEASE-BOUNDARY.md)

## Purpose

This file records product ideas that must **not** enter LH-005 through LH-014. During the five-day window, Cursor and contributors treat [RELEASE-BOUNDARY.md](./RELEASE-BOUNDARY.md) as the locked exclusion list. This file does not reopen those decisions.

## Excluded from RC1 (do not implement)

From the release boundary and project rules:

- Voice recognition challenges
- Camera challenges
- 3D characters or character animation
- User-authored challenges / arbitrary executable challenge scripts
- Chat, teams, large tournaments, ranked leagues, social graph
- Store, IAP, Battle Pass, seasons, loot boxes, trading, pay-to-win
- Large consumer authentication / social login / rich profile programs beyond lightweight display name and approved avatar language
- Private-room custom game-rule editing inside the mobile app
- Paid external services without Product Owner approval
- Decorative modules, fake metrics, dead controls, or placeholder product flows
- Premature microservices or unpaid-approval cloud sprawl

## Not an excuse to skip RC1 work

Missing App Store/Play approval, production domains, signing identities, or paid hosting may block **distribution**, but they must not be used to leave product behavior, release configuration, documentation, or local/staging verification incomplete. See the roadmap README feasibility boundary and LH-013 / LH-014 external-blocker rules.

## How to activate deferred work after RC1

1. Product Owner creates a new numbered milestone after LH-014 (for example `LH-020-voice-challenges.md`).
2. Update [README.md](./README.md) and [COVERAGE-MATRIX.md](./COVERAGE-MATRIX.md).
3. Implementation prompts must cite that new milestone — not this deferred list alone.
4. Do not fold deferred scope into an in-flight LH-005–LH-014 commit.

## Relationship to completed baseline

LH-001 through LH-004A are **done**, not deferred. Incomplete RC1 product work starts at [LH-005.md](./LH-005.md).
