## Why

`runUncorrelatedManagedAccountPass` is a 92-line method with three nested closures sharing mutable state via capture. Its deferred matching path uses a two-phase algorithm (Phase A parallel identity scoring, Phase B sequential per-source peer scoring) where the sequential bottleneck exists only because candidate registration is interleaved with identity scoring — not because the algorithm requires it. Additionally, `recordAnalysis` is called twice for unmatched deferred accounts (once in each phase), likely inflating recording stats in the experimental recording service. The same analysis operations are duplicated between `analyzeManagedAccount`+`processManagedAccount` and the deferred path.

## What Changes

**Extract ManagedAccountPassRunner**
- From: Three closures (`logProgressIfNeeded`, `runParallelAccounts`, `runDeferredGroups`) inside `runUncorrelatedManagedAccountPass` on `FusionService`.
- To: `ManagedAccountPassRunner` class in `src/services/fusionService/managedAccountPassRunner.ts` with a dependency-inverted state interface. Returns structured analysis results; FusionService dispatches to handlers and records analysis.
- Reason: Follow existing extraction pattern (`ManagedAccountAnalyzer`, `DecisionProcessor`, etc.). Makes pass orchestration independently testable.
- Impact: Non-breaking internal refactor.

**Redesign deferred algorithm: two-phase to two-pass**
- From: Phase A (parallel identity scoring per source group) followed by Phase B (sequential per-source peer scoring queue).
- To: Pass 1 (all accounts identity-scored in parallel batches) → barrier (candidate pool frozen) → Pass 2 (all deferred-pending accounts peer-scored in parallel batches). No per-source grouping in Pass 2.
- Reason: Eliminates the sequential bottleneck. Pass 2 goes from O(N * scoring_ms) to O(N/batchSize * scoring_ms).
- Impact: Non-breaking. Candidate visibility is identical — per-source candidate filtering is preserved.

**Fix double-recording**
- From: `recordAnalysis` called in both `completeManagedAccountFromAnalysis(analysis, false)` (Phase A) and `completeManagedAccountFromAnalysis(analysis, true)` (Phase B) for unmatched accounts.
- To: `recordAnalysis` called exactly once per result, after both passes, by FusionService.
- Impact: Fixes stats inflation in `AggregationTracker`. Non-breaking.

**Eliminate completeManagedAccountFromAnalysis and retire analyzeManagedAccount**
- From: Dispatch logic split between `processManagedAccount` and `completeManagedAccountFromAnalysis`, gated by `deferredPhaseExecuted` flag. `analyzeManagedAccount` duplicates the two-phase scoring.
- To: Runner returns structured results (`identity-match` | `deferred-match` | `non-match`). FusionService dispatches via a flat switch. `analyzeManagedAccount` removed; runner handles single-account mode.
- Reason: Removes control-flow artifacts from the result type. Single canonical path for all managed account analysis.
- Impact: Non-breaking internal refactor.

**Extract CandidateRegistry**
- From: `registerCurrentRunUnmatchedCandidate` and `currentRunUnmatchedCandidatesForSource` on FusionService delegating to `FusionAccountRepository`.
- To: `CandidateRegistry` class in `src/services/fusionService/candidateRegistry.ts` with `register(account)`, `queryForSource(sourceName)`, and no-op barrier enforced by runner control flow.
- Reason: Formalize the register-then-query lifecycle. Makes the barrier between Pass 1 and Pass 2 explicit.
- Impact: Non-breaking internal refactor.

## Capabilities

### New Capabilities
None. The `ManagedAccountPassRunner` and `CandidateRegistry` are internal collaborators within `fusion-service`, following the same pattern as `ManagedAccountAnalyzer`, `DecisionProcessor`, and `ManagedAccountAnalysisRecorder` — extracted classes that do not constitute standalone capabilities.

### Modified Capabilities
- `fusion-service`: New requirements for `CandidateRegistry`, `ManagedAccountPassRunner`, two-pass analysis execution, structured result dispatch, single-record contract, and retirement of `analyzeManagedAccount` and `completeManagedAccountFromAnalysis`.
- `recording-service`: `recordAnalysis` contract clarified — called exactly once per account after both passes complete. The `deferredPhaseExecuted` concept is removed from the recording interface.

## Impact

- Affected source files: `fusionService.ts`, plus new files `managedAccountPassRunner.ts`, `candidateRegistry.ts`, and their test files.
- No API or configuration changes.
- Performance: Pass 2 goes from sequential to batched-parallel. No regression anywhere; strictly faster for deferred accounts when batchSize > 1.
- `npm test`, `npm run typecheck`, and `npm run lint` must remain clean.
