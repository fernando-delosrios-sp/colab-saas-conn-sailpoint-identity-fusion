## Context

`FusionService` (`src/services/fusionService/fusionService.ts`) currently owns managed-account analysis recording and report-account ID resolution as private methods. These responsibilities are cohesive, stateful/stateless respectively, and have narrow dependencies, making them ideal extraction targets.

The codebase uses TypeScript, Vitest, and an existing `AggregationTracker` plus `fusionReportBuilder.ts` helper pipeline. The change is a structural refactor; no connector behavior or public API changes.

## Goals / Non-Goals

**Goals:**
- Reduce `FusionService` size by extracting report-account ID resolution into pure functions in `reportAccountResolver.ts`.
- Reduce `FusionService` size by extracting managed-account analysis recording into `managedAccountAnalysisRecorder.ts`.
- Keep `FusionService` as the public API for all connector operations; internal delegation only.
- Ensure all existing `fusionService.test.ts` tests pass without modification.
- Add focused unit tests for the two new modules.
- Keep lint, typecheck, and full test suite green.

**Non-Goals:**
- Refactor account blending, scoring orchestration, or other `FusionService` responsibilities.
- Change behavior of aggregation tracking, deferred matching, or report generation.
- Introduce new dependencies or change package structure beyond `src/services/fusionService/`.

## Decisions

### D1: Two-module extraction
- **Choice:** Create `reportAccountResolver.ts` (pure functions) and `managedAccountAnalysisRecorder.ts` (stateful class).
- **Rationale:** The resolver is stateless and has no side effects; pure functions are the simplest model. The recorder mutates `AggregationTracker` and holds configuration/context; a class with injected dependencies is clearer.
- **Alternatives considered:** Single combined module (rejected because the two concerns are independent). Class-based resolver (rejected because it adds ceremony for stateless logic).

### D2: Report builder decouples from `FusionService` callback
- **Choice:** Remove `resolveReportAccountId` callback from `FusionReportState`; add `sources: SourceService` and import resolver functions directly in `fusionReportBuilder.ts`.
- **Rationale:** The builder already receives most report inputs. Passing `SourceService` lets it resolve IDs without a callback owned by `FusionService`, eliminating a coupling point.
- **Alternatives considered:** Keep the callback (rejected because it preserves the `FusionService` → builder dependency).

### D3: Recorder depends on narrow interfaces, not `FusionService`
- **Choice:** `ManagedAccountAnalysisRecorder` receives `log`, `tracker`, `urlContext`, `reportAttributes`, `sourcesByName`, `config`, `analyzer`, and `sources` via a constructor dependency interface.
- **Rationale:** A narrow dependency list keeps the module testable and prevents it from re-entrantly depending on `FusionService`.
- **Alternatives considered:** Passing the whole `FusionService` instance (rejected because it would recreate the god-object coupling).

### D4: Preserve exact behavior during extraction
- **Choice:** Copy existing conditional branches, logging, and tracker mutations into the recorder and resolver; verify with existing tests.
- **Rationale:** Refactors must not change behavior. The existing test suite is the safety net.
- **Alternatives considered:** Simplify logic while extracting (rejected because it risks behavior changes).

## Risks / Trade-offs

- **[Risk] Stale extraction source** — The provided implementation plan may not match the current file contents exactly. `recordManagedAccountAnalysis` contains additional side effects for deferred authoritative sources and `trackFailedMatching` includes comparison counts.
  - **Mitigation:** Re-read the current `FusionService` source before implementing; compare each extracted branch side-by-side; run the existing test suite after each task.
- **[Risk] Implicit `AggregationTracker` coupling** — The recorder writes directly to tracker fields. Future tracker changes will require recorder updates.
  - **Mitigation:** Focused unit tests on the recorder will fail if the tracker shape changes, making the coupling visible.
- **[Risk] `FusionAccount` reference identity** — The recorder uses `WeakMap<FusionAccount, number>` for comparison counts.
  - **Mitigation:** Preserve the exact reference flow from `FusionService` to the recorder.
- **[Trade-off] More files, smaller modules** → Accept more files in exchange for improved testability and reduced `FusionService` complexity.

## Migration Plan

N/A — This is a code-only structural refactor. No deployment, database, or configuration changes are required. Rollback is a revert of the affected source files.

## Open Questions

- Should the new recorder module also own the deferred-matching side effects currently inside `recordManagedAccountAnalysis` (i.e., `setFusionAccount` and `registerCurrentRunUnmatchedCandidate`), or should those remain in `FusionService`? Decision: keep them in `FusionService` unless the existing test suite proves they belong with recording.
