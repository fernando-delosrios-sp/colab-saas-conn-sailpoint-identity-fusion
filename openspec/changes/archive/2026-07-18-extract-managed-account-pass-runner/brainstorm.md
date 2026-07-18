# Brainstorm: Extract ManagedAccountPassRunner

Raw capture of the exploration session that produced this change's design.

---

## Background

`runUncorrelatedManagedAccountPass` (L714-805, ~92L) is a method on `FusionService` (1735L total) containing three nested closures sharing mutable state via capture:

- `logProgressIfNeeded` — closure captures `processed`, `initialQueueSize`, `logProgressEvery`, `managedAccountProcessingStartedAt`
- `runParallelAccounts` — 9L, simple batch-parallel processing via `processManagedAccount`
- `runDeferredGroups` — 45L, two-phase: Phase A parallel identity scoring + Phase B sequential peer scoring per source group

The method partitions accounts into parallel/deferred groups, then runs both paths concurrently via `Promise.all`.

The team has already extracted several collaborators from FusionService: `ManagedAccountAnalyzer`, `ManagedAccountAnalysisRecorder`, `IdentityProcessor`, `DecisionProcessor`, `CorrelationManager`, `FusionAccountRepository`. All follow the same pattern: dependency-inverted state interface, constructor injection.

---

## Decision Chain

### Q1: Is the sequential Phase B necessary?

**Finding:** The sequential constraint is synthetic. It exists because candidate registration is interleaved with identity scoring within each source group. Phase B must wait for Phase A to complete so candidates are registered. But there's no inherent reason Phase B can't run in parallel — the candidate pool just needs to be complete first.

**Decision:** Redesign from two-phase to two-pass.
- Pass 1: All accounts identity-scored in parallel batches → candidates registered
- Barrier: Candidate pool frozen
- Pass 2: All deferred-pending accounts peer-scored in parallel batches

**Trade-off considered:** Keep sequential Phase B with extraction (rejected — preserves bottleneck for no reason).

### Q2: Should the runner return results or inject callbacks?

**Options:**
- A: Runner returns `ManagedAccountPassResult[]`; FusionService iterates, records, and dispatches
- B: Runner receives callback (`completeManagedAccountFromAnalysis`) as dependency
- C: Runner dispatches to handlers directly via injected dependencies

**Decision:** Option A — analysis-result approach.
- Keeps runner as pure orchestrator
- Eliminates the need for `completeManagedAccountFromAnalysis` and the `deferredPhaseExecuted` flag
- FusionService handles side effects (recording, dispatching) after the runner returns

### Q3: What extraction pattern to follow?

**Decision:** Follow the existing `ManagedAccountAnalyzerState` pattern. Create `ManagedAccountPassRunnerState` interface with narrow dependencies. Constructor injection.

### Q4: Should CandidateRegistry be a separate collaborator?

**Decision:** Yes. Extract `CandidateRegistry` class with `register(account)`, `queryForSource(sourceName)`, no-op barrier enforced by runner control flow.
- Makes the register-then-query lifecycle explicit
- Can be tested independently
- Replaces `registerCurrentRunUnmatchedCandidate` and `currentRunUnmatchedCandidatesForSource` on FusionService

### Q5: Should `analyzeManagedAccount` be retired?

**Decision:** Yes. Runner handles single-account batches identically to multi-account batches. `processManagedAccount` delegates to runner for uncorrelated accounts. Eliminates duplicate analysis logic.

### Q6: What about double-recording?

**Finding:** In the current code, `recordAnalysis` is called in both Phase A (`completeManagedAccountFromAnalysis(analysis, false)`) and Phase B (`completeManagedAccountFromAnalysis(analysis, true)`) for unmatched deferred accounts — inflating stats.

**Decision:** Fix by design. Runner does NOT call `recordAnalysis`. FusionService calls it once per result after both passes. Recording is a side effect orthogonal to scoring orchestration.

### Q7: Candidate visibility — cross-source or per-source?

**Finding:** Current code uses `currentRunUnmatchedCandidatesForSource(sourceName)` which filters by source key (`sourceName ?? ''`). Candidates are per-source, not cross-source. The two-pass redesign preserves this — candidate lookup during Pass 2 still filters by source key.

### Q8: Barrier implementation — active or trusted?

**Options:**
- A: Active barrier — `CandidateRegistry.freeze()` throws on subsequent registrations
- B: Trusted barrier — no-op; runner's control flow is the actual barrier

**Decision:** Option B — "whatever is easier." Runner only starts Pass 2 after Pass 1 returns. No-op barrier.

---

## Design Trade-offs

| Aspect | Current | Proposed |
|--------|---------|-----------|
| Phase B latency | O(N × scoring_ms) sequential | O(N/batchSize × scoring_ms) parallel |
| Candidate lifecycle | Implicit (interleaved) | Explicit (register → barrier → query) |
| Result dispatch | Two sites (processManagedAccount, completeManagedAccountFromAnalysis) | One site (flat switch on result resolution) |
| Recording calls | 2 for unmatched deferred accounts | 1 per account |
| Lines in FusionService | ~160L (pass + analyze + complete) | ~30L (delegate + iterate + dispatch) |
| Testability | Requires full FusionService | Runner tested in isolation |

## Scope Boundary

**In scope:**
- Extract `ManagedAccountPassRunner` + `CandidateRegistry`
- Two-pass algorithm redesign
- Retire `analyzeManagedAccount`, eliminate `completeManagedAccountFromAnalysis`
- Fix double-recording

**Out of scope:**
- Cross-source candidate pooling
- Scoring service changes
- Identity processor / decision processor changes
- Formal state machine for `_managedAccountProcessingState`
