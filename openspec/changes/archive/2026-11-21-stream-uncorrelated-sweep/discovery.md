## Scope

Stream `FusionRun.managedAccountsById` in bounded chunks during `processUncorrelatedManagedAccounts()` so `runMatchSweep()` never materializes the entire 1.35M+ account population and its scoring results in V8 heap simultaneously, and reset step progress in `LogService.stepStart()` so `STATUS` heartbeats never display stale progress from a previous step.

Out of scope: changing match scoring rules, `CompressedBlockMap` storage format, or ISC API contracts.

## Language

_(No new domain terms introduced; existing canonical terms `Match`, `FusionAccount`, `ManagedAccount` apply unchanged.)_

## Decisions

- **Context**: In a live 1.35M-account run, `Fetch` stayed at `mem=799MB / heap=301MB` using `CompressedBlockMap`, but `uncorrelated-sweep` crashed with V8 OOM (`heap=3608.77MB`) while `STATUS` remained stuck at `progress=130/130` (stale from `correlated-sweep`).
- **Q1 — Why did heap explode to 3.6 GB?** `processUncorrelatedManagedAccounts()` copied all 1.35M decompressed `Account` objects from `managedAccountsById.values()` into `queuedAccounts: Account[]`, and `runMatchSweep()` built `toScore`, `allAccounts`, `identityResults`, and `pendingDeferred` for all 1.35M accounts at once.
- **Q2 — Chosen direction**: Stream `managedAccountsById.values()` in bounded chunks (e.g., `4,096` accounts per chunk) into `runMatchSweep()`, passing `{ offset, total }` progress context so each chunk's arrays and `ScoredAccount` results are garbage-collected before the next chunk is decompressed; also clear `runContext.progress` in `LogService.stepStart()` (and initialize `0 / total` at `uncorrelated-sweep` start).

## Open questions

- None.

## Scenarios discussed

- Massive uncorrelated sweep (`1M+` accounts) processes in bounded chunks with flat V8 heap instead of materializing all accounts in `queuedAccounts`.
- `STATUS` heartbeat during `uncorrelated-sweep` starts at `0/<total> analyzed` and advances monotonically across chunks rather than showing stale `correlated-sweep` progress (`130/130`).
- Cross-chunk Fusion account creation and blocking index updates remain visible to subsequent chunks' identity scoring and deferred drain.
