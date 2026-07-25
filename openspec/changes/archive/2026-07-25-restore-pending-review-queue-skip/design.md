## Context

Fusion review forms are created during Match when a managed account partially matches identity candidates. While reviewers have not answered, the managed account must not re-enter Match on subsequent aggregations (or later phases of the same run). The established mechanism is Fetch-phase form processing:

1. `fetchFormInstances` loads Fusion review form definitions and instances.
2. `processFetchedFormData` → `analyzeFormInstances` sets `shouldRemoveAccountFromMap = true` when instances are pending (no response, not all cancelled).
3. `extractAccountInfoOverride` removes the managed account from `run.managedAccountsById` via `claimAccount`.

On `fernando`, step 3 unconditionally deleted from the work queue when the account was found in the work queue **or** the full managed-account snapshot. Commit `19397b7` replaced the snapshot with lightweight inventory and added `&& queueAccount`, which skips claim when lookup fails or when only inventory metadata is available without a queue entry at the exact claim instant.

Observed failure: account remains on the work queue → uncorrelated sweep scores it again → `getOrCreateFormDefinition` misses existing definition → ISC returns 409 on create.

## Goals / Non-Goals

**Goals:**

- Restore fernando-branch semantics: pending Fusion review ⇒ managed account removed from work queue before Match.
- Claim after successful partial-match form creation in the same run.
- Normalize composite managed-account keys at form/account boundaries.
- Recover gracefully from duplicate form-definition create conflicts.

**Non-Goals:**

- Changing form naming, reviewer assignment, or candidate cap behavior.
- Deleting pending forms when the managed account is missing from source (existing orphan cleanup unchanged).
- Match-phase scoring changes beyond queue depletion and optional defensive skip (primary fix is Fetch + post-create claim).
- Widening stale-form cleanup rules.

## Decisions

### D1: Restore unconditional claim when pending and account is in run inventory

- **Choice:** In `extractAccountInfoOverride`, when `shouldRemoveAccountFromMap` is true and `run.hasManagedAccount(normalizedAccountId)`, call `run.claimAccount(normalizedAccountId, identityId)` if the key is still in the work queue; if not in queue, no-op (already depleted).
- **Reason:** Matches fernando intent while staying compatible with inventory-only lookups for metadata return paths.
- **Considered alternatives:**
  - Reintroduce full `Account` snapshot map — rejected; memory regression from `19397b7`.
  - Match-only skip via `pendingReviewContextByAccountId` without Fetch claim — rejected as sole fix; Fetch must remain authoritative for cross-run behavior.

### D2: Add optional `identityId` to `ManagedAccountInfo`

- **Choice:** Extend `ManagedAccountInfo` and `toManagedAccountInfo` with optional `identityId`; use it when claiming from inventory fallback if work-queue entry was already removed earlier in the same Fetch pass.
- **Reason:** `claimAccount` must clean `managedAccountsByIdentityId`; inventory-only path previously lacked identity id (known gap in inventory design).
- **Considered alternatives:** Always require work-queue entry for claim — rejected; same-run multi-form ordering can deplete queue before metadata read.

### D3: Claim work queue after successful partial-match form creation

- **Choice:** In `MatchOutcomeDispatcher.handlePartialMatch`, when `outcome.formDefinitionReady` is true, call `run.claimAccount(managedAccountKey, account.identityId)` using the source `Account` from the sweep (in addition to existing `removeMatchAccount` when no new instances were queued).
- **Reason:** Deferred matches already claim immediately; partial matches should not rely solely on next-run Fetch.
- **Considered alternatives:** Only Fetch-phase claim — rejected; leaves same-run re-processing window.

### D4: Normalize account id from form input before lookup/claim

- **Choice:** Apply `normalizeCompositeManagedAccountKey` to ids from `extractAccountInfoFromFormInput` / `extractAccountIdFromInstance` before work-queue and inventory lookup.
- **Reason:** Prevents false misses when form stores a valid composite key with inconsistent trimming or legacy shapes that normalize to the canonical key.
- **Considered alternatives:** Change form name/key generation — rejected; breaks in-flight forms.

### D5: 409 conflict recovery in `getOrCreateFormDefinition`

- **Choice:** If `createFormDefinition` fails with a duplicate-name conflict, log at debug/warn and retry `getFormDefinitionByName` once; reuse if found, otherwise rethrow.
- **Reason:** Symptom mitigation when ISC search misses an existing definition; avoids failing the account when reuse would succeed.
- **Considered alternatives:** Always skip create when `pendingReviewContextByAccountId` has entry — rejected as insufficient alone without queue depletion.

## Risks / Trade-offs

- [Risk] Over-aggressive claim removes account before decision processing when form analysis is wrong → Mitigation: keep existing `shouldRemoveAccountFromMap` rules unchanged; only broaden claim preconditions when inventory confirms the account belongs to this run.
- [Risk] Claim after partial match hides account from non-match reporting paths → Mitigation: `removeMatchAccount` / tracker behavior unchanged; claim only removes work-queue entry, inventory retains metadata per fusion-run spec.
- [Trade-off] 409 retry masks ISC search bugs → accepted; logged for observability.
- [Trade-off] Adding `identityId` to inventory increases snapshot size slightly → negligible vs full Account snapshot removed in `19397b7`.

## Migration Plan

N/A — bug fix restoring prior behavior. No configuration changes. Tenants with in-flight Fusion review forms benefit immediately on next aggregation; no form migration required beyond existing composite-key conventions.

## Open Questions

- None — scope confirmed from production log (`400.1.409` duplicate form definition) and fernando-branch comparison.
