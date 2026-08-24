## Scope

In: Remaining **account-list** wall-clock after Map/Define hot-path and uncorrelated identity-phase outcome overlap already landed.

1. Process: serial **record unique registration** (`DefinitionService.registerUniqueValuesFromRecordManagedAccounts`).
2. Process: per-account INFO on the **correlated account sweep** skip-linked / correlated-orphan pre-score paths.
3. Output: **Unique generation** (`refreshUniqueAttributes` / `generateUniqueAttributeValue`) during JIT output. Output already `Promise.all`s a fusion-parallel batch, but each call holds `unique:${name}` for the whole Velocity + collision loop, so the batch is effectively serial per unique attribute.

Out: Fetch; scoring algorithms / trigram; deferred drain sequential-within-source; batching correlated accounts into one uncorrelated-style `runMatchSweep` (forbidden by `matching-service/match-outcome-dispatch`); API queue / RPS; connector-spec keys; C4 diagrams; generating Unique attributes before Output (JIT contract in `fusion-service`).

Working tree at this revision is clean. There is no heartbeat / log-spec / API-tuning WIP to avoid.

## Language

**Process phase** (canonical — reuse):
account-list PHASE 4 (`account-list-operation`). Includes identity processing, fusion-identity decisions, managed-account init, orphan identity hydration, correlated sweep, record unique registration, uncorrelated sweep, form reconcile.

**Output phase** (canonical — reuse):
account-list PHASE 5. Streams ISC rows via `FusionService.forEachISCAccount`. Unique attributes for accounts that need refresh are generated JIT immediately before serialize.

**Record unique registration** (canonical — reuse):
Bulk unique-value *register* for Record sources with match disabled, before uncorrelated sweep. Removes those accounts from the managed-account work queue. Does **not** run Unique Velocity generation.

**Unique generation** (canonical — reuse):
`DefinitionService.refreshUniqueAttributes` → `processUniqueDefinition` → `generateUniqueAttributeValue`. Builds a new unique value (UUID, incremental counter, or collision `$counter`) and inserts it into the per-attribute registry. Distinct from record unique *registration*.

**Correlated account sweep** (canonical — reuse):
FusionService pipeline step that processes managed accounts with `uncorrelated === false` **before** the uncorrelated batch sweep. Each account is `runMatchSweep([account], 1)`.

**Skip-linked** (canonical — reuse in matching pre-score):
Pre-score outcome when a correlated managed account is already linked on a loaded Fusion row. The work-queue entry is claimed and dropped; no `assembleManagedAccount`, no scoring.

**Fusion parallel batch size** (canonical — reuse):
`getFusionParallelBatchSize(config)` — `max(1, min(managedAccountsBatchSize, 12))` (`fusionService/collections.ts`). Same cap used for identity/fusion processing, identity-phase outcome dispatch, Output `processOutputBatch`, and record unique registration batches.

**Unique registry lock** (`draft` → `promote`):
`locks.withLock('unique:${definition.name}', …)` in `generateUniqueAttributeValue`. Protects membership of the in-memory unique-value set. SHALL NOT cover Velocity evaluation or UUID generation.

## Decisions

Context: This week already shipped Map/Define CPU cuts and overlapping uncorrelated identity-phase dispatch. Uncorrelated scoring is already `promiseAllBatched` with `scoringMaxConcurrency` (default 12). Deferred drain stays sequential within source by spec.

Q1: Include Unique *generation* on Output in this package?
Chosen: **Yes.** Operator confirmed it is in scope. Output already parallelizes `refreshUniqueAttributes` per batch; the remaining cost is the unique registry lock wrapping Velocity and collision retries. Shrink the lock to check/insert (and keep counter increments on the existing counter lock). Do not generate Unique before Output. Do not raise the Output batch cap.

Q2: Batch all correlated accounts into one `runMatchSweep(accounts, batchSize)` like uncorrelated?
Chosen: **No.** Living `match-outcome-dispatch` requires `runMatchSweep([account], 1)` per correlated account. Keep per-account sweeps under `batchProcess`. Cut host I/O by stopping per-account INFO.

Q3: Skip-linked: emit DETAIL per account, or only an aggregate count?
Chosen: **Aggregate only.** Per-account DETAIL is still O(n) string build and host lines. One `log.detail` / STEP END after the correlated sweep. Optional `log.debug` per account only when log level is debug.

Q4: Where to parallelize record unique registration?
Chosen: **Inside `DefinitionService.registerUniqueValuesFromRecordManagedAccounts`**, using `promiseAllBatched` + `getFusionParallelBatchSize(this.config)`. Unique-set writes stay under existing `withLock('unique:${name}')` in `registerUniqueAttributes`. If importing `promiseAllBatched` from `fusionService/collections` is a layering violation during apply, implement an equivalent batch loop in `definitionService.ts` and STOP rather than moving `collections.ts`.

Q5: Evaluate Unique Velocity inside the unique registry lock?
Chosen: **No.** Evaluate (and inject `$UUID` / `$counter` for the next attempt) outside the lock. Under the lock: `registeredValues.has` / `add` only. On collision, release, bump counter or new UUID, re-evaluate, retry. Incremental `counterFn()` stays on its existing counter lock, not nested inside a long unique-registry hold. Collision semantics (`$counter` empty on first attempt; maxAttempts) stay.

## Open questions

None.

## Scenarios discussed for specs

- Record unique registration processes eligible accounts in fusion-parallel batches; registered sets equal the serial implementation
- Unique-set membership remains serialized per unique attribute name via existing locks
- Skip-linked correlated accounts do not emit INFO per account
- Correlated-orphan pre-score does not emit INFO per account
- Correlated sweep STEP END or a single DETAIL reports dropped-linked / remaining queue counts
- `runMatchSweep([account], 1)` per correlated account is unchanged
- Unique generation still runs JIT immediately before Output serialize
- Unique Velocity evaluation does not hold the unique registry lock
- Concurrent Output-batch Unique generation still produces distinct registered values
- Existing unique values are still preserved when the account is not reset
- Collision `$counter` and incremental-counter strategies still terminate within maxAttempts

## Considered and rejected

- **Generating Unique during Process to shrink Output** — conflicts with `fusion-service` JIT-on-output and dry-run counter rules.
- **Raising Output / fusion parallel batch cap** — lock shrinking is what makes the existing cap real; no new setting.
- **One `runMatchSweep` for all correlated accounts** — conflicts with `match-outcome-dispatch`.
- **Raising `scoringMaxConcurrency` default** — scoring is already parallel.
- **Global `LogService.debug` no-op when level is info** — touches every debug caller; Unique-path debug string building MAY be gated locally (same pattern as Map/Define).
