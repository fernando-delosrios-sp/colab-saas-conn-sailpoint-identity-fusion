# Design: Reconcile Matching Delegation Spec

## Context

Identity Fusion's Match step uses three cooperating modules under `src/services/`:

| Module | Location | Role |
|---|---|---|
| **FusionService** | `fusionService/` | Pipeline orchestration for managed-account processing phases |
| **MatchOutcomeDispatcher** | `matchingService/matchOutcomeDispatcher.ts` | Two-sweep match lifecycle and outcome routing |
| **MatchingService** | `matchingService/matchingService.ts` | Stateless scoring algorithms and trigram blocking |

`ServiceRegistry` constructs `MatchOutcomeDispatcher` with real collaborators and assigns it to `fusion.matchOutcomeDispatcher`. The July 2026 service-extraction change archived with MatchService extraction incomplete; living `fusion-service` spec still describes the abandoned target.

This change is **spec-only** — no production code edits.

## Goals / Non-Goals

**Goals:**
- Align living specs with the shipped three-layer architecture
- Retire stale `ManagedAccountMatchingRunner` terminology
- Document correlated vs uncorrelated sweep invocation accurately
- Align `configureScoring({ captureBreakdown })` in matching-service spec
- Close high-severity drift items from `.scratch/spec-drift-report.md`

**Non-Goals:**
- Moving `MatchOutcomeDispatcher` ownership onto `MatchingService`
- Refactoring FusionService pipeline phases
- Changing match algorithms, sweep behavior, or ISC wire contracts
- Updating `.scratch/spec-drift-report.md` (local scratch artifact)

## Decisions

### D1: Spec-only reconciliation (Option A)

**Choice:** Update living specs via OpenSpec delta; no code changes.

**Rationale:** Code matches `match-outcome-dispatch/spec.md`. Behavioral parity is already proven by existing test suite. Spec alignment has zero deployment risk.

**Alternatives rejected:**
- Move dispatcher into MatchingService — new API surface, no user benefit
- Full MatchService extraction — reverses deliberate MatchOutcomeDispatcher extraction

### D2: Correlated account sweep stays on FusionService

**Choice:** Document `processCorrelatedManagedAccounts` as a FusionService pipeline phase, distinct from the two-sweep identity/deferred lifecycle.

**Rationale:** Correlated sweep builds on linked-account index, filters by source correlation flag, and runs before uncorrelated batch sweep. Ubiquitous language already defines **Correlated account sweep** separately. Per-account match dispatch still uses `MatchOutcomeDispatcher.runMatchSweep([account], 1)`.

### D3: Allow scoring-prep calls during init

**Choice:** FusionService MAY call `MatchingService.buildTrigramIndex()` and `MatchingService.configureScoring()` from `initializeManagedAccountProcessing`. FusionService SHALL NOT invoke sweep internals (`scoreIdentityPhase`, deferred drain helpers) or scoring comparison methods directly during sweeps.

**Rationale:** Init is genuinely mixed (FusionRun seeding, reviewer validation, linked-account index + scoring prep). A facade method would be Option B scope.

### D4: Retire ManagedAccountMatchingRunner in UL

**Choice:** Add `ManagedAccountMatchingRunner` to retired terms; point canonical sweep/dispatch terminology to `MatchOutcomeDispatcher`.

**Rationale:** Type absent from codebase; UL already defines **Match outcome dispatch** → `MatchOutcomeDispatcher`.

### D5: CandidateRegistry ownership on FusionRun

**Choice:** Spec text clarifies deferred candidate pool state lives on `FusionRun`; `MatchOutcomeDispatcher` reads/writes via run APIs; `MatchingService` does not own a separate registry object.

**Rationale:** Matches code — persisted/materialized deferred candidates registered on FusionRun during init and sweep.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Spec readers expect code refactor | Proposal and design state explicitly: spec-only |
| Residual references to ManagedAccountMatchingRunner in archived changes | Out of scope; living specs + UL only |
| match-outcome-dispatch "once per sweep" misread | Delta clarifies correlated = per-account, uncorrelated = one batch |

## Migration Plan

1. Apply delta specs to living specs under `openspec/specs/` (archive step at change completion)
2. Run `openspec validate --all --json`
3. Ripgrep audit: no living spec requires deleted APIs as normative contract
4. No deploy, rollback, or feature flag — documentation merge only

## Open Questions

None — user approved all thread decisions during explore/propose.
