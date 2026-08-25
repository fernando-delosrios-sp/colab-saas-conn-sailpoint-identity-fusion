## 1. Characterization test (red first)

- [x] 1.1 Create `src/model/__tests__/fusionLayers.refreshLookup.test.ts`. Configure `FusionAccount` with minimal `FusionConfig` (copy pattern from `defineService.test.ts` beforeAll).
- [x] 1.2 Build a test double or real `FusionRun` with 100+ queue entries; only 2 keys match a persisted fusion row's `previousAccountIds`.
- [x] 1.3 Spy on `queue.entries` — assert it is **not** called when exercising `processPreviousRunMatchedAccounts` path via public `addManagedAccountLayer` on a fusion account loaded from persisted attributes.
- [x] 1.4 Run test — expect RED (full scan still calls `entries`).

**Verify:** `npx vitest run src/model/__tests__/fusionLayers.refreshLookup.test.ts` fails for expected reason.

## 2. Implementation (green)

- [x] 2.1 In `src/model/fusionLayers.ts` `processPreviousRunMatchedAccounts`, replace `for (const [id, account] of queue.entries())` with union iteration over `previousAccountIds` and `missingAccountIds`; `const account = queue.get(id)`; `if (!account) continue`; preserve existing body verbatim.
- [x] 2.2 Update `onQueueScan` hook (if present from instrumentation package) to report union size instead of `queue.size`.
- [x] 2.3 Re-run characterization test — GREEN.

**Verify:** `npx vitest run src/model/__tests__/fusionLayers.refreshLookup.test.ts` exit 0.

## 3. Regression coverage

- [x] 3.1 Run existing fusion/account tests that cover managed-account layering: `npx vitest run src/services/accountAssembly/__tests__/accountAssembly.test.ts src/services/fusionService/__tests__/fusionService.aggregation.test.ts`
- [x] 3.2 Add case: key in both previous and missing sets blends once (no double `setManagedAccount`).

**Verify:** exit 0.

## 4. Verification

- [x] 4.1 `npm run typecheck`
- [x] 4.2 `npm run lint`
- [x] 4.3 Compare Refresh `queueEntriesScanned` / throughput on same tenant before and after (requires instrumentation package applied). Expect scanned count ≈ sum of previous+missing keys per account, not queue size × accounts.

## 5. Documentation

- [x] 5.1 Invoke **changelog-generator**. PATCH: Refresh managed-account re-blend uses targeted queue lookups instead of full queue scan. Update today's `CHANGELOG.md`.

## STOP conditions

- `queue.entries()` still called from `processPreviousRunMatchedAccounts` after implementation
- Blend/claim regression in 3.1
- Instrumentation shows no throughput improvement when queue >> keys — document and STOP before further changes in this package

## Suggested executor toolkit

- Apply only after `instrument-account-list-refresh` is DONE
- Use **tdd** section 1 → 2
