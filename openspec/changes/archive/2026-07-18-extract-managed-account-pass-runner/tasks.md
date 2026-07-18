## 1. Create CandidateRegistry

- [x] 1.1 Create `src/services/fusionService/candidateRegistry.ts` with `CandidateRegistry` class, `CandidateRegistryDeps` interface, and methods `register(fusionAccount)`, `queryForSource(sourceName): Iterable<FusionAccount>`, and `clear()`
- [x] 1.2 Add unit tests in `src/services/fusionService/__tests__/candidateRegistry.test.ts` covering: register deferred-enabled authoritative, skip non-authoritative, skip deferred-disabled, skip missing managedKey, query returns only matching source, query empty returns empty iterable, clear removes all
- [x] 1.3 Run `npm test -- candidateRegistry` to verify

## 2. Create ManagedAccountPassRunner

- [x] 2.1 Create `src/services/fusionService/managedAccountPassRunner.ts` with `ManagedAccountPassResult` type and `ManagedAccountPassRunner` class accepting `ManagedAccountPassRunnerState`
- [x] 2.2 Implement `execute(accounts, batchSize, startedAt): Promise<ManagedAccountPassResult[]>` with two-pass logic: Pass 1 identity scoring (parallel batches, classify results), Pass 2 deferred peer scoring (parallel batches on pending)
- [x] 2.3 Implement progress logging matching current behavior (first, every N, final)
- [x] 2.4 Add unit tests in `src/services/fusionService/__tests__/managedAccountPassRunner.test.ts` covering: identity match returns identity-match, deferred-pending queues for pass 2, non-deferred unmatched returns non-match, pass 2 deferred-match, pass 2 non-match, candidate registration during pass 1, batch boundary behavior, empty input
- [x] 2.5 Run `npm test -- managedAccountPassRunner` to verify

## 3. Integrate runner into FusionService

- [x] 3.1 Add `ManagedAccountPassRunner` and `CandidateRegistry` to FusionService constructor (following existing collaborator pattern)
- [x] 3.2 Replace `runUncorrelatedManagedAccountPass` body with: call `runner.execute()`, iterate results, call `recordAnalysis` once per result, dispatch via flat switch to `handleIdentityBackedMatch` / `handleDeferredMatch` / `handleNonMatch`
- [x] 3.3 Modify `processManagedAccount` to call runner in single-account mode for uncorrelated accounts; remove `analyzeManagedAccount` private method
- [x] 3.4 Remove `completeManagedAccountFromAnalysis` private method
- [x] 3.5 Remove `registerCurrentRunUnmatchedCandidate`, `currentRunUnmatchedCandidatesForSource`, `_currentRunUnmatchedCandidatesIterableForSource`, `deferredMatchingSourceKey` private methods (moved to CandidateRegistry)
- [x] 3.6 Wire `CandidateRegistry.clear()` into `initializeManagedAccountProcessing` (replacing `currentRunUnmatchedFusionManagedKeysBySource.clear()`)
- [x] 3.7 Update `processCorrelatedManagedAccounts` and `processUncorrelatedManagedAccounts` to use the new runner-based flow; ensure `_managedAccountProcessingState` lifecycle is preserved

## 4. Update existing tests

- [x] 4.1 Update any test mocks that reference removed methods (`analyzeManagedAccount`, `completeManagedAccountFromAnalysis`, `registerCurrentRunUnmatchedCandidate`, etc.)
- [x] 4.2 Verify all existing `fusionService.test.ts` tests pass without modification to test logic (only mocks)
- [x] 4.3 Run full test suite: `npm test`

## 5. Verify and clean up

- [x] 5.1 Run `npm run typecheck` and fix any type errors
- [x] 5.2 Run `npm run lint` and fix any lint errors
- [x] 5.3 Verify the `recordAnalysis` call count is exactly one per account (add assertion to existing test or manual verification via coverage)
- [x] 5.4 Remove the old `2026-07-18-extract-managed-account-pass-runner` directory if it still exists
