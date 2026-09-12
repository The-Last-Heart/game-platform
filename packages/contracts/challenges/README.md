# Challenge-definition schemas

Server-driven challenge engine contracts consumed by reusable engines on mobile and backend evaluators.

## LH-007 launch pack (`src/challenges/v1`)

Typed Zod schemas for the six launch engines:

| Engine id | Role |
| --- | --- |
| `reaction.wait_for_signal` | Wait for signal, then tap |
| `trap.no_touch` | Survive without touching a zone |
| `gesture.reverse_swipe` | Swipe opposite the displayed direction |
| `tap.precision` | Tap required targets within attempts |
| `memory.sequence` | Preview then reproduce a sequence |
| `hold.multitouch` | Hold two contacts for a duration |

Each engine exports `clientConfig`, `serverConfig`, and `answer` schemas, plus `validateEngineConfigs` / `validateEngineAnswer` and per-engine parse helpers.

Import from `@thelastheart/contracts` (re-exported via package entry).
