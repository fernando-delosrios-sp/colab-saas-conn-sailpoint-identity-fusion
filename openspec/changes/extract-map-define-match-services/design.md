# Design: Extract Map/Define/Match Services

## Context

The connector has three source-level services that conflate responsibilities:

- **FusionService** (1619 lines): God-class orchestrator — handles pipeline phases AND match outcome dispatch AND reviewer management AND form creation AND report generation. The matching concern (~400 lines of outcome handlers and sweep orchestration) is embedded alongside general pipeline coordination.
- **AttributeService** (1344 lines): Conflates two sequential phases — Map (attribute merging, stateless) and Define (Velocity evaluation, unique values, stateful with counters/locks). These have different callers in the pipeline and different invariants.
- **ScoringService** (~500 lines): Pure computation that supports matching but is named too narrowly. The domain term is "Match."

State is scattered across SourceService, IdentityService, FusionService, and FormService, making it difficult to debug (must inspect 4+ objects) and making deterministic replay impossible (RecordingService must reach into 3+ services' internals).

The project's ubiquitous language already defines Map → Define → Match as the three processing phases. The code should reflect this.

## Goals / Non-Goals

**Goals:**
- Extract FusionRun as a centralized state container (single source of truth, snapshot/restore)
- Split AttributeService into MapService (stateless merge) + DefineService (stateful evaluation)
- Rename ScoringService → MatchService, expand to include match outcome dispatch
- Reduce FusionService to ~600 lines of pure pipeline orchestration
- Simplify RecordingService to snapshot FusionRun directly
- Zero behavioral changes — all tests pass with the same expectations

**Non-Goals:**
- Changing the config schema or connector API
- Changing the Velocity template engine or attribute evaluation logic
- Adding new matching algorithms
- Modifying the pipeline phase structure
- Performance optimization beyond what the refactoring naturally provides

## Decisions

### D1: FusionRun as centralized state

All mutable run-scoped state lives in a single `FusionRun` instance created at the start of each operation. Services become stateless — they receive `FusionRun` in method parameters (or hold a reference passed in constructor).

FusionRun fields:
```
Managed accounts      → managedAccountsById: Map<string, Account>
                      → managedAccountsByIdentityId: Map<string, Account[]>
Fusion accounts       → fusionAccountMap: Map<string, FusionAccount>
                      → fusionIdentityMap: Map<string, FusionAccount>
Identities            → identityMap: Map<string, IdentityDocument>
Sources               → sourcesByName: Map<string, SourceInfo>
Matching              → autoAssignedIdentityIds: Set<string>
                      → linkedAccountKeyIndex: Set<string>
                      → currentRunNonMatchedKeysBySource: Map<string, Set<string>>
Timing/metrics        → matchScoringMs: number
                      → phaseTimings: PhaseTimingEntry[]
Recording             → snapshot(): RunStateSnapshot
                      → restore(snapshot): void
```

**Rationale:** Breaks circular dependency between FusionService and MatchService. Both reference FusionRun without owning it. Debugging: one object to inspect. Recording: one snapshot call. Replay: restore exact state.

**Alternatives considered:**
- Keep state in individual services: Already the current state, tightly couples services, prevents deterministic replay.
- Pass individual maps as constructor params to MatchService: 8+ params, brittle, harder to maintain.

### D2: MatchService boundary — full pipeline

MatchService owns: scoring, outcome dispatch, runner orchestration, candidate management, and analyzer.

MatchService dependencies:
```
FusionRun                  (shared state, read/write)
FormService                (create review forms on partial match)
DefineService              (register unique attributes on non-match)
CandidateRegistry          (deferred candidate management)
ManagedAccountAnalyzer     (per-account scoring)
ManagedAccountMatchingRunner (two-sweep orchestration)
```

Outcome handlers moved from FusionService:
- `handleExactMatch()` — auto-assign to identity
- `handleIdentityMatch()` — dispatch exact or partial
- `handlePartialMatch()` — create review form
- `handleDeferredMatch()` — log and defer
- `handleNonMatch()` — policy-based response (authoritative/record/orphan)

**Rationale:** These handlers consume scoring results and form a natural cluster. Moving them reduces FusionService by ~400 lines and makes MatchService behaviorally self-contained.

### D3: MapService vs DefineService split

The split line is at the phase boundary documented in `docs/concepts/map-define-match.md`:

```
MapService:
  mapAttributes(fusionAccount, run)     — merge source attributes
  Attribute mapping config cache
  attrSplit / attrConcat utilities
  Merge strategies (first, list, concat, source)
  mainAccount prioritization

DefineService:
  refreshNormalAttributes(fusionAccount, run)
  refreshUniqueAttributes(fusionAccount, run)
  buildVelocityContext(fusionAccount)
  Counter management (StateWrapper)
  Unique value generation (collision, UUID, incremental counter)
  Key generation (simple/compound)
  Template evaluation (Velocity)
  Output transforms (trim → case → spaces → normalize → maxLength)
  register/unregister unique values
  saveState / getStateObject
```

**Rationale:** Map is stateless and deterministic (same inputs → same output). Define is stateful (counters, unique-value registries) and requires LockService for concurrent safety. Different callers in the pipeline: Map runs during `processFusionAccount`, Define runs as a separate phase in `refreshUniqueAttributes`.

### D4: Source file layout

```
src/model/
  fusionRun.ts          ← FusionRun class + FusionRunSnapshot type

src/services/
  mapService/           ← MapService + helpers + types
  defineService/        ← DefineService + StateWrapper + templateEvaluator + contextHelpers + types
  matchService/         ← MatchService + matchingRunner + analyzer + candidateRegistry + types
  fusionService/        ← reduced FusionService (orchestrator, ~600 lines)
```

**Rationale:** FusionRun is a data model (like FusionAccount), not a service. It goes in `src/model/`. The three new services follow the existing `src/services/<name>/` pattern.

### D5: ServiceRegistry changes

Current (simplified):
```
this.scoring = new ScoringService(config, log)
this.attributes = new AttributeService(config, schemas, sources, log, locks)
this.fusion = new FusionService(config, log, identities, sources, forms, attributes, scoring, schemas, ...)
```

Proposed:
```
this.fusionRun = new FusionRun()                           // created first
this.mapService = new MapService(config, log)              // stateless, no deps
this.defineService = new DefineService(config, schemas, log, locks, this.fusionRun)  // needs counters
this.matchService = new MatchService(config, log, this.fusionRun, this.forms, this.defineService)  // depends on forms + define
this.fusion = new FusionService(config, log, identities, sources, forms, this.mapService, this.defineService, this.matchService, schemas, this.fusionRun)
```

### D6: RecordingService simplification

Before:
```typescript
startOperation(operation, input, res, sources, identities, forms)
snapshotState(sources, identities, forms)  // digs into 3 internals
```

After:
```typescript
startOperation(operation, input, res, run: FusionRun)
snapshotState(run)  // run.snapshot() — single call
```

## Risks / Trade-offs

[R1] FusionRun becomes a large object with many fields → Mitigation: Clear field grouping (Managed, Fusion, Identity, Matching, Metrics). Accessor methods for common patterns. TypeScript interfaces enforce groupings.

[R2] Deferred matching flow is tightly coupled → Mitigation: ManagedAccountMatchingRunner already handles the two-sweep orchestration with a clean interface. CandidateRegistry already manages the candidate queue. No change to the matching algorithm.

[R3] DecisionProcessor currently reaches through FusionService as a service locator → Mitigation: Give DecisionProcessor explicit dependencies (FusionRun, FormService, SourceService, IdentityService) instead of FusionService.

[R4] Test migration volume — 19 test files across the affected services → Mitigation: Phased approach. Phase 1 (FusionRun) is a state extraction with no behavioral change. Phase 2 (Map/Define) splits existing tests. Phase 3 (Match) renames and expands tests.

[R5] Intermediate state during refactoring — half-migrated services could cause CI failures → Mitigation: Each phase is independently mergeable with passing tests. No long-running feature branches.

## Migration Plan

### Phase 1: FusionRun (state extraction)
1. Create `src/model/fusionRun.ts` with FusionRun class
2. Move managedAccountsById from SourceService → FusionRun
3. Move identityMap from IdentityService → FusionRun
4. Move fusionAccountMap, fusionIdentityMap, autoAssignedIdentityIds, analysisRecorder from FusionService → FusionRun
5. Update RecordingService to snapshot FusionRun
6. All tests pass (behavior unchanged)

### Phase 2: MapService + DefineService
1. Create `src/services/mapService/` from AttributeService map-related code
2. Create `src/services/defineService/` from AttributeService define-related code
3. Update ServiceRegistry to instantiate MapService and DefineService
4. Update callers to use new services
5. Delete `src/services/attributeService/`
6. All tests pass

### Phase 3: MatchService
1. Create `src/services/matchService/` from ScoringService + FusionService match handlers
2. Move ManagedAccountMatchingRunner, ManagedAccountAnalyzer, CandidateRegistry to matchService/
3. Expand match-service spec
4. Shrink fusion-service spec
5. Update ServiceRegistry
6. Delete `src/services/scoringService/`
7. All tests pass

### Phase 4: Recording & Replay
1. FusionRun.snapshot() at each phase boundary
2. RecordingService simplified
3. Deterministic replay from checkpoint

## Open Questions

- Should FusionService hold a reference to FusionRun or receive it per-method? Constructor injection preferred — avoids threading through every call.
- Should FormService state (fusionIdentityDecisions, pendingCandidateIds) also move to FusionRun? Yes — consistent with the single-source-of-truth pattern.
- Should AggregationTracker live in FusionRun or stay on FusionService? Move to FusionRun — it's run-scoped state.
