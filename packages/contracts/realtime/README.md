# Real-time contracts (v1)

Language-neutral schemas for the LH-002 match core live in `realtime/v1/`.

Authoritative TypeScript validators are exported from `@thelastheart/contracts`.
JSON Schema files document the same envelopes for future generators.

## Code generation boundary

- Backend and future mobile clients must consume the same versioned schemas.
- Do not hand-write divergent Flutter DTOs for this protocol.
- A later milestone may generate Dart/TypeScript bindings into `packages/contracts/generated/`.
- Product copy is never embedded in events; use translation keys only.
