## Context

`FusionRun` owns two Fusion account collections: `fusionIdentityMapValue` (keyed by `identityId`) and `fusionAccountMapValue` (keyed by managed account key). `registerFusionAccount` routes a non-Managed account with an `identityId` into the identity map. When that identity already has an account, `trackConflictingFusionIdentity` computes a conflict key (`managedKeyOrUndefined`, falling back to `name:`) for both accounts: equal keys mean the existing account is being refreshed (in-place update), different keys mean a genuine duplicate. Today the duplicate path logs a warning and then overwrites.

This change gates the duplicate path behind a Developer Setting so the overwrite remains the default while operators can opt into keep-first/skip-later.

## Goals / Non-Goals

**Goals:**
- Add a boolean Developer Setting **Skip Fusion accounts with duplicate names** (key `skipDuplicateFusionAccounts`), default `false`.
- When enabled, `registerFusionAccount` keeps the first account for a Fusion identity and skips (does not register/return) later duplicates with a different account key.
- Preserve existing behavior (last-wins overwrite + warning) when disabled, and keep same-key updates in place in both states.

**Non-Goals:**
- Changing which account wins (no "keep the best" ranking).
- Removing or changing the conflict warning/report payload.
- Touching correlation, matching, or form review flows.

## Decisions

### D1: Gate via a Developer Setting, default false
- **Choice**: New `skipDuplicateFusionAccounts` boolean Developer Setting, `false` by default; `FusionRun` reads it from config at construction.
- **Reason**: Overwrite is existing production behavior; forcing skip-later on everyone would be a breaking change. Default-off makes it an explicit opt-in.
- **Considered alternatives**: (a) unconditional skip-later — rejected as breaking; (b) per-source config — rejected as over-scoped for a single boolean.

### D2: Reuse the existing conflict key for duplicate detection
- **Choice**: Keep `conflictTrackingKey` (managed key, `name:` fallback) as the duplicate-vs-update discriminator.
- **Reason**: It already encodes the "same key = refresh, different key = duplicate" distinction used for conflict reporting, so behavior stays consistent with the warning.
- **Considered alternatives**: compare `identityId` equality alone — rejected because it would treat same-account refreshes as duplicates.

### D3: Dedup must not depend on reporting availability
- **Choice**: `trackConflictingFusionIdentity` returns a boolean duplicate verdict before the `tracker && log` guard; the warning recording remains best-effort inside the guard.
- **Reason**: Skipping a duplicate is a correctness decision and must hold even when no `AggregationTracker` or `LogService` is attached (e.g. some test/edge paths).
- **Considered alternatives**: keying the skip on tracker presence — rejected as fragile.

### D4: Config plumbing
- **Choice**: Declare `skipDuplicateFusionAccounts: boolean` on `DeveloperSettingsSection`; add `runtimeDefaults.skipDuplicateFusionAccounts = false`; read via `extractBoolean(raw, 'skipDuplicateFusionAccounts')` in `readSettings`; add the toggle to `connector-spec.json`.
- **Reason**: Matches the existing pattern used by `concurrencyCheckEnabled` / `forceAttributeRefresh`.

## Risks / Trade-offs

- [Risk] When enabled, a later, more-authoritative account for an identity is dropped in favor of the first. -> Mitigation: default is off; the conflict warning still fires so operators can see that a duplicate was skipped.
- [Trade-off] `FusionRun` must hold config to know the toggle. -> Reason for acceptance: the constructor already accepts `config`; storing the boolean is a minimal extension.
- [Trade-off] The conflict warning message unchanged while skip behavior changes. -> Reason for acceptance: keeps report/replay snapshots stable; behavior is communicated via the setting's help text.

## Migration Plan

N/A — additive config option, default preserves current behavior. No data or endpoint changes.

## Open Questions

None.
