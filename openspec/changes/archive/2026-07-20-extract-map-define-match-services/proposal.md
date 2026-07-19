# Proposal: Extract Map/Define/Match Services

## Why

The codebase conflates service responsibilities in ways that make the system harder to understand, debug, and test:

- **FusionService** (1619 lines) is a god-class orchestrator that handles pipeline coordination, match outcome dispatch, form creation, reviewer management, and report generation.
- **AttributeService** (1344 lines) conflates two distinct sequential phases — **Map** (attribute merging from sources) and **Define** (Velocity template evaluation and unique value generation) — with different invariants, callers, and state management needs.
- **ScoringService** (~500 lines) is narrowly named — it does more than scoring; it supports the entire matching pipeline including trigram indexing, normalization caching, and candidate pre-filtering.

The project's own documentation (`docs/concepts/map-define-match.md`) and ubiquitous language spec already describe three conceptual phases: **Map → Define → Match**. The implementation should reflect this.

Additionally, state is scattered across services (SourceService, IdentityService, FusionService, FormService), making debugging difficult and deterministic replay impossible. Centralizing state into a single `FusionRun` object enables cleaner service boundaries and snapshot-based recording.

## What Changes

1. **Create `FusionRun`** — a centralized state container that holds all mutable data for a single operation run. Services become stateless and operate on `FusionRun` instead of owning internal state.

2. **Split `AttributeService` into `MapService` + `DefineService`** — MapService handles attribute merging from managed source accounts. DefineService handles Velocity template evaluation, unique value generation, counter management, and key generation. AttributeService is deleted.

3. **Rename `ScoringService` → `MatchService`** — expands scope from pure scoring algorithms to include match outcome dispatch (exact match, identity match, partial match, deferred match, non-match). Absorbs ManagedAccountMatchingRunner, ManagedAccountAnalyzer, and CandidateRegistry from FusionService.

4. **Simplify `FusionService`** — reduces from ~1619 to ~600 lines as the pure pipeline orchestrator. Loses match handlers, matching runners, and state management. Keeps pipeline phases, reviewer management, identity processing delegation, ISC account output, and report generation.

## Capabilities

### New Capabilities
- **map-service** — stateless service for attribute consolidation (Map phase)
- **define-service** — stateless service for attribute computation and unique value generation (Define phase)
- **fusion-run** — centralized state container with snapshot/restore for recording and replay

### Modified Capabilities
- **fusion-service** — loses match handling, gains delegation to MatchService; scope reduced to orchestration
- **scoring-service** — renamed to **match-service**, scope expanded to include match outcome dispatch
- **recording-service** — simplified: snapshots FusionRun instead of individual services
- **service-registry** — updated dependency graph; FusionRun added, AttributeService/ScoringService removed
- **ubiquitous-language** — new terms (MapService, DefineService, MatchService, FusionRun); retired terms (AttributeService, ScoringService)

### Deleted Capabilities
- **attribute-service** — replaced by map-service + define-service

## Impact

- **Code**: ~1000 lines of state management extracted from services into FusionRun. AttributeService split into two focused services. ScoringService renamed and expanded. FusionService simplified.
- **Tests**: AttributeService tests split between Map/Define. ScoringService tests renamed. FusionService tests updated for delegation. New FusionRun tests.
- **Documentation**: Ubiquitous language updated. Glossary updated. 6 .drawio diagrams updated. 3 new specs created, 2 renamed, 1 deleted.
- **API**: No breaking changes to config schema or connector operations. Internal-only refactor of service interfaces.
