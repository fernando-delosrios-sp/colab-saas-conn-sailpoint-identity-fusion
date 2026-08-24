## Context

Planned at git `f45c75e` (2026-08-24). Drift check (run first):

```bash
git diff --stat f45c75e..HEAD -- \
  src/services/definitionService/definitionService.ts \
  src/services/matchingService/preScoreGate.ts \
  src/services/matchingService/matchOutcomeDispatcher.ts \
  src/services/fusionService/fusionService.ts \
  src/services/fusionService/collections.ts \
  src/operations/helpers/accountListPhases.ts
```

If any of those files disagree with the excerpts below, STOP.

Working tree at plan time also had unrelated dirty files (`src/services/logService/operationHeartbeat.ts`, `connector-spec.json`, docs/tune-api-performance, etc.). Do not stage or “fix” them as part of this change.

### Why Process phase still dominates after recent perf work

Already landed (do not redo):

- Map/Define hot path (`speed-up-map-define-hot-path`, archived 2026-08-24)
- Uncorrelated identity-phase outcome `promiseAllBatched` with exact-match single-flight (`parallelize-uncorrelated-outcome-dispatch`)
- Event-loop yield during bulk promise resolution / managed-account sweep

Still serial or host-log bound on Process:

### Record unique registration today

`src/services/definitionService/definitionService.ts`:

```283:318:src/services/definitionService/definitionService.ts
    public async registerUniqueValuesFromRecordManagedAccount(
        account: Account,
        mappingService: MappingService,
        run: FusionRun
    ): Promise<void> {
        const fusionAccount = FusionAccount.fromManagedAccount(account)
        mappingService.mapAttributes(fusionAccount, run, {
            onlyTargets: this.registrationPlan.mapTargets,
        })
        await this.registerUniqueAttributes(fusionAccount)
    }

    public async registerUniqueValuesFromRecordManagedAccounts(
        accounts: Account[],
        mappingService: MappingService,
        run: FusionRun,
        options?: RecordUniqueRegistrationProgress
    ): Promise<number> {
        // ...
        let done = 0
        for (const account of accounts) {
            await this.registerUniqueValuesFromRecordManagedAccount(account, mappingService, run)
            done++
            options?.onProgress?.(done, accounts.length)
            if (done % 50 === 0) {
                await yieldToEventLoop()
            }
        }
        return done
    }
```

Caller: `FusionService.processRecordUniqueRegistration` (`fusionService.ts` ~1287–1330) then `run.claimAccount` for each eligible. Keep claim-after-register on the FusionService side (queue ownership). Do not parallelize `claimAccount` in a way that races with other Process steps — registration completes before claims if you keep the current “register all, then claim all” structure. If the current code claims inside the same method after the loop, preserve that order: **all registrations finish, then all claims** (today claims are a second loop after register). Read the live method and match it.

`registerUniqueAttributes` already uses `locks.withLock(\`unique:${definition.name}\`)` per value. Concurrent registration is safe if that lock remains.

Batch helper already exists:

```39:53:src/services/fusionService/collections.ts
export async function promiseAllBatched<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    batchSize: number = 50,
    onBatchComplete?: (processed: number, total: number) => void
): Promise<R[]> {
    // Promise.all per slice, then yieldToEventLoop()
}
```

```115:118:src/services/fusionService/collections.ts
export function getFusionParallelBatchSize(config: FusionConfig): number {
    return Math.max(1, Math.min(getManagedAccountsBatchSize(config), 12))
}
```

Honor `definition-service`: registration plan (mapTargets vs passthrough); no Normal/Unique Velocity on this path; skip missing values.

Prefer importing `promiseAllBatched` + `getFusionParallelBatchSize` from `../fusionService/collections` (same as `matchOutcomeDispatcher`). If apply-time lint/knip forbids definitionService → fusionService, copy a **local** batch loop into `definitionService.ts` (do not relocate `collections.ts`).

Progress: `onProgress` may fire per account (keep) or per batch (acceptable if tests only assert final registered count). Heartbeat `setProgress(done, total, 'registered')` is wired from FusionService `onProgress` — keep monotonic `done`.

### Correlated sweep + pre-score today

```729:750:src/services/fusionService/fusionService.ts
    private async runCorrelatedAccountSweep(map: Map<string, Account>): Promise<void> {
        const correlatedAccounts = [...map.values()].filter((a) => a.uncorrelated === false)
        // ...
        await batchProcess(
            correlatedAccounts,
            'Correlated managed accounts',
            (account) => this.processManagedAccount(account),
            ...
            this.run.managedAccountProcessingBatchSize
        )
    }
```

```807:809:src/services/fusionService/fusionService.ts
    public async processManagedAccount(account: Account): Promise<FusionAccount | undefined> {
        const result = await this.dispatcher.runMatchSweep([account], 1)
        return result.resolved[0]?.fusionAccount
    }
```

Do **not** change that 1-account sweep contract.

`src/services/matchingService/preScoreGate.ts`:

```32:38:src/services/matchingService/preScoreGate.ts
    if (callbacks.isCorrelatedManagedAccountLinkedInFusion(account)) {
        log.info(
            `Dropping managed account already linked in Fusion from work queue: ${account.name} ...`
        )
        run.claimAccount(managedAccountKey!, account.identityId)
        return { action: 'skip-linked' }
    }
```

```61:64:src/services/matchingService/preScoreGate.ts
    if (account.uncorrelated === false) {
        log.info(
            `Correlated managed account not linked to Fusion; treating as non-match: ${account.name} ...`
        )
```

Replace those INFO calls. Keep claim/assemble/handleNonMatch control flow.

After `runCorrelatedAccountSweep`, add `log.detail({ action: 'correlated account sweep complete', droppedLinked: <count>, remaining: map.size })` or equivalent fields on the existing STEP END if `accountListPhases` already logs `remaining`. Count dropped-linked as `correlatedAccounts.length - processedNonSkip` **or** `initialCorrelatedCount - remainingCorrelatedOnQueue` — pick one definition, test it, document in the DETAIL keys. Prefer: `droppedLinked` = number of skip-linked outcomes in this sweep (not including correlated-orphan non-matches).

Honor `account-list-operation`: no per-account INFO for match/correlation-class messages; warn/error for failures stay.

### Repo conventions

- Tests: Vitest, `*.test.ts` beside code; `vi.fn` mocks as in `recordUniqueRegistration.test.ts`
- Logging: `log.detail({ key: value })` for aggregates (renders `DETAIL` INFO line); `log.debug` for per-account traces
- Do not use `_` prefix except unused vars
- Prettier: 4-space, single quotes, no semicolons
- Skills for executor: **tdd**; **changelog-generator** at the end. Do **not** invoke apply-code-changes from inside apply.

## Goals / Non-Goals

**Goals**

- Record unique registration wall-clock overlaps Map work up to fusion parallel cap
- Correlated skip-linked / correlated-orphan do not emit INFO per account
- One aggregate DETAIL (or STEP END) for correlated sweep drop counts
- Registered unique sets and work-queue claims match serial behavior

**Non-Goals**

- Faster Unique generation on Output
- Changing correlated sweep to a single batched `runMatchSweep`
- Raising scoring concurrency defaults
- Fetch pagination, API queue, heartbeat interval (dirty tree)

## Decisions

See `discovery.md`. Batch size = `getFusionParallelBatchSize`. Skip-linked: no per-account INFO/DETAIL.

## Risks / Trade-offs

- Parallel record registration can convoy on a single hot unique attribute lock — still better than serial Map; do not add a second lock scheme.
- `onProgress` ordering may not be strictly +1 if you count in `onBatchComplete` only — heartbeat may jump by batch size. Acceptable. Do not lose `registered` unit.
- Removing INFO may surprise operators grepping “Dropping managed account” — changelog + operations doc if that string is documented.

## Migration Plan

None.

## Open Questions

None.

## STOP conditions

Stop and report if:

- Live code at the cited methods no longer matches these excerpts (drift).
- Unique registration is already batched (package is obsolete).
- Parallelizing registration requires changing `registerUniqueAttributes` lock semantics or dropping locks.
- Correlated path no longer calls `runMatchSweep([account], 1)` (do not “fix” by batching correlated into one sweep).
- Tests for record unique registration or pre-score cannot be made green without touching out-of-scope Unique generation.
- Layering/knip requires moving `collections.ts` — do not move it; use a local batch loop instead.
