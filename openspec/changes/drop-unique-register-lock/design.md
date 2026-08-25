## Context

Planned at git `e935b41` (2026-08-25). Drift check (run first):

```bash
git diff --stat e935b41..HEAD -- \
  src/services/definitionService/definitionService.ts \
  src/services/definitionService/__tests__/recordUniqueRegistration.test.ts \
  src/services/definitionService/__tests__/defineService.test.ts \
  src/services/lockService.ts \
  src/services/fusionService/fusionService.ts \
  openspec/specs/definition-service/spec.md
```

If excerpts below no longer match, STOP.

Independent of open change `honor-managed-account-refresh-threshold` (that fix is `needsRefresh` timestamps). This package does not depend on it.

Already landed (do not redo): Unique Velocity outside the registry lock — `openspec/specs/definition-service/spec.md` requirement **Unique generation holds the unique registry lock only for membership check and insert**; `tryRegisterUniqueValue` at `definitionService.ts:870-876`.

### Hot path today

Refresh always registers uniques unless reset:

```518:523:src/services/fusionService/fusionService.ts
        const uniqueRegisterMs = await measureMs(async () => {
            if (!resetDefinition) {
                await this.definitionService.registerUniqueAttributes(fusionAccount)
            }
        })
        this.log.recordRefreshSubStep('uniqueRegister', uniqueRegisterMs)
```

```280:296:src/services/definitionService/definitionService.ts
    public async registerUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        this.log.debug(`Registering unique attributes for account: ${fusionAccount.managedKey}`)

        for (const definition of this.uniqueDefinitions) {
            const value = fusionAccount.attributes[definition.name]
            if (missing(value)) continue

            const valueStr = String(value)
            const lockKey = `unique:${definition.name}`
            await this.locks.withLock(lockKey, async () => {
                assert(
                    this.uniqueDefinitionByName.has(definition.name),
                    `Attribute ${definition.name} not found in unique attribute definition config`
                )
                this.getUniqueValues(definition.name).add(valueStr)
            })
        }
    }
```

`InMemoryLockService.withLock` always `await`s the previous queue promise (`src/services/lockService.ts:13-34`), even when `fn` only does `Set.add`.

### Why the lock is not required for this method

1. **No check-then-act.** Register does not `has` then decide; it only `add`. Duplicates are idempotent on `Set`.
2. **No `await` inside the mutation.** After this change the loop must stay synchronous so `getUniqueValues` lazy-create (`definitionService.ts:85-91`) cannot interleave two empty-map inits on the same tick.
3. **Generation keeps the lock** for has-then-add:

```870:876:src/services/definitionService/definitionService.ts
    private async tryRegisterUniqueValue(definitionName: string, strValue: string): Promise<boolean> {
        return this.locks.withLock(`unique:${definitionName}`, async () => {
            const registeredValues = this.getUniqueValues(definitionName)
            if (registeredValues.has(strValue)) return false
            registeredValues.add(strValue)
            return true
        })
    }
```

4. **Precedent:** preserving an existing Unique value on refresh already adds without the unique lock:

```809:811:src/services/definitionService/definitionService.ts
            if (hasValue && !fusionAccount.needsReset) {
                const valueStr = String(existingValue)
                this.getUniqueValues(name).add(valueStr)
```

`registerExistingValues` (`definitionService.ts:357-364`) also bulk-adds without that lock.

### Spec to reopen

Canonical `openspec/specs/definition-service/spec.md` requirement **Record unique registration processes accounts in bounded parallel batches** (line ~333) currently:

- Body: “Unique-set mutations SHALL remain serialized per unique attribute name using the existing unique-attribute lock.”
- Scenario **Unique-set writes remain lock-serialized per attribute name**: both registration attempts SHALL enter the per-name unique lock.

That came from archived `2026-08-24-speed-up-account-list-process-phase` (parallel record registration kept the lock “so concurrent registration is safe”). Reopen: lock is for generation check-then-add, not for inserting known values.

Keep: parallel batches, same set members as a serial walk, skip missing values, Velocity not on this path.

### Exemplar tests

- `src/services/definitionService/__tests__/recordUniqueRegistration.test.ts` — 25 accounts / batch 12; distinct values from two accounts. `mockLocks.withLock` currently always runs `fn()`. After the change, spy: `registerUniqueAttributes` / record registration MUST NOT call `withLock` with keys starting `unique:`.
- `src/services/definitionService/__tests__/defineService.test.ts` — `does not hold unique:${name} during evaluateAttributeTemplate` and `two concurrent refreshUniqueAttributes calls... store distinct values` must still pass (generation lock).

### Repo conventions

- Prettier: 120 char, 4-space, single quotes, no semicolons.
- Vitest globals; `_` only for unused.
- `npx vitest run <file>` — do not pipe to `tail`.
- `npm run typecheck`, `npm run lint`. Node 24.
- Commits: e.g. `perf(definition): evaluate Unique Velocity outside the unique registry lock`.
- **tdd** then **changelog-generator**. PATCH under `## 2026-08-25 · v2.2.0` Improvements. No Unreleased.

## Goals / Non-Goals

**Goals:**

- `registerUniqueAttributes` does not await `unique:${name}`.
- Parallel record unique registration still registers the same values.
- New Unique generation remains collision-safe under `tryRegisterUniqueValue`.

**Non-Goals:**

- Removing `unregisterUniqueAttributes` lock.
- Changing `tryRegisterUniqueValue` or Velocity-outside-lock.
- Skipping `registerUniqueAttributes` on Refresh when `needsRefresh` is false (would miss registry population for later generation).
- Worker-thread / `Atomics` unique sets.

## Decisions

### D1: Drop lock only on existing-value insert

**Choice:** In `registerUniqueAttributes`, keep the debug log, `missing` skip, and `assert`; call `this.getUniqueValues(definition.name).add(valueStr)` directly.

**Rejected:** Keep lock “because spec said so” without reopening. Batch-lock once per Refresh walk — more machinery, still yields.

### D2: Do not await in the register loop

**Choice:** After removing `withLock`, the method may stay `async` for the public signature but the for-loop must not `await`. That keeps lazy `Map` init of the per-attribute `Set` on one turn.

**STOP** if a future edit adds `await` between `getUniqueValues` and `add`.

### D3: Unregister stays locked

**Choice:** Out of scope. Unregister is rare vs Refresh register.

### D4: Spec delta is MODIFIED, not a new capability

Replace the lock-serialization sentence. Keep the historical scenario title **Unique-set writes remain lock-serialized per attribute name** (OpenSpec archive will not drop a named scenario from a MODIFIED requirement) and rewrite its THEN to forbid `unique:` lock on existing-value register. Add scenario **Existing-value registration does not take the unique registry lock** with the same members assertion.

## Scope

**In scope:**

- `src/services/definitionService/definitionService.ts` (`registerUniqueAttributes` only, unless a one-line comment is needed)
- `src/services/definitionService/__tests__/recordUniqueRegistration.test.ts`
- `src/services/definitionService/__tests__/defineService.test.ts` (lock-spy case for `registerUniqueAttributes` if not in the record file)
- `openspec/changes/drop-unique-register-lock/specs/definition-service/spec.md` (this package)
- `CHANGELOG.md`

**Out of scope:**

- `unregisterUniqueAttributes`, `tryRegisterUniqueValue`, `generateWithCollisionDisambiguation`, counter lock
- `fusionService.ts` call site / uniqueRegister metrics (may drop in ms; do not change instrumentation)
- `src/services/lockService.ts`
- `honor-managed-account-refresh-threshold`

## Git workflow

- Same branch as other 2.2.0 work is fine.
- Commit example: `perf(definition): skip unique lock when registering existing values`
- Do not push or open a PR unless asked.

## STOP conditions

- Drift vs `e935b41` on in-scope files.
- Concurrent generation test fails after this change (do not “fix” by putting Velocity back under the lock).
- Parallel 25-account record registration loses values.
- Executor wants to drop `tryRegisterUniqueValue` lock or unregister lock — report, do not expand.
- `getUniqueValues` is changed to async or the register loop gains `await`.

## Risks / Trade-offs / Maintenance

- **Reviewer:** Confirm `withLock('unique:` remains in `tryRegisterUniqueValue` and unregister. Grep `registerUniqueAttributes` for `withLock`.
- **Follow-up:** If Unique generation and register truly overlapped on the same tick with a future `await` in register, restore a sync critical section — not this package’s job.
- Measuring Refresh `uniqueRegisterMs` after `honor-managed-account-refresh-threshold` is optional ops validation, not a code dependency.
