## Why

The connector's "Delete accounts with no authoritative accounts left" option (`deleteEmpty`) currently only removes Fusion accounts that originated from managed sources. Identity-origin Fusion accounts are protected from orphan deletion because they carry the `baseline` status. When an ISC identity is removed from the configured identity scope (or deleted), its associated identity-origin Fusion account can become stale and should also be removed when it has no remaining managed source accounts.

## What Changes

- Extend the orphan-detection logic so identity-origin Fusion accounts can be marked `orphan` when their origin identity is no longer in the configured identity scope and they have no managed source accounts left.
- Keep the `baseline` status on identity-origin accounts when they become orphan (orphan is additive, not a replacement).
- Apply the new rule during full aggregations and single-account rebuild operations (read, update, enable, disable).
- Use a targeted `id:"<id>"` search for single-account operations to determine scope membership without fetching the entire identity population.
- Add unit and integration tests covering aggregation and single-account paths.

## Capabilities

### New Capabilities
- `identity-origin-orphan-detection`: Detect identity-origin Fusion accounts whose origin identity is absent from the configured identity scope and mark them orphan when no managed accounts remain.

### Modified Capabilities
- None. Existing orphan behavior for managed-origin accounts is preserved.

## Impact

- `src/services/identityService.ts`: adds scope-membership tracking and a targeted scope check.
- `src/model/fusionAccount.ts`: extends orphan status assignment to consider identity-origin accounts.
- `src/services/fusionService/fusionService.ts`: sets scope-membership flag during processing.
- `src/operations/helpers/rebuildFusionAccount.ts`: performs scope-aware identity check before rebuilding.
- Test files in `src/services/fusionService/__tests__` and `src/model/__tests__`.
