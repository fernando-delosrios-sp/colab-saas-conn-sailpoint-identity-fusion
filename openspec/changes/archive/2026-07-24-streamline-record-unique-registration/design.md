## Context

Record-type managed sources with `includeRecordAccountsForMatching: false` reserve third-party (or other) unique attribute values without creating Fusion accounts or running Match scoring. Aggregations commonly load **several thousand** such accounts per run.

Current flow still calls `AccountAssembly.assembleManagedAccount` (full map, all normal defines, reverse correlation) and routes each account through `MatchOutcomeDispatcher` before `DefinitionService.registerUniqueAttributes`. Registration reads values already on the fusion attribute bag—it does **not** evaluate unique-definition Velocity templates.

Confirmed constraints from operator config:

- Values arrive via **passthrough** (source attribute name = unique definition name) or **attribute map** (`newAttribute` = unique definition name).
- Values are **never calculated** via normal or unique defines on this path.

## Goals / Non-Goals

**Goals:**

- Remove thousands of record-only accounts from the uncorrelated match sweep.
- Register unique values with identical semantics to today (passthrough + coincident maps only).
- Map only attribute targets that coincide with unique definition names.
- Add a visible `record-unique-registration` process step with batch progress.
- Reuse the same registration helper for form decision record no-match paths.

**Non-Goals:**

- Velocity dependency analysis or normal-define evaluation on record-only path.
- Changing behavior when `includeRecordAccountsForMatching` is true (full match path unchanged).
- Evaluating unique-definition templates to generate values from record accounts.
- ClientService queue algorithm changes (only logging alignment).

## Decisions

### D1: Bulk pre-pass vs in-sweep optimization

- **Choice:** Dedicated bulk phase before uncorrelated match sweep.
- **Reason:** User prioritises performance at thousands of accounts; removing accounts from the queue avoids match infrastructure (trigram index relevance, analysis recorder, misleading `analyzed` progress).
- **Considered alternatives:** Selective map inside existing sweep (smaller diff, still O(N) full FusionAccount lifecycle)—rejected for insufficient gain.

### D2: UniqueRegistrationPlan at config load

- **Choice:** Precompute at `DefinitionService` (or adjacent index) on startup:

  ```
  uniqueNames  = Set(uniqueAttributeDefinitions[].name)
  mapTargets   = uniqueNames ∩ Set(attributeMaps[].newAttribute)
  passthrough  = uniqueNames − mapTargets
  ```

- **Reason:** O(config) intersection; no runtime Velocity parsing; matches confirmed value sources.
- **Considered alternatives:** Static analysis of expressions—rejected (YAGNI).

### D3: Per-account lightweight pipeline

- **Choice:** For each eligible managed account:
  1. `FusionAccount.fromManagedAccount(account)`
  2. `MappingService.mapAttributes(fusionAccount, run, { onlyTargets: plan.mapTargets })`
  3. `DefinitionService.registerUniqueAttributes(fusionAccount)` (existing logic)
  4. Remove from `managedAccountsById` / claim account

- **Reason:** Reuses proven registration and map merge rules; skips normal define, reverse correlation, match assembly.
- **Considered alternatives:** Raw attribute extraction without FusionAccount—rejected (map merge logic would be duplicated).

### D4: Phase placement

- **Choice:** After `processCorrelatedManagedAccounts`, before `processUncorrelatedManagedAccounts` in process phase.
- **Reason:** Correlated record accounts handled by existing correlated sweep; bulk pass drains match-disabled record sources from the remaining queue.
- **Considered alternatives:** Fetch phase bulk register—too early (managed accounts may still be claimed by refresh).

### D5: Logging

- **Choice:** `log.stepStart('record-unique-registration', { accounts: N })`, progress unit `registered`, optional `EVENT_SUMMARY recordUniqueRegistered=N`.
- **Reason:** Separates CPU-bound registration from API queue heartbeat stall detection during `uncorrelated-sweep`.

### D6: Eligibility filter

- **Choice:** Source type `Record` AND `includeRecordAccountsForMatching !== true` (default true, so explicit false required).
- **Reason:** Matches existing `isRecordMatchingEnabledForSource` semantics.

## Risks / Trade-offs

- **[Risk] Registration divergence if map-only path omits side effects** → Mitigation: Integration tests comparing registered value sets before/after for fixture configs; reuse `registerUniqueAttributes` unchanged.
- **[Risk] Accounts removed from queue but still needed elsewhere** → Mitigation: Mirror current non-match disposal (claim/remove); verify correlated and form-decision paths.
- **[Risk] Empty plan when no maps coincide and no passthrough values** → Mitigation: Debug log per source; no error (same as today when attributes missing).
- **[Trade-off] New phase adds code path** → Accepted for measurable performance at scale.

## Migration Plan

1. Ship behind no feature flag (behavior-preserving for registered values).
2. Deploy connector bundle; no ISC config migration required.
3. Acceptance: aggregation with thousands of record-only accounts completes faster; logs show `record-unique-registration` then smaller `uncorrelated-sweep`; unique collision behavior unchanged in downstream Fusion account creation.
4. Rollback: revert to prior release; registered values from partial run persist in memory-only registry (same as today within a single run).

## Open Questions

- None blocking implementation. Optional follow-up: extend heartbeat to suppress stall warnings when step is CPU-bound (out of scope unless needed after first deploy).
