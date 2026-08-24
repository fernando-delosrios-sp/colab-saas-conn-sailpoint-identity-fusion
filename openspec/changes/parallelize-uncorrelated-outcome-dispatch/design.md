## Context

Planned at git `14fa792` (2026-08-24). Drift check before apply:

```bash
git diff --stat 14fa792..HEAD -- \
  src/services/matchingService/matchOutcomeDispatcher.ts \
  src/services/fusionService/collections.ts \
  src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts \
  openspec/specs/matching-service/match-outcome-dispatch/spec.md
```

If those excerpts no longer match, STOP.

Account-list Process order (living `fusion-service` + `account-list-operation`): managed-account init → correlated sweep → record unique registration → **uncorrelated sweep** → disable drain → form reconcile.

Uncorrelated sweep entry:

```1345:1360:src/services/fusionService/fusionService.ts
    public async processUncorrelatedManagedAccounts(): Promise<{ processed: number; matchScoringMs: number }> {
        this.ensureManagedAccountProcessingInitialized()
        const map = this.run.managedAccountsById
        const queuedAccounts = [...map.values()]
        // ...
        const processed = await this.runUncorrelatedManagedAccountSweep(
            queuedAccounts,
            this.run.managedAccountProcessingBatchSize,
            this.run.managedAccountProcessingBatchSize
        )
```

(`runUncorrelatedManagedAccountSweep` is `dispatcher.runMatchSweep(queuedAccounts, batchSize)`.)

After identity scoring, dispatch is serial today:

```665:676:src/services/matchingService/matchOutcomeDispatcher.ts
            const yieldDispatch = createLoopYielder(getManagedAccountEventLoopYieldEvery(this.deps.config))
            for (const scored of identityResults) {
                run.recordAnalysis(scored.analysis)
                const resolved = await this.dispatchOutcome(scored)
                await yieldDispatch()
                processedCount++
                updateProgress()
                if (resolved) {
                    result.resolved.push(resolved)
                    applyResolutionToSweepResult(this.deps.log, result, resolved.resolution)
                }
            }
```

Identity scoring is already batched:

```189:195:src/services/matchingService/matchOutcomeDispatcher.ts
    for (let i = 0; i < accounts.length; i += batchSize) {
        const batch = accounts.slice(i, i + batchSize)
        const identityAnalyses = await promiseAllBatched(
            batch,
            (account) => scoreIdentityCandidates(account, deps, maxCandidatesForForm),
            scoringConcurrency
        )
```

`promiseAllBatched` / fusion cap (reuse, do not fork a third helper):

```39:54:src/services/fusionService/collections.ts
export async function promiseAllBatched<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    batchSize: number = 50,
    onBatchComplete?: (processed: number, total: number) => void
): Promise<R[]> {
    // ...
        results.push(...(await Promise.all(batch.map(fn))))
        await yieldToEventLoop()
```

```115:118:src/services/fusionService/collections.ts
export function getFusionParallelBatchSize(config: FusionConfig): number {
    return Math.max(1, Math.min(getManagedAccountsBatchSize(config), 12))
}
```

Exact-match path (must stay single-flight):

```819:833:src/services/matchingService/matchOutcomeDispatcher.ts
    private async handleExactMatch(
        fusionAccount: FusionAccount,
        account: Account,
        identityId: string
    ): Promise<FusionAccount | undefined> {
        this.deps.run.removeMatchAccount(fusionAccount.managedAccountId)
        // ...
        this.deps.run.markAutoMerged(identityId)
        const syntheticDecision = this.deps.forms.createAutomaticMergeDecision(fusionAccount, account, identityId)
        this.deps.forms.registerFinishedDecision(syntheticDecision)
        return this.deps.decisionProcessor.processFusionIdentityDecision(syntheticDecision)
    }
```

Partial-match path (may overlap; unique form names per account):

```835:862:src/services/matchingService/matchOutcomeDispatcher.ts
    private async applyPartialMatchFormOutcome(/* ... */): Promise<void> {
        const outcome = await this.deps.forms.createFusionForm(fusionAccount, reviewers)
        // ...
    }
```

Living constraints the executor must not reopen:

- `matching-service/match-outcome-dispatch`: `runMatchSweep` is the only public sweep verb; FusionService calls it **once** for the uncorrelated queue; deferred drain **sequential within source**.
- Same spec: `MatchOutcomeDispatcher` SHALL NOT hold per-run caches — the exact-match gate is a **local** in `runMatchSweep`, not `this.exactMatchGate`.
- `client-service`: all ISC HTTP still goes through `ApiQueue` (rate window + `maxConcurrentRequests`). Overlapping `createFusionForm` is correct; bypassing the queue is not.
- Ubiquitous language: **Match outcome dispatch**, **Uncorrelated**, **Correlated account sweep** (not this STEP). Do not say `ManagedAccountMatchingRunner`.

Repo conventions: Vitest `*.test.ts` beside code; 4-space indent, single quotes, no semicolons (Prettier). `_` prefix only for unused bindings. Private members use TypeScript `private`, not `_` prefix. Exemplar for concurrency tests: `trackMaxConcurrentScoring` in `matchOutcomeDispatcher.test.ts` (~145–157).

Commands:

| Purpose | Command | Success |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | exit 0 |
| Targeted tests | `npx vitest run src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 |

Do not pipe `npm test` / vitest to `tail` (AGENTS.md).

## Goals / Non-Goals

**Goals**

- Identity-phase `dispatchOutcome` for `identityResults` overlaps up to `getFusionParallelBatchSize`.
- Exact-match application remains one-in-flight for the duration of one `runMatchSweep` Dispatch-mode invocation.
- `processed` / resolution counts / `resolved[]` membership unchanged aside from ordering of `resolved` (order need not match input order; counts must).
- Heartbeat `analyzed` progress still advances; event loop still yields between dispatch batches.

**Non-Goals**

- Changing scoring, trigram, `scoreIdentityPhase` batching, or `scoringMaxConcurrency`.
- Parallel deferred drain within a source.
- Parallel pre-score gate.
- Splitting `assembleManagedAccount` (Map/Define) from scoring.
- New developer settings or using `concurrency.uncorrelatedAccounts`.
- Editing `FusionService` besides accidental unused-arg cleanup (out of scope even if tempting).

## Decisions

1. Replace the identity-results `for`+`yieldDispatch` loop with `promiseAllBatched(identityResults, worker, getFusionParallelBatchSize(this.deps.config), onSlice)`. Worker: `recordAnalysis` → `dispatchOutcome` → increment `processedCount` → `updateProgress` → push resolved + `applyResolutionToSweepResult`. `promiseAllBatched` already yields per slice; do not keep `createLoopYielder` on this loop (double yield is harmless but redundant — drop the yielder here).
2. Exact-match gate: inside `runMatchSweep` (Dispatch mode), create `let exactMatchTail = Promise.resolve()`. Wrap the body of `handleExactMatch` so callers await `exactMatchTail = exactMatchTail.then(() => originalBody(), () => originalBody())` (always continue the chain after failure). Implementation options that stay stateless on the class: (a) pass a `runExactMatch(fn)` closure into `autoMergeCallbacks()` for this sweep only, or (b) a local `ExactMatchSerial` object passed through `dispatchOutcome` / callbacks. Do **not** assign `this.*Gate`.
3. `result.resolved.push` under concurrency: push from the worker after `await dispatchOutcome` — insertion order follows completion order, not input order. Spec this as allowed. Do not build a sparse array unless tests currently assert resolved order (they should not; if a test does, update that test and STOP if production code sorts by it).
4. `applyResolutionToSweepResult` mutates counters — call it in the worker after each result; increments are synchronous and safe between awaits.

## Scope

**In scope**

- `src/services/matchingService/matchOutcomeDispatcher.ts`
- `src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`
- `openspec/specs/matching-service/match-outcome-dispatch/spec.md` (via this change’s delta; archive sync is not apply)
- `CHANGELOG.md` via changelog-generator after implementation
- Docs only if a use-guide currently claims uncorrelated dispatch is strictly sequential (today `docs/operations/account-list.md` describes matching flow, not dispatch concurrency — leave it unless a sentence becomes false)

**Out of scope**

- `src/services/matchingService/matchingService.ts` and scoring helpers
- `runDeferredDrain` / `runDeferredDrainForSource` / `scoreDeferredForAccount`
- `preScoreGate.ts` sequential loop
- `src/services/fusionService/fusionService.ts`
- `src/data/config/internal/fusionService.ts` (`uncorrelatedAccounts: 500`)
- FormService internals (`createFusionForm` already `Promise.allSettled` per reviewer)
- Analysis-only `runAnalysisOnly` (no `dispatchOutcome`)

## STOP conditions

- Identity-results loop at planned SHA no longer matches the excerpt (already parallel, or scoring mixed back into dispatch).
- Making this work appears to require parallel deferred drain or changing `scoringMaxConcurrency`.
- Tests show two `processFusionIdentityDecision` overlapping in time for exact matches (gate failed).
- `createFusionForm` or decision HTTP is invoked without going through existing FormService/ClientService (queue bypass).
- Executor feels they must add a connector-spec knob — STOP and report; this change uses existing `managedAccountsBatchSize` via `getFusionParallelBatchSize`.

## Git workflow

- Branch: `perf/parallelize-uncorrelated-outcome-dispatch` (or current change branch if already on one).
- Commits: conventional, e.g. `perf(matching): overlap identity-phase outcome dispatch`. Recent style: `perf(fetch): yield during bulk cache ingest`.
- Do not push or open a PR unless the operator asks.

## Risks / Trade-offs / Maintenance

- Reviewer must confirm exact-match gate: overlapping `processFusionIdentityDecision` is the failure mode.
- `resolved[]` order may change; downstream account-list does not depend on it (progress is counts).
- Follow-up: Map/Define concurrency vs scoring cap; deferred-drain dispatch is intentionally serial.
- `concurrency.uncorrelatedAccounts` remains dead; do not “fix” it here (knip may still see it via `FusionConfig` typing — leave it).
