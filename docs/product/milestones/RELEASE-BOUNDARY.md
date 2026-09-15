# RC1 Product Boundary and Locked Decisions

This file closes product questions for the five-day release. Cursor must not reopen these decisions or replace them with easier behavior.

## Game modes

Quick Survival is the primary public mode. It fills six accepted seats. Live Operations may enable clearly identifiable bot fill after a configurable wait threshold.

Private Room supports create, code sharing, join, six seats, host identity, ready state, leave, reconnect, and rematch. It does not expose custom game-rule editing in the mobile app.

Training supports every eligible non-social challenge engine and uses labeled practice behavior for social mechanics. Training never changes competitive statistics or progression.

## Player identity

RC1 uses lightweight player identity: display name plus the established abstract avatar/color language. A large consumer authentication, social, or profile product is not required.

## Onboarding and home

Onboarding contains three short steps and appears once after completion. It remains reachable from a help entry.

The home level, earned points, current activity, and daily goal are real or absent. No fake currency, store balance, battle pass, decorative tournament, or dead future tab is allowed.

## Match rules

- Six players.
- Three hearts.
- 12 scheduled rounds followed by sudden death when required.
- Three-to-eight-second challenges.
- Exact deadline accepted.
- One heart normally lost on failure, invalid action, or timeout.
- Simultaneous elimination preserves the best performer through deterministic declared measures.
- One effective submission per player and challenge.
- Brief live-match reconnect grace starts at 15 seconds.

## Energy and powers

- Standard success grants one of four energy segments.
- Completing the meter grants exactly one eligible power from published weights. The meter stays full until the player consumes that power, then resets to zero and can refill on later successes.
- Inventory limit is three total charges and one per power type.
- Full inventory produces an explicit result and never silently drops a reward.
- Launch powers are Danger Pulse, Shield, and Reflection.
- No self-target, spectator target, protected target, or same target on consecutive attacks.
- A targeted player receives protection through the next standard challenge.
- Reflection occurs once per attack chain; the reflected sender may shield.

## Challenge catalog

Launch families:

1. Wait for state/color.
2. No-touch trap.
3. Shake.
4. Tilt balance.
5. Reverse swipe.
6. Precision tap.
7. Memory sequence.
8. Audio cue.
9. Pair synchronization.
10. Multitouch hold.
11. Risk choice.

Audio cue is in scope and is not voice recognition. It must have visual/haptic equivalence.

Pair synchronization starts with a 500 ms authoritative tolerance.

Risk choice awards the promised one or three energy only after the selected follow-up challenge is completed successfully.

Every engine requires an approved accessibility/capability fallback before it can enter a published catalog.

## Content releases

A match pins:

- Challenge catalog release.
- Localization catalog release.
- Game-mode rule release.
- Power configuration release.

Publishing never mutates a match in progress. Rollback creates a new release based on a previous approved version. Emergency pause removes affected content only from future selections while active matches converge safely.

## Visual identity

Use the supplied reference pack and assets. Mobile is portrait-first, Arabic-first, and true RTL. The reference viewport is 390 by 844 and must respond across supported safe areas.

Core colors:

- Background #030914.
- Surface #071522.
- Elevated surface #0B1D2D.
- Danger/primary #FF3045.
- Bright primary #FF5365.
- Success/cyan #22E7F2.
- Reward/amber #FFC247.
- Main text #F7FAFC.
- Muted text #93A4B5.
- Border #1D3A50.

Use Noto Sans Arabic Variable. No characters, faces, 3D, stock photos, generic Material makeover, or invented visual system.

## External release blockers

The codebase must be deployable without embedding secrets. The following are supplied externally and must be reported precisely if absent:

- Production domain and TLS termination.
- Database and Redis endpoints.
- Secret values.
- Android signing material.
- Apple signing identity, provisioning, and App Store account.
- Store listing ownership and legal/privacy URLs.
- Target production concurrency and hosting approval.

Their absence does not excuse incomplete product behavior or missing release builds that can be generated without them.

