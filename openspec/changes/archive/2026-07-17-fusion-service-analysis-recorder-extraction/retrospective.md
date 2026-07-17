# Retrospective: fusion-service-analysis-recorder-extraction

## What Was Done

Extracted two cohesive modules from the FusionService god object:
1. **reportAccountResolver.ts** — Pure functions for ISC account ID resolution (stateless)
2. **managedAccountAnalysisRecorder.ts** — Stateful recorder for analysis results (class with narrow deps)

## What Went Well

- **Clean extraction boundaries**: Both modules had narrow, well-defined dependencies that made extraction straightforward
- **Test-first approach**: Writing failing tests first caught the tracker initialization timing issue early
- **Behavior preservation**: All 959 existing tests passed without modification, confirming zero behavioral changes
- **Reduced complexity**: FusionService is now ~110 lines shorter and more focused

## What Could Be Improved

- **Tracker initialization timing**: The recorder initially received `this.tracker` directly in the constructor, but the tracker is set later via `setTracker()`. Fixed by passing a getter function `() => this.tracker` instead. This pattern should be documented for future extractions.
- **Deferred-matching side effects**: The original plan didn't fully account for the `setFusionAccount` and `registerCurrentRunUnmatchedCandidate` side effects that needed to stay in FusionService. These were preserved but required careful attention during implementation.

## Lessons Learned

- When extracting from a god object, pay attention to initialization order — getters that depend on late-bound state need lazy evaluation
- Side effects that span multiple concerns (like deferred matching registration) may need to stay in the orchestrator even when the core logic is extracted
- Pure function extraction (resolver) is simpler than stateful extraction (recorder) — consider this when planning similar refactorings

## Metrics

- **Lines extracted**: ~110 lines from FusionService
- **New files**: 2 source files, 2 test files
- **Test coverage**: 9 new unit tests (5 resolver + 4 recorder)
- **Regressions**: 0
- **Commits**: 2 (one per extraction phase)

## Next Steps

No immediate follow-ups. The extracted modules are stable and well-tested. Future work could consider extracting additional FusionService responsibilities (account blending, scoring orchestration) if the god object grows again.
