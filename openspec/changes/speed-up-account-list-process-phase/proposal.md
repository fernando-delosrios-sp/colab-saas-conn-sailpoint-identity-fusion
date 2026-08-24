## Why

account-list **Process** still has two managed-account costs that grow linearly after this week’s Map/Define and uncorrelated dispatch work:

1. **Record unique registration is a `for` loop.** Match-disabled Record accounts were pulled out of the uncorrelated sweep so scoring would not see them, but `registerUniqueValuesFromRecordManagedAccounts` still maps and registers one account at a time (`definitionService.ts`). A tenant with thousands of Record accounts waits on that STEP with `progress=… registered` while Map work cannot overlap.

2. **Correlated sweep logs INFO per skip-linked account.** Steady-state aggregations are mostly already-linked correlated accounts. Each still takes `runMatchSweep([account], 1)` (required). That path is cheap except `log.info('Dropping managed account already linked…')` and the sibling correlated-orphan INFO in `preScoreGate.ts`. Tens of thousands of INFO lines dominate Process wall-clock and violate `account-list-operation` (per-account match/correlation messages SHALL NOT be INFO).

## What Changes

**Record unique registration overlaps within the fusion parallel cap**
- From: `for (const account of accounts) { await registerUniqueValuesFromRecordManagedAccount(...); yield every 50 }`
- To: `promiseAllBatched` (or equivalent) with `getFusionParallelBatchSize(config)` (default 12). Per-account map + `registerUniqueAttributes` unchanged. Unique-set mutations stay inside existing per-name locks. Progress callback still fires; yield between batches (helper already yields — drop the extra every-50 yield or keep it only if batches are larger than 50).
- Reason: Map for record registration is CPU and independent across accounts; uniqueness is already lock-protected.
- Impact: Same registered values and work-queue removals. Faster `record-unique-registration` STEP. Peak concurrent maps bounded by 12 (or configured `managedAccountsBatchSize` if lower).

**Correlated pre-score INFO becomes aggregate DETAIL**
- From: INFO per skip-linked drop and per correlated-orphan non-match in `resolveAccountBeforeScoring`.
- To: No INFO per account. Optional debug per account only when log level is debug. After `runCorrelatedAccountSweep`, one DETAIL or STEP END fields with dropped-linked count and remaining queue size.
- Reason: `account-list-operation` already forbids per-account match/correlation INFO; host logging is the remaining cost on the skip-linked path.
- Impact: Same skip-linked claim/drop and correlated-orphan non-match behavior. STATUS/EVENT_SUMMARY unchanged (skip-linked is not a match outcome).

**Unchanged**
- `runMatchSweep([account], 1)` per correlated account; `batchProcess` wrapper
- Uncorrelated `runMatchSweep(fullQueue, batchSize)` and identity-phase dispatch overlap
- Deferred drain sequential-within-source
- Unique *generation* (`refreshUniqueAttributes` / Output JIT)
- Connector-spec / developer settings keys

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-service`: Record unique registration SHALL run eligible accounts in bounded parallel batches; unique-set writes remain lock-serialized per attribute name
- `matching-service/match-outcome-dispatch`: Skip-linked and correlated-orphan pre-score SHALL NOT emit INFO per account
- `account-list-operation`: Process-phase correlated sweep SHALL report skip-linked volume as aggregate DETAIL/STEP END, not per-account INFO
- `fusion-service`: Correlated sweep completion SHALL include dropped-linked / remaining queue aggregate (no new public method)

## Impact

- Code: `src/services/definitionService/definitionService.ts`, `src/services/matchingService/preScoreGate.ts`, `src/services/fusionService/fusionService.ts` (`runCorrelatedAccountSweep` DETAIL only)
- Tests: `recordUniqueRegistration.test.ts`; pre-score / match-outcome dispatcher tests; `fusionService.aggregation.test.ts` if correlated sweep DETAIL is asserted
- Docs: changelog; `docs/operations/account-list.md` only if it claims per-account “dropping linked” INFO
- No connector-spec keys, no migration

## Apply status

- **Status**: TODO
- **Depends on**: none
- **Issue**:
