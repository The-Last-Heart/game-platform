# Match Rules — The Last Heart (LH-002)

Authoritative rules implemented by the server-side match core.

## Lobby and players

- A match requires exactly **six** players.
- Every player starts with **three hearts** and **zero energy**.
- Player identifiers are ephemeral server-generated values for this milestone.
- No profiles, avatars, rankings or accounts are modeled.

## Challenges

- Challenges are data-driven and evaluated by reusable engines.
- Challenge duration must be between **3 and 8 seconds** inclusive.
- Timing is controlled exclusively by the server (`startsAtMs`, `deadlineAtMs`, `serverNowMs`).
- Clients must not supply authoritative `success`, `correct`, hearts, energy, winner or elapsed time.

## Outcomes

- Successful answers grant only the configured non-negative energy reward.
- Failed or late/missing answers apply only the configured heart penalty of **0 or 1**.
- Hearts never fall below zero.
- A player reaching zero hearts becomes a **spectator**.
- Spectators continue receiving match state and cannot submit answers.

## Victory

- When exactly one player retains at least one heart, that player is declared the winner and the match completes.
- If a round would leave **zero** surviving players, the server does **not** invent a winner. The match halts in a safe unresolved state and surfaces `errors.match.unsafe_zero_survivors`.

## Out of scope (LH-002)

- Powers (energy may increase but does not activate powers).
- Voice challenges.
- Matchmaking UX, friends, invitations.
- Permanent authentication.
- Production challenge content.
