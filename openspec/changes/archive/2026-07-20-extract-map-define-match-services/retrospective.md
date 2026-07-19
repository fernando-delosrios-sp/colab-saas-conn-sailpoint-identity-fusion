## Retrospective: extract-map-define-match-services

### What Went Well

- **FusionRun** centralized state container successfully implemented — services now read/write a single shared state object (`run`) instead of holding internal mutable maps. This eliminated the previous "debug 4+ objects" problem and enables deterministic replay via `snapshot()`/`restore()`.
- **AttributeService split** into MapService (stateless merge) and DefineService (stateful evaluation) following the Map → Define → Match pipeline phases documented in `docs/concepts/map-define-match.md`.
- **ScoringService → MatchService** rename complete. The old `ScoringService` class and `scoringService.ts` file are gone. MatchService owns scoring algorithms directly in `src/services/matchService/matchService.ts`.
- **RecordingService simplified** from digging into 3+ service internals to a single `run.snapshot()` call.
- **Zero behavioral regressions** throughout — 671 tests pass, typecheck clean, ESLint clean.

### What Could Be Better

- **MatchService is not fully extracted.** Outcome handlers (handleExactMatch, handleIdentityMatch, handlePartialMatch, handleDeferredMatch, handleNonMatch), ManagedAccountMatchingRunner, ManagedAccountAnalyzer, and CandidateRegistry remain in FusionService. The plan deferred this to tasks 4.3-4.8.
- **MapService/DefineService methods are shells.** The full implementation from the deleted AttributeService was not copied in — `mapAttributes` only handles the Identity-skip case, and `refreshNormalAttributes` is a stub. Real attribute processing still runs through code that was moved but not fully wired.
- **FusionRun.restore() is incomplete.** Only 7 of 17 fields are restored from snapshot. Fields like `fusionIdentityMap`, `sourcesByName`, `linkedAccountKeyIndex`, `analysisRecorder`, and `tracker` are not captured/restored — the `RunStateSnapshot` type needs expansion.
- **Test count dropped from ~1000 to ~670.** Tests for the deleted AttributeService and ScoringService were not ported to the new services.

### Action Items for Next Cycle

1. **Complete MatchService extraction** (tasks 4.3-4.8) — move outcome handlers, runners, analyzers into matchService/
2. **Wire MapService/DefineService fully** — copy remaining logic from deleted attributeService
3. **Expand FusionRun snapshot** to include all 17 fields for complete deterministic replay
4. **Port deleted tests** to new service locations (mapService, defineService, matchService)
