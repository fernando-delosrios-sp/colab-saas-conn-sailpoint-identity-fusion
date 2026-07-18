## Context

`FusionService` (`src/services/fusionService/fusionService.ts`, 1735L) already follows a pattern of extracting collaborators: `ManagedAccountAnalyzer`, `ManagedAccountAnalysisRecorder`, `IdentityProcessor`, `DecisionProcessor`, `CorrelationManager`, `FusionAccountRepository`. Each takes a narrow dependency interface in its constructor.

The 92-line `runUncorrelatedManagedAccountPass` (L714-805) and its associated methods (`completeManagedAccountFromAnalysis`, `analyzeManagedAccount`, candidate registration methods) are the next extraction target. The method contains three closures sharing mutable state via capture, and its deferred matching path uses a two-phase algorithm where Phase B is sequential only because candidate registration is interleaved with identity scoring.

The codebase uses TypeScript, Vitest, and the existing extraction pattern. The change is a structural refactor with an algorithm redesign; no connector behavior or public API changes.

## Goals / Non-Goals

**Goals:**
- Extract pass orchestration into `ManagedAccountPassRunner` with structured result output
- Redesign from two-phase deferred (sequential Phase B) to two-pass (parallel Pass 2)
- Fix double-recording of unmatched deferred accounts
- Eliminate `completeManagedAccountFromAnalysis` and retire `analyzeManagedAccount` — replace both with runner-based dispatch
- Extract `CandidateRegistry` as a separate collaborator
- Keep all existing tests passing without modification where possible

**Non-Goals:**
- Change scoring service, identity processor, or decision processor
- Change matching behavior, candidate visibility, or report generation
- Cross-source candidate pooling (candidates remain per-source)
- Formal state machine for `_managedAccountProcessingState`

## Decisions

### D1: Analysis-result approach (not callback injection)

- **Choice:** Runner returns `ManagedAccountPassResult[]`; FusionService iterates, records, and dispatches.
- **Rationale:** Keeps runner a pure orchestrator. Callback injection would couple it to FusionService's handler methods.
- **Alternatives considered:** Pass `completeManagedAccountFromAnalysis` as callback (rejected — preserves the problematic method and `deferredPhaseExecuted` flag). Inject all handlers individually (rejected — bloats the state interface).

```
ManagedAccountPassResult = {
    analysis: ManagedAccountAnalysisContext
    resolution: 'identity-match' | 'deferred-match' | 'non-match'
}
```

### D2: Two-pass design (replace two-phase)

- **Choice:** Pass 1 identity scoring on all accounts (parallel batches) → barrier → Pass 2 peer scoring on deferred-pending accounts (parallel batches). No per-source grouping in Pass 2.
- **Rationale:** Eliminates sequential bottleneck. Pass 2 parallelized naturally since candidate pool is frozen after Pass 1. Per-source filtering during scoring preserves same-source-only candidate visibility.
- **Alternatives considered:** Keep sequential Phase B but extract (rejected — preserves bottleneck). Cross-source candidate pool (rejected — behavioral change, no requirement for it).

```
Current (two-phase per source):             Proposed (two-pass global):

Source A:                                   Pass 1 (all accounts, parallel batches):
  [Phase A: A1,A2,A3 parallel]               [A1,A2,A3,B1,C1,C2] → identity score
  [Phase B: A2→A3 sequential]               
                                             matched → 'identity-match'
Source B:                                    unmatched+deferred → register candidate, 'deferred-pending'
  [Phase A: B1 parallel]                     unmatched+non-deferred → 'non-match'
  [Phase B: B1 sequential]                   
                                             ─── barrier (candidates frozen) ───
Source C:
  [Phase A: C1,C2 parallel]                  Pass 2 (deferred-pending, parallel batches):
  [Phase B: C1→C2 sequential]                [A2,A3,B1,C1] → peer score vs per-source candidates

                                             peer match → 'deferred-match'
                                             no match → 'non-match'
```

### D3: CandidateRegistry as separate collaborator

- **Choice:** `CandidateRegistry` class with `register(fusionAccount)`, `queryForSource(sourceName): Iterable<FusionAccount>`, no-op barrier (enforced by runner control flow).
- **Rationale:** Makes register-then-query lifecycle explicit. Independently testable.
- **Alternatives considered:** Keep logic in `FusionAccountRepository` (rejected — repository shouldn't know about pass lifecycle). Active freeze with error throwing (rejected — unnecessary ceremony; runner's control flow is sufficient barrier).

### D4: State interface follows `ManagedAccountAnalyzerState` pattern

- **Choice:** `ManagedAccountPassRunnerState` interface with narrow dependencies.
- **Rationale:** Consistent with existing extraction pattern. Prevents re-entrant coupling to FusionService.
- **Alternatives considered:** Constructor with individual parameters (rejected — less consistent with codebase conventions).

```
interface ManagedAccountPassRunnerState {
    readonly config: FusionConfig
    readonly log: LogService
    readonly managedAccountAnalyzer: ManagedAccountAnalyzer
    readonly candidateRegistry: CandidateRegistry
    processAccount(account: Account): Promise<FusionAccount | undefined>
}
```

### D5: `recordAnalysis` called once, post-pass, in FusionService

- **Choice:** Runner does NOT call `recordAnalysis`. FusionService iterates results, records once per result, then dispatches.
- **Rationale:** Eliminates double-recording. Recording is a side effect orthogonal to scoring orchestration.
- **Alternatives considered:** Runner calls `recordAnalysis` via injected dependency (rejected — adds complexity to runner interface for a side effect).

### D6: Retire `analyzeManagedAccount` — use runner in single-account mode

- **Choice:** `processManagedAccount` for uncorrelated accounts calls runner with single-account input. Runner's two-pass design works identically for batchSize=1. `analyzeManagedAccount` removed.
- **Rationale:** Eliminates last duplicate of two-phase analysis logic. Single canonical path for all managed account analysis.
- **Alternatives considered:** Keep `analyzeManagedAccount` for correlated pre-pass (rejected — creates divergence risk; runner is the canonical path).

## Architecture

```
FusionService
  │
  ├── Correlated pre-pass (unchanged)
  │     └── batchProcess(correlated, account => processManagedAccount(account))
  │           └── uses runner (single-account batch)
  │
  └── Uncorrelated pass (refactored)
        └── runner.execute(uncorrelatedAccounts, batchSize, startedAt)
              │
              ├── Pass 1: for batch in accounts:
              │     Promise.all(batch.map(analyzeIdentityPhase))
              │     for each: classify result
              │       ├── identity-match → emit result
              │       ├── deferred-pending → candidateRegistry.register(), queue
              │       └── non-deferred → emit 'non-match'
              │
              ├── ─── barrier (all Pass 1 complete) ───
              │
              └── Pass 2: for batch in pending:
                    Promise.all(batch.map(account =>
                      analyzeDeferredPhase(account)
                      classify: deferred-match | non-match
                    ))
              │
              └── return ManagedAccountPassResult[]
        │
        └── for each result:
              analysisRecorder.recordAnalysis(result.analysis)
              dispatch: identity-match → handleIdentityBackedMatch
                        deferred-match → handleDeferredMatch
                        non-match → handleNonMatch
```

## What Goes Away

| Removed | Replaced by |
|---|---|
| `runUncorrelatedManagedAccountPass` (92L) | `runner.execute()` + result loop |
| `completeManagedAccountFromAnalysis` (28L) | Flat switch on result resolution |
| `analyzeManagedAccount` (17L) | Runner in single-account mode |
| `registerCurrentRunUnmatchedCandidate` (9L) | `CandidateRegistry.register()` |
| `currentRunUnmatchedCandidatesForSource` (2L) | `CandidateRegistry.queryForSource()` |
| `_currentRunUnmatchedCandidatesIterableForSource` (8L) | Moved to `CandidateRegistry` |
| `deferredMatchingSourceKey` (3L) | Moved to `CandidateRegistry` |
| `deferredPhaseExecuted` flag | Eliminated |
| Double `recordAnalysis` call | Fixed (one call per result) |

## Risks / Trade-offs

- **[Risk] Candidate visibility change** — Pass 2 runs after ALL Pass 1 accounts are scored, not interleaved. Accounts queued later in Pass 1 are visible to accounts queued earlier in Pass 2. Current algorithm (sequential Phase B within a source) already guarantees this because Phase B starts after all Phase A batches complete for that source. No behavioral difference.
- **[Risk] `processManagedAccount` changed to use runner** — Correlated pre-pass also calls `processManagedAccount`. Runner's two-pass design is functionally equivalent for single-account batches. Existing tests covering correlated pre-pass serve as safety net.
- **[Trade-off] Two new files** — Accept more files for improved testability and reduced FusionService complexity.

## Migration Plan

N/A — Code-only structural refactor. No deployment, database, or configuration changes. Rollback is a revert.

## Open Questions

None — all resolved during exploration.
