## Why

account-list still has three costs that grow with account count after this week’s Map/Define and uncorrelated dispatch work:

1. **Record unique registration is a `for` loop.** Match-disabled Record accounts were pulled out of the uncorrelated sweep, but `registerUniqueValuesFromRecordManagedAccounts` still maps and registers one account at a time. Thousands of Record accounts wait on that Process STEP while Map work cannot overlap.

2. **Correlated sweep logs INFO per skip-linked account.** Steady-state aggregations are mostly already-linked correlated accounts. Each still takes `runMatchSweep([account], 1)` (required). That path is cheap except tens of thousands of INFO lines, which also violate `account-list-operation` (per-account match/correlation messages SHALL NOT be INFO).

3. **Output Unique generation holds the registry lock across Velocity.** `forEachISCAccount` already `Promise.all`s `refreshUniqueAttributes` for a fusion-parallel batch, then serializes. `generateUniqueAttributeValue` wraps the entire template evaluation and collision loop in `locks.withLock('unique:${name}')`, so concurrent accounts in the batch queue on one lock and Output unique JIT is effectively serial per unique attribute. First aggregations (many `needsRefresh` / missing unique values) pay that cost on the send-accounts STEP.

## What Changes

**Record unique registration overlaps within the fusion parallel cap**
- From: serial `for` + yield every 50.
- To: `promiseAllBatched` with `getFusionParallelBatchSize(config)` (default 12). Per-account map + `registerUniqueAttributes` unchanged. Unique-set mutations stay inside existing per-name locks.
- Impact: Same registered values and work-queue removals. Faster `record-unique-registration` STEP.

**Correlated pre-score INFO becomes aggregate DETAIL**
- From: INFO per skip-linked drop and per correlated-orphan non-match.
- To: No INFO per account. Optional debug when log level is debug. After `runCorrelatedAccountSweep`, one DETAIL or STEP END with dropped-linked count and remaining queue size.
- Impact: Same skip-linked claim/drop and correlated-orphan non-match behavior.

**Unique generation lock covers registry membership only**
- From: `generateUniqueAttributeValue` holds `unique:${name}` for Velocity, UUID inject, collision retries, and set insert.
- To: Evaluate the template (and inject `$UUID` / next `$counter`) **outside** the lock. Under the lock: `has` / `add` on the registered set (and return the winner). On collision, release, bump counter or new UUID, re-evaluate, retry up to maxAttempts. Incremental `counterFn()` stays on the existing counter lock. Preserve-existing and identity/display short-circuits unchanged. JIT still runs in `processOutputBatch` immediately before `getISCAccount`.
- Reason: Output already parallelizes the batch; the lock is what serializes Unique CPU.
- Impact: Same unique values and collision behavior. Faster send-accounts when many accounts generate Unique attributes. No new connector-spec key. Do not generate Unique before Output.

**Unchanged**
- `runMatchSweep([account], 1)` per correlated account
- Uncorrelated identity-phase dispatch overlap
- Deferred drain sequential-within-source
- Output batch size (`getFusionParallelBatchSize`)
- Connector-spec / developer settings keys

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-service`: Record unique registration SHALL run eligible accounts in bounded parallel batches. Unique generation SHALL hold the unique registry lock only for set membership check/insert, not for Velocity evaluation.
- `matching-service/match-outcome-dispatch`: Skip-linked and correlated-orphan pre-score SHALL NOT emit INFO per account
- `account-list-operation`: Process-phase correlated sweep SHALL report skip-linked volume as aggregate DETAIL/STEP END. Output-phase Unique JIT MAY overlap across the existing fusion-parallel batch; values SHALL still be unique.
- `fusion-service`: Correlated sweep completion SHALL include dropped-linked / remaining queue aggregate. Unique attributes SHALL still be generated JIT immediately before serialize (lock shrinking does not move generation earlier).

## Impact

- Code: `src/services/definitionService/definitionService.ts` (`registerUniqueValuesFromRecordManagedAccounts`, `generateUniqueAttributeValue`, collision/incremental helpers), `src/services/matchingService/preScoreGate.ts`, `src/services/fusionService/fusionService.ts` (`runCorrelatedAccountSweep` DETAIL only). Do not restructure `forEachISCAccount` / `processOutputBatch` except as required for tests.
- Tests: `recordUniqueRegistration.test.ts`; `defineService.test.ts` (collision, preservation, concurrent refresh); pre-score / match-outcome dispatcher tests; correlated sweep DETAIL if asserted
- Docs: changelog; `docs/operations/account-list.md` only if it claims per-account “dropping linked” INFO or Unique generation during Process
- No connector-spec keys, no migration

## Apply status

- **Status**: TODO
- **Depends on**: none
- **Issue**:
