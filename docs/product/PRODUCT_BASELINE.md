# Product Baseline — The Last Heart (آخر قلب)

Status: binding product baseline for foundation and subsequent milestones.
Product Owner owns game behavior, UX, and visual decisions.

## Applications

### Mobile application

- Arabic-first (architecture must support additional languages later)
- Direction comes from locale metadata (`rtl` for Arabic; other RTL locales are allowed)
- Real-time online party game for Android and iOS
- No 3D characters or character animation
- Voice challenges are a **future** milestone and must not be implemented in early milestones
- Mobile and gameplay user-facing text is **server-managed** via versioned translation catalogs — not permanently hardcoded in widgets or challenge engines
- Only a minimal bundled bootstrap catalog is allowed as a recovery fallback

### Administration web application

- English-first
- Left-to-right (LTR) by default
- Must support switching to Arabic
- When Arabic is selected, the **entire** interface direction changes to RTL
- New UI copy must go through the localization system
- Admin shell dictionaries are independent from the mobile/gameplay catalogs managed later in Translation Management

These two applications have different default languages and directions. Do not apply mobile Arabic/RTL defaults to admin, or admin English/LTR defaults to mobile.

## Match and challenge rules

| Rule | Value |
| --- | --- |
| Default match size | 6 players |
| Starting hearts | 3 per player |
| Typical challenge duration | 3–8 seconds |
| Late / failed response | May remove one heart |
| Successful challenge | Charges player energy |
| Energy | Can unlock defensive or offensive powers |
| Zero hearts | Player becomes a spectator |
| Win condition | Last player retaining at least one heart |
| Challenge control | Server-driven, data-driven definitions |
| Match authority | Backend is authoritative for state and results |
| Challenge architecture | Reusable challenge engines — not hardcoded per-level screens |

## Non-goals for early milestones

- Inventing mechanics not listed here
- Redesigning supplied UI references
- Hardcoding challenge-specific screens that block server configuration
- Selecting paid external services without approval
- Premature microservices or cloud infrastructure

## Milestone roadmap

Deliverable milestones (done, next, planned, deferred) are specified as individual Markdown files:

- Index: [`milestones/README.md`](./milestones/README.md)
- Next recommended implementation target: [`milestones/LH-005.md`](./milestones/LH-005.md)

Cite the specific milestone file when opening implementation work. Do not implement ahead of the active milestone.

## Open product decisions

Any missing decision must be raised as a question to the Product Owner. Engineers must not silently invent product behavior.
