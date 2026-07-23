<!--
Raw capture of superpowers:brainstorming output — decision log from architecture review + grilling loop.
This is the natural output of the brainstorming process, captured as a decision chain.
design.md reorganized this into structured sections.
-->

# Brainstorm: Consolidate dryRun into accountList

## Background

The 2026-07-21 architecture review deepened the codebase substantially (Match step, FusionRun consolidation, facade collapse, account-assembly extraction, one-verb ISC API client, messaging re-cut). The 2026-07-23 follow-up review scoped to the operation layer surfaced the last shallow frontier:

- `accountList.ts` (39L) and `dryRun.ts` (110L) share `PipelineRunner.run` (`corePipeline.ts`, 493L) with a discriminated union `PipelineMode { aggregation | dry-run }`.
- `PipelineRunner` exposes a `targetPhase` early-exit ladder (6 exits) so dryRun can stop at `'process'` then re-implement output+report phases outside via `dryRunHelpers.ts` (473L) + `buildDryRunPayload.ts` (472L).
- The module interface is 13 exported symbols (5 phase functions exported for testing, `PipelineRunner` class, 4 types, 1 utility export).
- `PipelineMode` ({kind:'aggregation'|'dry-run'}) duplicates `OperationContext` enum ('accountList'|'custom:dryrun') plus raw command-name strings — three representations of "which operation is running."
- The mode comment claimed "customReport, reportAction's mini-pipeline" as additional callers — stale for customReport (doesn't exist), accurate for `fetchAndProcessForReport` in `generateReport.ts`.
- Tests: `accountList.test.ts` (226L, scenario harness, one seam); `dryRun.test.ts` (779L, 255-line hand-rolled mock registry); `corePipeline.test.ts` (450L, pokes exported phases with its own mock factory).
- FusionRun migration (f038387) and account-assembly extraction (5f991ba) made services stateless — the pipeline's `mode` now only gates **persistence and output policy**, making a deepening safe.

## Core Insight

The user proposed absorbing `dryRun` into `accountList` with an input parameter, getting rid of `corePipeline` in favor of a versatile `accountList`. The architecture review raised a counterargument: `std:account:list` is an SDK-owned contract (`StdAccountListInput = { stateful?, state?, schema? }` — fixed). The user clarified: dry-run is a custom command executed **outside the platform** (via spcx or direct invocation), so extending the input signature with optional attributes the platform never sends is acceptable. The platform contract is a limitation for platform execution only; out-of-platform runs can pass arbitrary input.

## Decision Chain

### D1 — Merge at the command seam or below it?

**Context:** Two commands sharing a pipeline could be merged at two levels: (a) one command (`std:account:list`) gains an optional input flag, or (b) a deepened module behind both commands with two verbs, commands stay separate.

**Decision:** Merge at the command seam — `std:account:list` gains optional `dryRun` input. Platform invocations never send the flag; out-of-platform invocations (spcx, proxy mode direct) pass it. The `custom:dryrun` command is deleted.

**Rationale:** The user confirmed out-of-platform execution allows extending the input with optional attributes the platform won't send. One command with one input surface simplifies the product surface. The SDK `StdAccountListInput` type is extended locally (TypeScript structural compatibility).

**Alternative considered:** Keep two commands, one module behind both (architecture review candidate 2). Rejected because it preserves the command split after the module deepening removed its reason to exist — and the user explicitly advocated merging at the command level.

### D2 — Input shape: how is dry-run mode selected?

**Decision:** A `dryRun` object parameter on the input: `{ dryRun: { enabled: boolean, saveFile?: boolean, sendEmail?: string | string[] } }`. When `enabled` is `true`, the operation runs in non-persistent dry-run mode. Platform runs never receive this field; `enabled` defaults to `false`.

**Rationale:** An object groups related options; `enabled` makes the mode switch explicit. `enabled` (not just `dryRun: true`) allows future extensibility within the object.

**Alternatives considered:**
- `dryRun: boolean` — too flat, no room for sub-options.
- Infer from presence of `saveFile`/`sendEmail` — hides the mode switch; can't distinguish "dry run with no output flags" from "not a dry run."
- Config setting — dangerous: would silently turn platform-scheduled aggregations non-persistent.

### D3 — Output shape: 1-to-1 rows

**Decision:** Dry-run rows are byte-identical to aggregation rows — plain `StdAccountListOutput` via `res.send`. The existing enrichment payloads (`matchingStatus`, `sourceStatus`, `correlationStatus`, `reportCategories`, `review`, synthetic `orphan-deferred:*` stubs) are **deleted**. Row analysis value moves to the HTML report (already carries per-account match/deferred/non-match data) and terminal summary object.

**Rationale:** 1-to-1 output simplifies the contract (one output shape, two modes) and deletes ~700 lines of enrichment/categorization/streaming machinery. The `writeToDisk` escape hatch for response-size limits (`saveRows` option) was considered but rejected — out-of-platform execution means spcx stdout is the response, trivial to redirect.

**Consequence:** Consumers parsing `matchingStatus` off dry-run rows break. The README documents these payloads — the change is a documented contract break in the connector release notes.

### D4 — Report content: align with aggregation report

**Decision:** The dry-run report uses `includeNonMatches: false`, matching the default aggregation report exactly. Non-matched accounts appear as consolidated counters in the report totals/stats, not as per-account rows. The HTML report title keeps the `'Identity Fusion Dry Run Report'` constant to distinguish analysis from persisted aggregation.

**Rationale:** Alignment with the aggregation report makes the dry-run email structurally identical (same renderer, same template, same section structure). The title marker prevents recipients from confusing analysis results with real aggregation outcomes.

**Consequence:** A tuning user sees non-match **counts** (totals/stats) but not **which** managed accounts failed to match. Tuning workflows relying on per-account non-match detail in the row stream or report must shift to the summary counters or pre-existing Match configuration testing.

### D5 — Extra options explicitly rejected

- **`saveRows`** — rows-to-disk escape hatch for response-size limits. Rejected because out-of-platform execution routes rows through spcx stdout (trivially redirectable to file).
- **7 `include*` category filters** — existed to subset an enriched row stream. 1-to-1 output makes them obsolete.
- **`includeNonMatches` toggle on input** — fixed to `false` for alignment; no runtime toggle needed.

### D6 — Validation behavior

**Decision:** `saveFile` and `sendEmail` are silently ignored when `dryRun.enabled` is falsy (absent or `false`). No validation error. This avoids a new error path for platform runs that somehow receive these fields.

### D7 — custom:dryrun command deletion

**Decision:** The `custom:dryrun` command is fully deleted — registration in `index.ts`, entry in `connector-spec.json`, the operation file (`dryRun.ts`), its helpers (`dryRunHelpers.ts`, `buildDryRunPayload.ts`), all tests, and all documentation references.

**Migrate:** Any automation invoking `custom:dryrun` must switch to invoking `std:account:list` with `{ dryRun: { enabled: true }}`. Documented in CHANGELOG + connector release notes as a breaking change.

### D8 — Remaining grilling points (settled at plan time)

- **sendEmail type:** `string | string[]` — accepts a single address or list; passes through sanitizeRecipients (existing `sendReportTo` path).
- **Summary content:** Always `res.send` a terminal summary object at end of dry-run run (unless `saveFile` — then summary goes to disk, same as today's disk path). Content: rowsSent, totals (identitiesFound, managedAccountsFound, fusionAccountsFound), issueSummary, timing, report paths.
- **Ubiquitous-language spec:** "dryRun operation" term becomes "dry-run mode" of the accountList operation. Updated before code per spec-first rule.
- **OperationContext:** wire value `'custom:dryrun'` stays internal (used by `shouldCaptureManagedAccountReportData`); its semantic shifts from "this is the custom:dryrun command" to "this is a dry-run mode run of accountList."

## Design Trade-offs

| Trade-off | For | Against | Decision |
|---|---|---|---|
| Delete ~1000 lines of enrichment/streaming | Simpler contract, fewer test mocks, 1-to-1 output | Consumers parsing matchingStatus off rows break | Delete — CHANGELOG migration note |
| includeNonMatches: false for dry-run report | Full alignment with aggregation report email | Tuning users lose per-account non-match identity detail | Align — counters are sufficient |
| Delete custom:dryrun command entirely | One command surface, cleaner product | Existing scripts invoking custom:dryrun break on upgrade | Delete with migration note |
| Operation-run module deepening | Locality: phases + policy in one module | Refactors three PipelineRunner callers at once | Accept — FusionRun migration enables it |

## Deepened Module Shape (preview)

After the change, the operation layer:
- **Thin adapters**: `accountList.ts` parses input, constructs run options, delegates to the deepened module.
- **Operation-run module**: one verb (`execute`) parameterized by a run descriptor (persistence policy, output policy, dry-run options). Phases are private. `PipelineMode`/`OperationContext` duplication collapses into the descriptor.
- **Deleted**: `dryRun.ts`, `dryRunHelpers.ts`, `buildDryRunPayload.ts`, `custom:dryrun` command registration, phase exports from `corePipeline.ts`, `targetPhase` ladder, 13-symbol interface.
- `fetchAndProcessForReport` (reportAction's mini-pipeline, a third `PipelineRunner` caller) is served by the same module: dry-run mode, targetPhase='process'.

Deleted line count: ~1,400 (dryRun.ts 110L + dryRunHelpers.ts 473L + buildDryRunPayload.ts 472L + categorization/streaming parts + dead mode machinery in corePipeline). Net reduction offset by the deepened module's interface (~80L of new descriptor/orchestration).
