## Scope

Add a Developer Setting boolean toggle **Skip Fusion accounts with duplicate names** (default `false`) that, when enabled, makes `FusionRun.registerFusionAccount` keep the first Fusion account registered for a Fusion identity and skip (not return) any later Fusion account that resolves to the same identity with a different account key. When disabled, the existing last-registered-wins overwrite behavior is preserved.

## Language

**Duplicate Fusion account** (`promote`):
A Fusion account that resolves to a Fusion identity that already has a registered Fusion account whose managed account key differs (typically because account names are non-unique across sources).
_Avoid_: "conflicting Fusion account", "collision", "clobbered account", "overwritten account".

## Decisions

- The new behavior is gated behind a Developer Setting, not enabled unconditionally. Rationale: the overwrite/last-wins behavior is existing production behavior, and changing it silently could surprise existing deployments.
- Default is `false` (preserve current overwrite behavior). Enabling the toggle opts in to keep-first/skip-later.
- The duplicate-detection key is the existing `conflictTrackingKey` (managed account key, falling back to `name:`), reusing the same "same key = update, different key = duplicate" distinction already used for conflict warning reporting.
- A same-key registration remains an in-place update regardless of the toggle (it is a refresh of the same account, not a duplicate).
- When the toggle is enabled and a duplicate is skipped, the existing conflict warning is still recorded so reports and replay snapshots keep surfacing the condition.

## Open questions

None — resolved above.

## Scenarios discussed

- Two managed source accounts with different native identities correlate to the same Fusion identity: toggle on → first is returned, second is skipped; toggle off → second overwrites first (both keep logging the conflict warning).
- Same managed account key re-registered with refreshed attributes: update in place in both toggle states.
- Duplicate arrives while no tracker or logger is attached: skip still applies when the toggle is on (dedup must not depend on reporting being available).
