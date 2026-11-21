## 1. Bulk Ingest Shadow Identity Stripping & Unconditional Attribute Interning

- [x] 1.1 Update `slimManagedAccountForWorkQueue()` in `src/services/sourceService/managedAccountFetcher.ts` to omit `identityId` and `identity` when `account.uncorrelated === true`, and omit `modified` when `source.sourceType === SourceType.Record`
- [x] 1.2 Update `toManagedAccountInfo()`, `toRetainedAccount()`, and `FusionRun.setManagedAccount()` in `src/model/fusionRun.ts` so `identityId` is omitted and `managedAccountsByIdentityId` is not populated when `account.uncorrelated === true`
- [x] 1.3 Update `createAttributeBagPruner()` in `src/services/sourceService/referencedAttributeSet.ts` to always rebuild and intern `account.attributes` via the shared hidden-class shape factory even when all attribute keys are present in `referencedAttributeSet`
- [x] 1.4 Add and update unit tests in `src/services/sourceService/__tests__/attributePruning.test.ts` and `src/model/__tests__/fusionRun.test.ts` covering uncorrelated shadow `identityId` omission, Record-source `modified` omission, and unconditional attribute bag rebuilding/interning

## 2. Per-Block Memory Reclamation in `CompressedBlockMap`

- [x] 2.1 Track live slot counts per block (`blockLiveCounts: number[]`) in `src/model/compressedBlockMap.ts` and release `sealedBlocks[blockIndex]` (replacing with an empty `Buffer` and evicting `blockIndex` from `lruCache`) immediately when a sealed block's live slot count reaches `0` on `delete()` or overwrite in `set()`
- [x] 2.2 Add unit tests in `src/model/__tests__/compressedBlockMap.test.ts` verifying that deleting all keys in one sealed block frees that block's buffer and LRU entry while later blocks remain readable

## 3. Bounded Chunk Streaming for Record Unique Registration and Correlated Sweep

- [x] 3.1 Update `FusionService.processRecordUniqueRegistration()` in `src/services/fusionService/fusionService.ts` to return `{ registered: 0 }` without iterating `run.managedAccountsById` when no configured `SourceType.Record` source has Match scoring disabled, and otherwise stream eligible accounts in bounded `4,096`-account chunks
- [x] 3.2 Update `FusionService.runCorrelatedAccountSweep()` in `src/services/fusionService/fusionService.ts` to stream remaining `uncorrelated === false` accounts in bounded `4,096`-account chunks rather than materializing a single `correlatedAccounts` array
- [x] 3.3 Add unit tests in `src/services/fusionService/__tests__/fusionService.aggregation.test.ts` verifying `processRecordUniqueRegistration()` short-circuiting and chunked streaming, and `processCorrelatedManagedAccounts()` chunked streaming

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test && npm run lint`
- [x] 4.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)

## 5. Documentation

- [x] 5.1 Update inline JSDoc comments in `src/model/compressedBlockMap.ts`, `src/model/fusionRun.ts`, `src/services/sourceService/managedAccountFetcher.ts`, `src/services/sourceService/referencedAttributeSet.ts`, and `src/services/fusionService/fusionService.ts` to reflect shadow identity omission, unconditional attribute bag interning, per-block reclamation, and chunked sweeps (no user-facing MkDocs or README changes required)

## 6. Changelog

- [x] 6.1 Create or update `CHANGELOG.md` entry under the current `package.json` version via `changelog-generator`
- [x] 6.2 Confirm entry covers the memory optimizations from proposal Capabilities
