## 1. Types and accumulator (TDD)

- [x] 1.1 In `src/services/logService/operationRunContext.ts`, add exported type `RefreshPhaseMetrics` and bucket enum/union (`prelude`, `managedLayer`, `uniqueRegister`, `map`, `normalDefine`, `correlation`, `finalize`). Include workload fields: `definitionsEvaluated`, `definitionsSkipped`, `managedAccountsBlended`, `queueEntriesScanned`.
- [x] 1.2 Add methods on `OperationRunContext`: `resetRefreshMetrics()`, `recordRefreshSubStep(bucket, ms, workloadPatch?)`, `flushRefreshMetricsSummary(): Record<string, unknown> | undefined`. Guard all recordings with `this.phase === 'Refresh'`.
- [x] 1.3 In `src/services/logService/logService.ts`, add passthrough methods: `resetRefreshMetrics()`, `flushRefreshMetricsSummary()` delegating to `runContext`.
- [x] 1.4 In `src/services/logService/__tests__/operationRunContext.test.ts`, add tests: (a) recording ignored when phase is Process; (b) sums accumulate across multiple recordings; (c) flush returns undefined when `accountsProcessed === 0`; (d) flush shape includes `accounts`, `preludeMs`, `managedLayerMs`, `mapMs`, `normalDefineMs`.

**Verify:** `npx vitest run src/services/logService/__tests__/operationRunContext.test.ts` exit 0.

## 2. FusionService instrumentation

- [x] 2.1 Add `src/utils/measureMs.ts` with async/sync timing using `performance.now()`. Unit test optional (simple enough to skip if covered by integration test).
- [x] 2.2 In `FusionService.processFusionAccount`, wrap each major block with measure + `this.run.getTracker()` is wrong — use `this.log` run context: obtain via existing run/log wiring (`FusionService` has `this.log`). Call `recordRefreshSubStep` after each block. Increment `accountsProcessed` once per account at end when phase is Refresh.
- [x] 2.3 Extend `AccountAssembly.applyAttributeProcessing(fusionAccount, options?: { onSubStep?: (step: 'map' | 'normalDefine', ms: number) => void })`. Time `mapAttributes` and `refreshNormalAttributes` separately; invoke callback when provided.
- [x] 2.4 Pass `onSubStep` from `FusionService` to forward Map/Define ms to run context. In Define callback, also increment `definitionsEvaluated` from DefinitionService — **preferred:** add optional callback param to `refreshNormalAttributes` `(stats) => void` reporting `{ evaluated, skipped }` OR count definitions in wrapper by reading return from a package-private hook. **Minimal path:** increment `definitionsEvaluated` by `normalDefinitions.length` when Define runs, `definitionsSkipped` when `refreshNormalAttributes` returns early — document approximation in test; refine in optimize package if needed.
- [x] 2.5 In `FusionLayers.processPreviousRunMatchedAccounts`, before loop, if `options.onQueueScan` provided, call with `queue.size` (or entries examined count). Thread from `addManagedAccountLayer` options.

**Verify:** `npx vitest run src/services/fusionService/__tests__/fusionService.aggregation.test.ts src/services/accountAssembly/__tests__/accountAssembly.test.ts` exit 0 (add focused test if missing for onSubStep).

## 3. Refresh phase emission

- [x] 3.1 At start of `refreshPhase` in `accountListPhases.ts`, call `log.resetRefreshMetrics()` (ensure run context phase is Refresh — set via existing pipeline if needed).
- [x] 3.2 After `processFusionAccounts`, call `const summary = log.flushRefreshMetricsSummary()`; if defined, `log.detail({ action: 'refresh workload', ...summary })`.
- [x] 3.3 Add test in `src/operations/helpers/__tests__/accountListPhaseInstrumentation.test.ts` (or new file): mock fusion + log, run `refreshPhase`, assert DETAIL contains `refresh workload` and bucket ms keys when fusion returns one account.

**Verify:** `npx vitest run src/operations/helpers/__tests__/accountListPhaseInstrumentation.test.ts` exit 0.

## 4. Verification

- [x] 4.1 `npx vitest run src/services/logService/__tests__/operationRunContext.test.ts src/services/accountAssembly/__tests__/accountAssembly.test.ts src/operations/helpers/__tests__/accountListPhaseInstrumentation.test.ts`
- [x] 4.2 `npm run typecheck`
- [x] 4.3 `npm run lint`
- [x] 4.4 Automated stand-in for operator smoke: Refresh phase test asserts exactly one `DETAIL refresh workload` and only `METRIC refreshPhase.processFusionAccounts`; `processFusionAccounts` does not call `log.track` or `log.metric` per Fusion account; `processFusionAccount` records `mapMs`/`normalDefineMs` > 0 when Map and Define ran.

Expected: typecheck and lint exit 0.

## 5. Documentation

- [x] 5.1 Invoke **changelog-generator**. PATCH: Refresh phase logs aggregate sub-step workload summary for performance diagnosis. Merge into today's `CHANGELOG.md` section. No Unreleased heading.
- [x] 5.2 No use-guide changes unless troubleshooting doc references Refresh timing — skip unless already documenting STATUS lines.

**Verify:** `CHANGELOG.md` contains dated Improvements bullet.

## Suggested executor toolkit

- Use **tdd** for section 1 tests before section 2 wiring.
- Do not invoke optimize or index packages in same PR — this package is measurement-only.
