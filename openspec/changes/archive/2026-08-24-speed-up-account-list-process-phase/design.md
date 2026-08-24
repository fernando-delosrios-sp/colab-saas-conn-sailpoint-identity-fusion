## Context

Planned at git `eeb22de` (2026-08-24). Drift check (run first):

```bash
git diff --stat eeb22de..HEAD -- \
  src/services/definitionService/definitionService.ts \
  src/services/matchingService/preScoreGate.ts \
  src/services/matchingService/matchOutcomeDispatcher.ts \
  src/services/fusionService/fusionService.ts \
  src/services/fusionService/collections.ts \
  src/operations/helpers/accountListPhases.ts
```

If any of those files disagree with the excerpts below, STOP.

Working tree at this revision is clean. Do not invent a “dirty heartbeat / API-tuning files” exclusion.

### Already landed (do not redo)

- Map/Define hot path (`speed-up-map-define-hot-path`)
- Uncorrelated identity-phase outcome `promiseAllBatched` with exact-match single-flight
- Event-loop yield during bulk promise resolution / managed-account sweep
- Output `processOutputBatch` already `Promise.all`s `refreshUniqueAttributes` then `getISCAccount`

### Record unique registration today

```283:318:src/services/definitionService/definitionService.ts
    public async registerUniqueValuesFromRecordManagedAccount(...)
    public async registerUniqueValuesFromRecordManagedAccounts(...) {
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

Caller: `FusionService.processRecordUniqueRegistration` then `run.claimAccount` for each eligible. Keep **all registrations finish, then all claims** if that is still the live structure. Read the live method and match it.

`registerUniqueAttributes` already uses `locks.withLock(\`unique:${definition.name}\`)`. Concurrent registration is safe if that lock remains.

Batch helper: `promiseAllBatched` + `getFusionParallelBatchSize` in `src/services/fusionService/collections.ts` (cap 12). Prefer importing those from definitionService (same as matchOutcomeDispatcher). If lint/knip forbids definitionService → fusionService, copy a **local** batch loop; do not relocate `collections.ts`.

### Correlated sweep + pre-score today

`runCorrelatedAccountSweep` filters `uncorrelated === false` and `batchProcess` → `processManagedAccount` → `dispatcher.runMatchSweep([account], 1)`. **Do not** change that 1-account sweep contract.

`src/services/matchingService/preScoreGate.ts` (~32–38 skip-linked, ~61–64 correlated-orphan) emits `log.info` with the account name. Remove those INFO calls. Keep claim / assemble / handleNonMatch control flow.

After the sweep, `log.detail({ action: 'correlated account sweep complete', droppedLinked, remaining: map.size })` (or STEP END fields). `droppedLinked` = skip-linked outcomes only, not correlated-orphan non-matches.

### Unique generation today (Output JIT)

`forEachISCAccount` / `processOutputBatch` (`fusionService.ts` ~884–908):

```884:896:src/services/fusionService/fusionService.ts
        const outputBatch = await Promise.all(
            batch.map(async (account) => {
                if (refreshUniqueAttributes && account.needsRefresh) {
                    await this.definitionService.refreshUniqueAttributes(account)
                }
                return this.getISCAccount(account, false)
            })
        )
```

Keep Unique generation **here**, immediately before serialize. Do not move it into Process.

`generateUniqueAttributeValue` (`definitionService.ts` ~808–837) holds `unique:${definition.name}` for the whole `generateWithIncrementalCounter` / `generateWithCollisionDisambiguation` body, including `evaluateAttributeTemplate` and debug string builds.

```808:837:src/services/definitionService/definitionService.ts
        const lockKey = `unique:${definition.name}`
        return await this.locks.withLock(lockKey, async () => {
            const registeredValues = this.getUniqueValues(definition.name)
            // Velocity + collision loop entirely inside the lock
        })
```

Target shape (executor may name helpers):

1. Preserve / identity / display short-circuits in `processUniqueDefinition` stay as they are (no generation).
2. For generation: loop up to `maxAttempts`:
   - Set `context.counter` / `context.UUID` as today (`$counter` empty string on first collision-strategy attempt).
   - `evaluateAttributeTemplate` **outside** `unique:${name}`.
   - `withLock('unique:${name}')` only: if `!registeredValues.has(strValue)` then `add` and return value; else indicate collision.
   - On collision, bump counter or new UUID (same as today’s loop) and retry.
3. Incremental `counterFn()` remains the existing counter lock (`stateWrapper.getCounter`). Do not hold `unique:${name}` while awaiting `counterFn()` if that nests two long critical sections. Snapshot the counter value, evaluate outside unique lock, then unique-lock insert.
4. Exhausting `maxAttempts` still logs error and returns undefined (same as today).
5. Gate `log.debug` interpolations that stringify values on Unique generate/collision the same way Map/Define gated debug (only when log level is debug). Do not wrap `log.error`.
6. Do not change lock **keys**. Do not drop uniqueness. Two concurrent Output-batch accounts generating the same attribute must still not both keep the same value.

Honor `definition-service` collision / UUID / incremental scenarios and `fusion-service` JIT-on-output / dry-run in-memory counters.

Existing tests to keep green: `defineService.test.ts` unique generation, preservation, collision; `recordUniqueRegistration.test.ts`.

### Repo conventions

- Tests: Vitest, `*.test.ts` beside code
- Logging: `log.detail({ key: value })` for aggregates; `log.debug` for per-account traces
- Prettier: 4-space, single quotes, no semicolons
- Skills: **tdd**; **changelog-generator** at the end. Do **not** invoke apply-code-changes from inside apply.

## Goals / Non-Goals

**Goals**

- Record unique registration overlaps Map work up to fusion parallel cap
- Correlated skip-linked / correlated-orphan do not emit INFO per account
- One aggregate DETAIL (or STEP END) for correlated sweep drop counts
- Unique Velocity does not run under the unique registry lock
- Concurrent Output-batch Unique generation still yields unique registered values
- JIT Unique generation remains immediately before Output serialize

**Non-Goals**

- Generating Unique during Process
- Changing correlated sweep to a single batched `runMatchSweep`
- Raising scoring or Output batch defaults / new connector-spec keys
- Fetch pagination, API queue, heartbeat interval
- Relocating `collections.ts`

## Decisions

See `discovery.md`. Unique registry lock = membership only. Output batch size unchanged.

## Risks / Trade-offs

- Parallel record registration can convoy on one hot unique-attribute lock — still better than serial Map.
- Eval-outside-lock then insert is a check-then-act that **must** re-check under the lock (do not add to the set outside the lock).
- Incremental counters: two accounts may increment then both collide on insert; retry must still be unique. Do not skip `has` after increment.
- Removing skip-linked INFO may surprise greps of “Dropping managed account” — changelog; operations doc only if that string is documented.

## Migration Plan

None.

## Open Questions

None.

## STOP conditions

Stop and report if:

- Live code at the cited methods no longer matches these excerpts (drift).
- Unique registration is already batched **and** Unique generation already evaluates outside the registry lock (package obsolete).
- Parallelizing registration or shrinking the Unique lock requires dropping uniqueness or changing lock **keys**.
- Correlated path no longer calls `runMatchSweep([account], 1)` (do not “fix” by batching correlated into one sweep).
- Making Unique faster appears to require generating Unique before Output or calling `listISCAccounts` on the account-list path.
- Layering/knip requires moving `collections.ts` — do not move it; use a local batch loop instead.
