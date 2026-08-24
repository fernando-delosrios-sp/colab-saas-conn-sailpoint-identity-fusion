## 1. Characterization tests for serial dispatch (red)

- [x] 1.1 In `src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`, add `trackMaxConcurrentDispatch` using delayed `forms.createFusionForm` and/or `definitionService.registerUniqueValuesFromRecordManagedAccount` spies (same in-flight counter pattern as `trackMaxConcurrentScoring` at ~145). Seed `StdAccountList`, deferred matching **disabled**, reviewers present, `fusionEnableManualReview: true`, `fusionEnableAutoMerge: false` so identity-phase results become partial matches (or non-matches if no identity candidates — first-run empty identity pool yields non-match; prefer **partial** by stubbing `scoreFusionAccount` to attach a match above manual-review threshold if the existing tests already show how, otherwise use non-match + delay `registerFusionAccount` is sync — delay `createFusionForm` only when partial). Simplest reliable red: delay `forms.createFusionForm` after forcing partial matches the same way existing `'creates a form for a partial match'` test does.
- [x] 1.2 Add test **`overlaps identity-phase form dispatch up to fusion parallel cap`**: `managedAccountsBatchSize: 4`, 8 partial-match accounts, delayed `createFusionForm` (`setImmediate` or 5ms). Before the code change this fails: `maxInFlight === 1`. After green: `maxInFlight > 1` and `maxInFlight <= 4`, `result.partial === 8`.
- [x] 1.3 Add test **`caps identity-phase dispatch at 12 when batch size is 100`**: 20 non-match or partial accounts, `managedAccountsBatchSize` default/100. After green: `maxInFlight <= 12`. Delay the async outcome collaborator used (form or a spy on `dispatch` path). For non-match, wrap `run.registerFusionAccount` is sync — inject delay by stubbing `definitionService.refreshNormalAttributes`? That runs during scoring. Prefer delaying `forms.createFusionForm` for partial, or stub `handleNonMatch` collaborators. Practical approach: spy `forms.createFusionForm` for partial tests; for non-match-only, spy `log.setProgress` cannot show overlap. Use partial-match path for overlap tests.
- [x] 1.4 Add test **`does not overlap processFusionIdentityDecision for exact matches`**: two accounts that auto-merge (copy existing exact-match test setup; `fusionEnableAutoMerge: true` with scores at threshold). Delay `decisionProcessor.processFusionIdentityDecision` with a gate that records overlapping starts. Expect `maxInFlight === 1` **before and after** the change. If this test cannot be written because exact-match setup is too coupled, STOP and report — do not skip the serial requirement.
- [x] 1.5 Run `npx vitest run src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts` — new overlap test **fails** (maxInFlight 1); exact-match serial test **passes**; existing suite otherwise green.

**Verify**: overlap test fails for the right reason (serial `for` loop), not fixture bugs.

## 2. Parallel identity-phase dispatch (green)

- [x] 2.1 In `runMatchSweep` Dispatch mode, after `scoreIdentityPhase`, replace the `for (const scored of identityResults)` loop with `promiseAllBatched` from `../fusionService/collections`, concurrency `getFusionParallelBatchSize(this.deps.config)`. Import `getFusionParallelBatchSize` next to existing `promiseAllBatched` / `getScoringMaxConcurrency` imports in `matchOutcomeDispatcher.ts`.
- [x] 2.2 Worker must: `run.recordAnalysis(scored.analysis)`; `const resolved = await this.dispatchOutcome(scored)`; increment `processedCount`; `updateProgress()`; if `resolved`, push to `result.resolved` and `applyResolutionToSweepResult`. Preserve empty-`toScore` path. Do not change `runDeferredDrain` afterward.
- [x] 2.3 Remove `yieldDispatch` / `createLoopYielder` from this loop only (`promiseAllBatched` already yields). Leave `yieldPreScore` on the pre-score `for` loop.
- [x] 2.4 Add sweep-local exact-match serialisation: `let exactMatchTail = Promise.resolve()` inside `runMatchSweep` (not a class field). Route `handleExactMatch` work through that chain so a second call awaits the first (including rejection: `exactMatchTail = exactMatchTail.then(run, run)`). Keep `MatchOutcomeDispatcher` free of per-run fields (`match-outcome-dispatch` “does not hold mutable run-scoped state”).
- [x] 2.5 Re-run `npx vitest run src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts` — overlap tests pass; exact-match serial test still `maxInFlight === 1`; existing tests including `processes a large batch when scoring concurrency is capped`, `defaults identity scoring concurrency to 12`, `drains deferred candidates sequentially within a source`, and `lets timers run while sweeping a large account set` still pass.

**Verify**: `npx vitest run src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts` exit 0.

## 3. Guard scoring and deferred drain

- [x] 3.1 Confirm `scoreIdentityPhase` still uses `max(1, min(batchSize, getScoringMaxConcurrency(config)))` — no edits unless an import shuffle requires it.
- [x] 3.2 Confirm `runDeferredDrainForSource` still `for`s pending accounts one-at-a-time. Add a comment only if the dispatch change makes it easy to “also batch the drain”; otherwise no comment.
- [x] 3.3 Re-run deferred sequential test in the same file.

**Verify**: deferred sequential test still asserts sequential deferred **scoring**; do not weaken it.

## 4. Verification

- [x] 4.1 `npx vitest run src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`
- [x] 4.2 `npm run typecheck`
- [x] 4.3 `npm run lint` (do not pipe to `tail`)
- [x] 4.4 `git diff --stat` shows no edits under `src/services/matchingService/matchingService.ts`, `preScoreGate.ts`, `fusionService.ts`, `src/data/config/internal/fusionService.ts`

Expected: typecheck and lint exit 0; only in-scope files plus changelog/docs as listed in design.

## 5. Documentation

- [x] 5.1 If `docs/operations/account-list.md` or `docs/reference/match-flow.md` states that uncorrelated managed accounts are processed strictly sequentially after scoring, update that sentence to: identity-phase **outcomes** may overlap up to the Fusion parallel batch cap; deferred drain stays sequential per source; scoring cap unchanged. If those pages only describe match routing (authoritative / record / orphan), leave them.
- [x] 5.2 Do not add a new developer setting to connector-spec or use-guides.

**Verify**: `npm run lint:markdown` if any `docs/**/*.md` changed; otherwise skip.

## 6. Changelog

- [x] 6.1 Use the **changelog-generator** skill. PATCH-class improvement: uncorrelated-sweep identity-phase outcomes (review forms / non-matches) overlap within the existing Fusion parallel batch cap (default 12); automatic merges stay serial. No migration. Merge into today’s `CHANGELOG.md` date section; no Unreleased heading.

**Verify**: `CHANGELOG.md` has a dated section (not Unreleased) describing operator-visible duration improvement without promising a new config key.
