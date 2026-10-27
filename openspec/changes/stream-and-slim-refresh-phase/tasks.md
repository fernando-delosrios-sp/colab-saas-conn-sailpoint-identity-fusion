## 1. Iterable Batch Processing Helper

- [ ] 1.1 Implement `forEachBatched` in `src/services/fusionService/collections.ts` to process an `Iterable<T>` in fixed-size chunks without allocating `T[]` or `R[]`
- [ ] 1.2 Add unit tests for `forEachBatched` covering batch sizing, error handling, progress callbacks, and completion counts

## 2. Refresh Phase Streaming & Depletion

- [ ] 2.1 Add `deleteFusionAccount(nativeIdentity: string)` method to `SourceService`
- [ ] 2.2 Update `FusionService.processFusionAccounts` to consume `sources.fusionAccountValues()` iterator using `forEachBatched`
- [ ] 2.3 Wire incremental raw account depletion into `finalizeProcessedFusionAccount` (guarded by `!run.isRecordMode`)
- [ ] 2.4 Verify `accountListPhases.ts` logs correct refresh count without calling `processedFusionAccounts.length`

## 3. FusionAccount Slimming & Static Precomputation

- [ ] 3.1 Precompute `managedSourceNames: ReadonlySet<string>` statically in `FusionAccount.configure(config)`
- [ ] 3.2 Update `FusionAccount` and `FusionLayers` to reference the static shared `managedSourceNames`
- [ ] 3.3 Refactor `applyFactorySeed` in `fusionAccountFactories.ts` and `fusionAccount.ts` to eliminate redundant attribute clones

## 4. Verification

- [ ] 4.1 Confirm canonical test command: `npm test`
- [ ] 4.2 All delta spec scenarios covered by named automated tests
- [ ] 4.3 Verify `sources.fusionAccountsByNativeIdentity.size === 0` at the completion of `processFusionAccounts`

## 5. Documentation

- [ ] 5.1 Update `docs/concepts/glossary.md` with Iterable Batching and Raw Account Depletion entries
- [ ] 5.2 Update `docs/reference/` architecture docs for Phase 3 Refresh processing

## 6. Changelog

- [ ] 6.1 Create or update changelog entry for this change
- [ ] 6.2 Confirm entry covers user-visible changes from proposal Capabilities
