## Context

The connector has two operations that share an identical pipeline: `std:account:list` (persistent aggregation) and `custom:dryrun` (non-persistent analysis). Both delegate to `PipelineRunner.run` in `src/operations/helpers/corePipeline.ts` (493L), which exposes 13 symbols — five phase functions exported for testing, four types, a static runner class, and a utility. The `targetPhase` ladder (6 early-exit branches) exists solely so `dryRun.ts` can stop after the `'process'` phase, then re-implement output+report phases outside via `dryRunHelpers.ts` (473L) and `buildDryRunPayload.ts` (472L).

The 2026-07-21 architecture review deepened the rest of the codebase: the Match step consolidated into `MatchOutcomeDispatcher`, `FusionRun` became the single source of truth for run-scoped state, the FusionAccount facade collapsed into behavior-rich objects, account-assembly extraction eliminated processor duplication, the ISC API client consolidated to one `call()` verb, and the messaging layer was re-cut along domain nouns. The FusionRun + stateless-services migration is the enabler for this change: the pipeline mode (`{kind:'aggregation'|'dry-run'}`) now only gates persistence and output policy — no state-threading remains.

## Goals / Non-Goals

**Goals:**
- Merge dry-run into `std:account:list` via an optional `dryRun` input parameter
- Unify output: dry-run rows are plain `StdAccountListOutput`, identical to aggregation rows
- Delete the `custom:dryrun` command, its helpers, and the enrichment/categorization machinery (~1,400 lines)
- Deepen the operation-run module: private phases, one run descriptor, one test surface (scenario harness)
- Align dry-run report with aggregation report (includeNonMatches=false, shared renderer)

**Non-Goals:**
- Changing aggregation behavior, timing, or output for platform invocations
- Changing the FusionRun state container or any stateless service
- Modifying the report rendering engine (Handlebars templates)
- Adding new configuration settings (dry-run mode is input-scoped, not config-scoped)
- Auto-migrating existing `custom:dryrun` scripts (CHANGELOG migration note only)
- Adding `saveRows` / rows-to-disk escape hatch (stdout redirect covers out-of-platform use)

## Decisions

### D1: Merge at the command seam, not below it

- **Choice:** `std:account:list` gains a `dryRun` input parameter. The `custom:dryrun` command is deleted.
- **Rationale:** Out-of-platform execution (spcx, proxy mode) allows extending `StdAccountListInput` with optional attributes the platform never sends. One command = one product surface.
- **Alternatives considered:**
  - *Two commands, one module behind both* (architecture review candidate 2): preserves command separation after module deepening removes its rationale.
  - *Config setting*: dangerous — would silently toggle persistence on platform-scheduled aggregations.

### D2: Input shape — `dryRun` object

- **Choice:** `{ dryRun: { enabled: boolean, saveFile?: boolean, sendEmail?: string | string[] } }` on the account-list input.
- **Rationale:** Object groups related options; `enabled` is the explicit mode switch. Sub-options ignored when `enabled` is falsy.
- **Alternatives considered:**
  - *Flat boolean `dryRun: true`*: no room for sub-options without polluting top-level input.
  - *Infer from `saveFile`/`sendEmail` presence*: hides mode switch; can't express "dry run, no output flags."

### D3: 1-to-1 row output, enrichment deleted

- **Choice:** Dry-run rows are plain `StdAccountListOutput` via `res.send`. `matchingStatus`, `reportCategories`, `review`, `sourceStatus`, `correlationStatus`, and `orphan-deferred:*` stubs are deleted.
- **Rationale:** One output shape = one contract. Analysis value lives in the HTML report (already carries per-account match data) and terminal summary. ~700 lines deleted.
- **Alternatives considered:**
  - *Keep enrichment on rows*: preserves return-value compatibility but doubles output contract maintenance. Rejected — 1-to-1 is the user's explicit goal.
  - *`saveRows` flag*: escape hatch for response-size limits. Rejected — out-of-platform execution means spcx stdout = response; piping to file is trivial.

### D4: Report includeNonMatches = false

- **Choice:** Dry-run report uses `includeNonMatches: false` — same as aggregation report. Non-match data appears as consolidated counters, not per-account rows.
- **Rationale:** Full email structural alignment between dry-run and aggregation reports. The HTML report title keeps `'Identity Fusion Dry Run Report'` to distinguish analysis from persisted results.
- **Alternatives considered:**
  - *Keep `includeNonMatches: true`*: preserves per-account non-match visibility in the report for tuning workflows. Rejected — user chose alignment.

### D5: Module deepening — one operation-run module

- **Choice:** `corePipeline.ts` becomes the implementation of a deepened operation-run module. Phases go private; `targetPhase` ladder dies; `PipelineMode`/`OperationContext` duplication collapses into a run descriptor `{ persistence, outputPolicy, dryRunOptions? }`. Interface: 13 symbols → 1 verb parameterized by descriptor. `fetchAndProcessForReport` (reportAction's mini-pipeline) is served by the same module.
- **Rationale:** FusionRun made services stateless — the mode only gates persistence/output policy, which is what a descriptor carries. Deletion test: `targetPhase` ladder + phase exports delete cleanly.
- **Alternatives considered:**
  - *Keep `targetPhase` and exports*: preserves tests but preserves the shallow interface. Rejected — test at the verb, not the internals.

### D6: Validation — ignore, don't reject

- **Choice:** `saveFile`/`sendEmail` present without `enabled: true` → silently ignored (no error).
- **Rationale:** Platform invocations never send `dryRun` at all; a hypothetical future where they do shouldn't error on sub-options. Fail-safe, not fail-closed.

## Risks / Trade-offs

**[Breaking] Automation scripts invoking `custom:dryrun` break**
→ Mitigation: CHANGELOG migration note + README updated with new invocation pattern. This is a major connector release; breaking command surfaces is expected.

**[Breaking] Consumers parsing `matchingStatus` on dry-run rows break**
→ Mitigation: Release notes document the contract change. The enriched data lives in the HTML report and summary; consumers can parse those instead.

**[Trade-off] Non-match per-account identity detail lost from report**
With `includeNonMatches: false`, tuning users see non-match **counts** (totals) but not **which** managed accounts failed. The fusion report builder's `FusionReportAccount` array still carries the match attempted flag — consolidated stats are preserved. Users needing per-account detail can inspect the summary counters or the Match configuration testing path.
→ Accepted for full report alignment.

**[Risk] Proxy-mode dry runs with large tenants**
In proxy mode, the HTTP response carries the full dry-run row stream. Without `writeToDisk`'s disk-escape mechanism, large responses may hit proxy/HTTP limits. However, proxy mode users can invoke `saveFile: true` to write the summary to disk and rely on the HTML report for per-account detail.
→ Mitigation: document `saveFile` as the large-tenant escape hatch in README.

**[Internal] Phase export deletion breaks corePipeline.test.ts**
`corePipeline.test.ts` (450L) directly imports and calls phase functions with a hand-rolled mock registry. The deepening moves tests to the verb interface (two scenario-harness patterns: aggregation and dry-run). This is a test refactor, not a spec change.
→ Mitigation: tasks include rewriting these tests against the new interface.

## Migration Plan

**Deployment sequence:**
1. Implement the deepened operation-run module and accountList input extension
2. Update accountList scenario harness with dry-run mode scenarios
3. Delete `custom:dryrun` command, helpers, and tests
4. Update `ubiquitous-language` spec (term change)
5. Update docs (README, glossary, match guide)
6. Generate CHANGELOG with migration note
7. Run full test suite (`npm test`) and lint (`npm run lint`)

**Rollback strategy:**
Revert to prior commit. The `custom:dryrun` command in prior version works independently. No database/schema changes.

**Acceptance criteria:**
- `npm test` passes (all existing + new scenario harness tests)
- `npm run lint` passes
- `npm run build` succeeds
- `std:account:list` without `dryRun` input produces identical output to before
- `std:account:list` with `{ dryRun: { enabled: true } }` produces 1-to-1 rows + terminal summary
- `custom:dryrun` invocation errors with unknown command (command removed)
- `{ dryRun: { enabled: true, saveFile: true } }` writes summary+HTML report to `./reports/`
- `{ dryRun: { enabled: true, sendEmail: "a@b.com" } }` sends report email
- `fetchAndProcessForReport` (reportAction) works unchanged

## Open Questions

- **sendEmail type resolution:** Accept `string | string[]` as brainstormed, or settle on one (the existing `sendReportTo` path uses `string[]`). Resolved by convention: wrap single string into array before `sanitizeRecipients`.
- **Terminal summary shape:** Exact fields in the dry-run summary object. Resolved during implementation — contents from `buildDryRunSummary` minus optionEmitCounter/options (categories deleted).
- **Proxy mode streaming timeout:** Currently `custom:dryrun` uses `keepAlive: 'simple'` + 15s interval; accountList uses `keepAlive: 'memory'`. Dry-run mode inherits accountList's keepAlive policy (`'memory'`). If this causes proxy timeouts for dry runs that have a long fetch phase before emitting rows, the `memory` keepAlive should handle it (it sends NDJSON keepalive lines during idle periods). Monitor.
