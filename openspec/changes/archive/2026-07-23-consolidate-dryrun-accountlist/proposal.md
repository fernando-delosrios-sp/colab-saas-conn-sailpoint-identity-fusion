## Why

The `std:account:list` and `custom:dryrun` operations share an identical pipeline (`PipelineRunner` in `corePipeline.ts`) but fork on mode flags, output shape, and delivery. This duplication produces a shallow operation layer: `PipelineRunner` exposes 13 symbols and a `targetPhase` early-exit ladder solely so `dryRun` can stop mid-pipeline and re-implement the output+report phases outside via ~950 lines of enrichment/categorization/streaming helpers. The FusionRun migration made services stateless — the pipeline mode now only gates persistence and output policy — enabling a single deepened module behind one operation.

## What Changes

**Account list gains a dry-run mode**
- From: `std:account:list` performs persistent aggregations only; dry runs require a separate `custom:dryrun` command.
- To: `std:account:list` accepts an optional `dryRun` input parameter (`{ enabled, saveFile?, sendEmail? }`). When `enabled` is true, the operation runs non-persistently. Platform invocations never send the field; out-of-platform invocations (spcx, proxy) pass it.
- Reason: One command surface, one pipeline, reduced duplication.
- Impact: Breaking — `custom:dryrun` is removed; automation scripts must switch to account-list with `dryRun.enabled`.

**Output rows unified: 1-to-1**
- From: Dry-run rows carry `matchingStatus`, `sourceStatus`, `correlationStatus`, `reportCategories`, `review` payloads, and synthetic `orphan-deferred:*` stubs.
- To: Dry-run rows are plain `StdAccountListOutput`, byte-identical to aggregation rows. Analysis value moves to the HTML report and terminal summary object.
- Reason: Simplifies the output contract; deletes ~700 lines of enrichment/categorization machinery.
- Impact: Breaking — consumers parsing `matchingStatus` off dry-run rows break.

**`custom:dryrun` command deleted**
- From: Separate registered command with 9 input options and specialized output shape.
- To: Command registration removed; `dryRun.ts`, `dryRunHelpers.ts`, `buildDryRunPayload.ts` deleted; logic absorbed into the deepened operation-run module.
- Impact: Breaking — documented in CHANGELOG with migration note.

**Operation-run module deepened**
- From: `PipelineRunner` with 13 exported symbols, `targetPhase` ladder, phase functions exported for tests, duplicate mode representations (`PipelineMode`, `OperationContext`, command strings).
- To: One module with private phases; run descriptor carries persistence/output policy; `PipelineMode`/`OperationContext` duplication collapses; reportAction's `fetchAndProcessForReport` served by the same module.
- Reason: Locality — phase order, timer, lock/crash policy in one module. Test surface: two verbs, scenario harness.
- Impact: Internal refactor; no external contract change.

**Dry-run report aligned with aggregation report**
- From: `includeNonMatches: true` in dry-run report (per-account non-matched rows).
- To: `includeNonMatches: false` — same as aggregation report; consolidated counters only.
- Reason: Full email alignment between dry-run and aggregation reports.

## Capabilities

### Modified Capabilities

- `account-list-operation`: Gains optional `dryRun` input parameter with three sub-options (`enabled`, `saveFile`, `sendEmail`). In dry-run mode: non-persistent execution, 1-to-1 `StdAccountListOutput` rows, terminal summary object, optional file output and email delivery.
- `custom-dryrun-operation`: **Removed** — all requirements (non-persistent analysis, report generation, email delivery, file output) absorbed into `account-list-operation`'s dry-run mode. Spec deleted.
- `ubiquitous-language`: "dryRun operation" term becomes "dry-run mode" of the accountList operation. `OperationContext.CustomDryRun` wire value semantic shifts from command name to internal mode marker (no external consumers).
- `report-service`: Dry-run report uses `includeNonMatches: false` (aligned with aggregation report). Dry-run runtime options reduced from 9 (include* filters + writeToDisk + sendReportTo) to 2 (saveFile, sendEmail).

## Impact

**Code:**
- Added: deepened operation-run module interface (~80L), accountList input parsing
- Modified: `accountList.ts`, `corePipeline.ts` (phases private, new descriptor), `index.ts` (dry-run registration removed), `connector-spec.json`, `reportService.ts`, `generateReport.ts`, `fusionService.ts`, `accountAssembly.ts`
- Deleted: `dryRun.ts` (110L), `dryRunHelpers.ts` (473L), `buildDryRunPayload.ts` (472L), `custom:dryrun` command registration, `PipelineMode` union, `OperationContext` enum (replaced by descriptor)
- Net deletion: ~1,400 lines removed, ~300 added

**Tests:**
- Added: accountList scenario harness dry-run mode scenarios
- Modified: `corePipeline.test.ts` (moves to operation-run verb tests), `operationTestRegistry.ts`
- Deleted: `dryRun.test.ts` (779L), `dryRunHelpers.test.ts`, `buildDryRunPayload.test.ts`

**Documentation:**
- Modified: `README.md` (custom:dryrun section → accountList dry-run mode), `docs/concepts/glossary.md`, `docs/guides/match.md`
- Deleted: `docs/operations/custom-dryrun.md`
- Added: `CHANGELOG.md` migration note

**Spec files:**
- Modified: `openspec/specs/account-list-operation/spec.md`, `openspec/specs/ubiquitous-language/spec.md`, `openspec/specs/report-service/spec.md`
- Deleted: `openspec/specs/custom-dryrun-operation/spec.md`
