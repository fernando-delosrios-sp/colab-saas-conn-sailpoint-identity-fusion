# Brainstorm: Extract Map/Define/Match Services

> Session date: 2026-07-19

## Q1: Should ScoringService become MatchService?

**Decision: Yes, with full Option B scope.**

The existing `ScoringService` name understates what the service supports — it handles trigram blocking indexes, normalization caches, candidate pre-filtering, weighted combined scoring, and algorithm selection. The domain term is "Match" (per ubiquitous language: "The product step that determines whether a Fusion account corresponds to an existing identity"). Renaming to `MatchService` aligns with the existing concept.

## Q2: What boundary for MatchService?

**Decision: Option B — Full pipeline (scoring + match outcome dispatch)**

Three options were considered:
- Option A: Pure scoring only (rename ScoringService, no other changes)
- Option B: Full pipeline (scoring + response handlers: exact match, identity match, partial, deferred, non-match)
- Option C: Middle ground (scoring + runners + analyzers, response dispatch stays in FusionService)

Option B chosen because it reduces FusionService from ~1619 to ~600 lines and provides behavioral isolation. The managed-account-level outcome handlers (`handleExactMatch`, `handleIdentityMatch`, `handlePartialMatch`, `handleDeferredMatch`, `handleNonMatch`) naturally cluster with the scoring logic they consume.

## Q3: What intermediary enables clean MatchService extraction?

**Decision: FusionRun — centralized state container**

The key obstacle to MatchService extraction is that FusionService currently IS the transaction boundary, holding all shared mutable state (fusionAccountMap, fusionIdentityMap, autoAssignedIdentityIds, sourcesByName, analysisRecorder). Creating FusionRun as a separate state container that both services reference breaks the circular dependency without creating a new god-object.

FusionRun is NOT a service — it's a data-holder with snapshot/restore for recording. Services become stateless and operate on FusionRun.

## Q4: Should services become stateless?

**Decision: Yes — FusionRun is the single source of truth**

All mutable state currently scattered across SourceService, IdentityService, FusionService, and FormService moves into FusionRun. This enables:
- Single-object debugging (inspect `run` in debugger)
- Simplified RecordingService (one snapshot call vs 3+)
- Deterministic replay (restore FusionRun from snapshot, run phase)

## Q5: Should AttributeService disappear or remain as facade?

**Decision: Disappear entirely**

MapService and DefineService are the only way to access these capabilities. The split line is clean:
- Map: stateless, no locks, read-only (attribute merging)
- Define: stateful (counters, unique registries), uses LockService (Velocity evaluation + uniqueness)

The two phases have different invariants, different callers in the pipeline, and different test concerns.

## Q6: What to name the centralized state object?

**Decision: FusionRun**

Options considered: RunState, FusionRun, FusionLedger, Run, RunContext, Session. FusionRun chosen because it's domain-aligned ("this IS a fusion run"), reads naturally in code (`run.managedAccounts`, `run.snapshot()`), and is clearly not a service.

## Q7: Refactoring sequence?

**Decision: RunState first, then extraction**

1. Create FusionRun — move all mutable state out of services
2. Extract MapService + DefineService — now trivial since stateless
3. Extract MatchService — clean access to state via FusionRun
4. Simplify RecordingService — snapshots FusionRun directly

Services being stateless makes extraction a pure refactor — moved methods have no state dependencies on their origin class.

## Key Architecture Diagram

```
                        ┌──────────────────────────────────────┐
                        │             FusionRun                │
                        │  (one per operation run, all state)  │
                        │                                      │
                        │  managedAccounts    identityMap      │
                        │  fusionAccounts     fusionIdentities │
                        │  autoAssignedIds    formDecisions    │
                        │  analysisRecorder   fusionBlends     │
                        │  phaseTimings       matchScoringMs   │
                        │                                      │
                        │  snapshot() / restore()              │
                        └──────┬───────┬───────┬───────────────┘
                               │       │       │
                    ┌──────────┘       │       └──────────┐
                    ▼                  ▼                   ▼
            ┌──────────────┐  ┌──────────────┐   ┌──────────────┐
            │  MapService  │  │DefineService │   │ MatchService │
            │  (stateless) │  │ (stateless)  │   │ (stateless)  │
            └──────────────┘  └──────────────┘   └──────────────┘

            ┌──────────────┐  ┌──────────────┐
            │FusionService │  │  Recording   │
            │ (orchestrator│  │   Service    │
            │  ~600 lines) │  │  (trivial)   │
            └──────────────┘  └──────────────┘
```

## Documentation & Spec Impact

- 3 new specs: map-service, define-service, fusion-run
- 1 renamed spec: scoring-service → match-service
- 1 deleted spec: attribute-service
- 3 updated specs: fusion-service, recording-service, service-registry
- 1 updated spec: ubiquitous-language (4 new terms, 2 retired terms, 1 new requirement)
- 6 .drawio diagram files updated (labels)
- 1 glossary updated (FusionRun entry)
- 0 guide changes (already use domain concepts, not service class names)
- 0 README changes (no service class references found)
