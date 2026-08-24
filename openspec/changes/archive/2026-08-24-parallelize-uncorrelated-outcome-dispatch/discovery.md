## Scope

In: identity-phase **Match outcome dispatch** after scoring has finished for the uncorrelated-sweep queue — overlapping ISC-bound and CPU-bound outcome handlers (review forms, authoritative non-match registration) so `uncorrelated-sweep` is not serialized one account at a time. Out: MatchingService scoring algorithms, trigram blocking, `scoringMaxConcurrency`, identity-phase scoring batches, deferred drain (sequential within source), Map/Define assembly inside `scoreIdentityCandidates`, correlated account sweep batching, record unique registration phase, client `ApiQueue` rate limits, and the unused `concurrency.uncorrelatedAccounts: 500` internal cap.

## Language

**Uncorrelated sweep** (canonical — reuse):
Process-phase STEP `uncorrelated-sweep` that drains remaining managed accounts after correlated sweep and record unique registration. FusionService calls `MatchOutcomeDispatcher.runMatchSweep` once with the remaining queue.
_Avoid_: calling this the “matching engine”; scoring is only one stretch inside the STEP.

**Identity scoring sweep** (canonical — reuse):
First half of `runMatchSweep`: parallel-batched identity-candidate scoring. Unchanged by this change.
_Avoid_: “identity phase dispatch” as a synonym for scoring.

**Identity-phase outcome dispatch** (`draft` → `promote`):
The stretch after identity scoring returns `identityResults`, when each scored account is routed to exact match, partial match (review form), or non-match. Distinct from scoring and from the deferred drain.
_Avoid_: `pass`, `round`; do not call this “Match scoring.”

**Exact-match application gate** (`draft`):
A sweep-local serial queue around `handleExactMatch` / `processFusionIdentityDecision` so two automatic merges do not interleave identity-layer mutation. Not instance state on `MatchOutcomeDispatcher`.
_Avoid_: storing the gate as a field on the dispatcher (violates “no mutable run-scoped state”).

**Fusion parallel batch size** (canonical helper — reuse):
`getFusionParallelBatchSize(config)` = `max(1, min(managedAccountsBatchSize, 12))`. Existing cap used by identity/decision `batchProcess`. Identity-phase outcome dispatch SHALL use this cap, not `scoringMaxConcurrency` and not `concurrency.uncorrelatedAccounts` (500).
_Avoid_: uncapped `Promise.all` over the full identityResults array.

## Decisions

Context: `uncorrelated-sweep` wall time includes scoring **and** outcome I/O. Identity scoring already runs in `promiseAllBatched` slices capped by `scoringMaxConcurrency` (default 12). After that, `runMatchSweep` does `for (const scored of identityResults) { await this.dispatchOutcome(scored) }` — one account at a time. Review-form creation (`FormService.createFusionForm`) and non-match registration therefore cannot overlap, so `ApiQueue` sits idle between sequential form/decision calls. Matching (trigram, `scoreFusionAccount`, deferred drain) is explicitly deferred.

Q1: Parallelize which stretch?
Chosen: **identity-phase outcome dispatch only.** Pre-score (`resolveAccountBeforeScoring`) is cheap for typical uncorrelated enqueue. Deferred drain must stay sequential within a source (`matching-service/match-outcome-dispatch`: pool mutates after each account before the next is scored). Do not retune scoring.

Q2: Concurrency cap?
Chosen: **`getFusionParallelBatchSize`** (same as other Fusion/identity `batchProcess` paths, default 12). Do **not** wire `internalConfigFusionService.concurrency.uncorrelatedAccounts` (500): that value is unused today and would enqueue far more form/decision work than `ApiQueue` and memory should take. HTTP still serializes through `ClientService` / `ApiQueue` (`client-service` spec).

Q3: Can `dispatchOutcome` run fully concurrently?
Chosen: **non-match and partial-match may overlap; exact-match application must not.** `handleExactMatch` mutates identity-linked Fusion accounts via `DecisionProcessor.processFusionIdentityDecision`. Overlapping two automatic merges onto the same identity is unsafe. Implement a **sweep-local** promise chain around exact-match application only (closure in `runMatchSweep`, not a dispatcher field). `handlePartialMatch` / `createFusionForm` may overlap: form definition names include the account identifier suffix, so definitions are per managed account. Unique-attribute maps already use `locks.withLock` in `DefinitionService.registerUniqueAttributes`.

Q4: Progress / heartbeat?
Chosen: keep `log.setProgress(processedCount, initialQueueSize, 'analyzed')` after each dispatched identity-phase result (atomic increment is enough; JS is single-threaded). Continue yielding between `promiseAllBatched` slices (`collections.promiseAllBatched` already `await yieldToEventLoop()` after each slice). Do not add a new STATUS unit.

## Open questions

None locked for this package. Follow-up (not this change): split Map/Define `assembleManagedAccount` from `scoreIdentityCandidates` so attribute processing can use a different cap than `scoringMaxConcurrency`.

## Scenarios discussed for specs

- Identity-phase outcome dispatch overlaps up to fusion parallel batch size
- Exact-match application remains one-in-flight
- Scoring concurrency and deferred drain contracts unchanged
- Dispatch does not bypass `ApiQueue`

## Considered and rejected

- **Parallelize deferred drain within a source** — rejected: living spec requires sequential score+dispatch so the per-source candidate pool includes earlier non-match anchors.
- **Resurrect `concurrency.uncorrelatedAccounts: 500` for dispatch** — rejected: unused fossil; 500 concurrent form/decision pipelines would pile waiters on `ApiQueue` and inflate peak memory.
- **Parallelize Map/Define with scoring** — rejected for this package: lives inside `scoreIdentityCandidates`; user asked to disregard matching for now, and that split is a separate design.
- **Uncapped `Promise.all(identityResults.map(dispatchOutcome))`** — rejected: same class of bug scoring already fixed (`scoringMaxConcurrency`).
