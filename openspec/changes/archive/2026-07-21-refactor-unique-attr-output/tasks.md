## 1. Modify FusionService
- [x] 1.1 Remove `streamAndClearEligibleAccounts` from `src/services/fusionService/fusionService.ts`.
- [x] 1.2 Modify output streaming logic (either inside `forEachISCAccount` or a dedicated wrapper in `corePipeline.ts`) to synchronously invoke `this.definitionService.refreshUniqueAttributes(account)` for accounts that need it, immediately prior to invoking `this.getISCAccount(account)`. Ensure this only happens in the aggregation context to protect dry-run counters.

## 2. Refactor Core Pipeline
- [x] 2.1 Remove `uniqueAttributesPhase` from `src/operations/helpers/corePipeline.ts` (Phase 5).
- [x] 2.2 Wire the JIT generation into the `outputPhase` (Phase 6), specifically wrapped inside the `sendAccountsToPlatform` execution block.

## 3. Clean up Test Suites
- [x] 3.1 Update `src/operations/helpers/__tests__/corePipeline.test.ts` to reflect the removal of `streamAndClearEligibleAccounts` and `refreshUniqueAttributes` pipeline checkpoints.
- [x] 3.2 Verify dry-run tests remain completely non-mutating with respect to uniqueness counters.

## 4. Documentation
- [x] 4.1 Update any inline comments in `corePipeline.ts` referencing "Phase 5 / Phase 6" separation.
