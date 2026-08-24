## Scope

In: Remaining **Process phase** wall-clock on `accountList` after Map/Define hot-path and uncorrelated identity-phase outcome overlap already landed. Two Process-phase costs still scale with managed-account count: (1) serial **record unique registration** (`DefinitionService.registerUniqueValuesFromRecordManagedAccounts`); (2) per-account INFO on the **correlated account sweep** skip-linked / correlated-orphan pre-score paths. Out: Fetch/Output/Epilogue; Unique *generation* collision loops and `unique:${name}` lock duration during Velocity (`refreshUniqueAttributes` — deferred from `speed-up-map-define-hot-path`); scoring algorithms / trigram; deferred drain sequential-within-source; batching correlated accounts into one uncorrelated-style `runMatchSweep` (forbidden by `matching-service/match-outcome-dispatch`); API queue / RPS; connector-spec keys; C4 diagrams.

## Language

**Process phase** (canonical — reuse):
account-list PHASE 4 (`account-list-operation`). Includes identity processing, fusion-identity decisions, managed-account init, orphan identity hydration, correlated sweep, record unique registration, uncorrelated sweep, form reconcile.

**Record unique registration** (canonical — reuse):
Bulk unique-value register for Record sources with match disabled, before uncorrelated sweep (`matching-service`, `definition-service`). Removes those accounts from the managed-account work queue. Does **not** run Normal/Unique Velocity generation.

**Correlated account sweep** (canonical — reuse):
FusionService pipeline step that processes managed accounts with `uncorrelated === false` **before** the uncorrelated batch sweep (`fusion-service`, `matching-service/match-outcome-dispatch`). Each account is `runMatchSweep([account], 1)` (not one uncorrelated-style sweep of the whole correlated set).

**Skip-linked** (canonical — reuse in matching pre-score):
Pre-score outcome when a correlated managed account is already linked on a loaded Fusion row. The work-queue entry is claimed and dropped; no `assembleManagedAccount`, no scoring.

**Fusion parallel batch size** (canonical — reuse):
`getFusionParallelBatchSize(config)` — `max(1, min(managedAccountsBatchSize, 12))` (`fusionService/collections.ts`). Same cap used for identity/fusion account processing and identity-phase outcome dispatch.

## Decisions

Context: This week already shipped Map/Define CPU cuts and overlapping uncorrelated identity-phase dispatch. Uncorrelated scoring is already `promiseAllBatched` with `scoringMaxConcurrency` (default 12). Deferred drain stays sequential within source by spec. The next Process-phase costs that are still serial or host-log bound are record unique registration and correlated-sweep INFO.

Q1: Parallelize Unique *generation* (`generateUniqueAttributeValue` / Output JIT) in this package?
Chosen: **No.** Explicitly deferred by archived `speed-up-map-define-hot-path`. Output is not Process phase. Collision loops + per-attribute locks need their own design.

Q2: Batch all correlated accounts into one `runMatchSweep(accounts, batchSize)` like uncorrelated?
Chosen: **No.** Living `match-outcome-dispatch` requires `runMatchSweep([account], 1)` per correlated account and forbids one uncorrelated-style sweep. Keep per-account sweeps; they already run under `batchProcess` with `managedAccountProcessingBatchSize`. Cut host I/O by stopping per-account INFO.

Q3: Skip-linked: emit DETAIL per account, or only an aggregate count?
Chosen: **Aggregate only.** Per-account DETAIL is still O(n) string build and host lines. One `log.detail` / STEP END count after the correlated sweep. Optional `log.debug` per account only when log level is debug.

Q4: Where to parallelize record unique registration?
Chosen: **Inside `DefinitionService.registerUniqueValuesFromRecordManagedAccounts`**, using `promiseAllBatched` + `getFusionParallelBatchSize(this.config)`. Unique-set writes stay under existing `withLock('unique:${name}')` in `registerUniqueAttributes`. Do not invent a second batch-size setting. If importing `promiseAllBatched` from `fusionService/collections` is treated as a layering violation during apply, implement an equivalent batch loop in `definitionService.ts` (same yield-between-batches contract as `promiseAllBatched`) and STOP rather than moving `collections.ts`.

## Open questions

None.

## Scenarios discussed for specs

- Record unique registration processes eligible accounts in fusion-parallel batches; registered sets equal the serial implementation
- Unique-set membership remains serialized per unique attribute name via existing locks
- Skip-linked correlated accounts do not emit INFO per account
- Correlated-orphan (correlated, not linked) pre-score does not emit INFO per account
- Correlated sweep STEP END or a single DETAIL reports dropped-linked / remaining queue counts
- `runMatchSweep([account], 1)` per correlated account is unchanged

## Considered and rejected

- **Unique generation lock shrinking / parallel Output JIT** — high leverage on first-run Output; out of Process phase; deferred follow-up.
- **One `runMatchSweep` for all correlated accounts** — conflicts with `match-outcome-dispatch`.
- **Raising `scoringMaxConcurrency` default** — scoring is already parallel; not the remaining serial work.
- **Global `LogService.debug` no-op when level is info** — touches every debug caller; out of scope (same rejection as map/define package).
