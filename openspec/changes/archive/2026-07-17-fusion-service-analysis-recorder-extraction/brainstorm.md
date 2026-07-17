<!--
Raw capture of superpowers:brainstorming output.

本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

# FusionService Report Recording Extraction — Brainstorm

## Background

`FusionService` in `src/services/fusionService/fusionService.ts` has grown into a god object that owns account blending, scoring orchestration, aggregation tracking, and report generation logic. Two cohesive chunks of behavior repeatedly surface in the file:

1. **Report account ID resolution** — converting a Fusion/managed account key to the ISC account ID used in report links.
2. **Managed-account analysis recording** — writing match/deferred/non-match/failure data into `AggregationTracker`.

Both chunks are self-contained, depend on narrow service interfaces, and are excellent candidates for extraction into focused modules. The goal is to shrink `FusionService` and make these responsibilities independently testable.

## Decision Chain

### Q1: What are we extracting?

- **Agreed:** Extract two modules from `FusionService`:
  - `reportAccountResolver.ts` — pure functions for report-account ID resolution.
  - `managedAccountAnalysisRecorder.ts` — stateful recorder class for analysis results.
- **Why not extract more?** Other responsibilities (account blending, scoring orchestration) are outside scope and touch broader interfaces. Limiting scope keeps the change reviewable and safe.

### Q2: Should the new modules live inside the `fusionService/` folder?

- **Agreed:** Yes. They are implementation details of the Fusion domain, so `src/services/fusionService/` is the right home. Tests go in `src/services/fusionService/__tests__/`, consistent with existing layout.

### Q3: Should the extraction preserve behavior exactly?

- **Agreed:** Yes. This is a structural refactor. All existing `fusionService.test.ts` tests must pass unmodified. New unit tests cover the extracted modules.
- **Consequence:** Any edge case in `recordManagedAccountAnalysis` or `trackFailedMatching` (e.g., deferred-matching side effects, failed-account comparison counts) must be reproduced in the recorder.

### Q4: How should `FusionReportState` change?

- **Agreed:** Remove the callback `resolveReportAccountId: (account: FusionAccount) => string | undefined`. Replace it with direct calls to `reportAccountResolver.ts` inside `fusionReportBuilder.ts`, passing `SourceService` through `FusionReportState`.
- **Why:** A callback owned by `FusionService` forces report building to know about `FusionService`. Passing `SourceService` lets the builder resolve IDs independently, decoupling report construction from `FusionService`.

### Q5: What is the public API boundary?

- **Agreed:** `FusionService` remains the public API for all connector operations. The new modules are internal delegates. Callers outside `fusionService/` should not import them.

## Design Trade-offs

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Extract pure resolver functions | Zero state, trivial to test, no mocking | Still need to pass `SourceService` | ✅ Use |
| Extract resolver as class | Consistent with recorder style | More boilerplate for stateless logic | ❌ Avoid |
| Recorder receives `FusionService` | Fewer constructor args | Keeps `FusionService` in the loop, defeats extraction | ❌ Avoid |
| Recorder receives narrow deps (`LogService`, `AggregationTracker`, etc.) | Clear contract, testable, no god-object dependency | Longer constructor arg list | ✅ Use |
| Inline recorder logic into existing helpers | Less code movement | Spreads responsibility across helper files | ❌ Avoid |

## Agreed Approach

1. Create `reportAccountResolver.ts` with `resolveReportAccountId` and `resolveReportAccountIdValue`.
2. Create `managedAccountAnalysisRecorder.ts` with `ManagedAccountAnalysisRecorder` class and a narrow dependency interface.
3. Add focused unit tests for both modules.
4. Update `FusionService` to delegate and remove the extracted private methods.
5. Update `fusionReportBuilder.ts` to import resolver functions and accept `SourceService` instead of a callback.
6. Run full test suite, typecheck, and lint; verify no behavior change.

## Risks Identified

- Stale plan: The source plan was written against an earlier version of the code. The actual `trackFailedMatching` and `recordManagedAccountAnalysis` implementations must be re-read during implementation to avoid dropping behavior.
- Tight coupling to `AggregationTracker` shape: Any change to tracker fields requires matching changes in the recorder. Tests will catch this.
- `WeakMap<FusionAccount, number>` semantics: The recorder stores per-account comparison counts; callers must ensure the same `FusionAccount` reference is used.
