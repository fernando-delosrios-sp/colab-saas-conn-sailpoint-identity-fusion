## Why

The account-list spec drift audit flagged missing list-input filter handling as a high-severity behavioral gap. Investigation shows code already applies **Accounts API filter** (`accountFilter` in source configuration) at fetch time via `SourceService.buildIscAccountsQueryFilter`. The mismatch is spec wording: the account-list scenario says "invoked with filter criteria," which reads like `StdAccountListInput` filters that do not exist. The source-service spec further conflates Accounts API filters with JMESPath filters. Honest specs prevent false audit findings and misdirected implementation work.

## What Changes

**Account-list operation spec**
- From: Scenario "Account listing with filters" implies operation invocation carries filter criteria and output is row-filtered at send time.
- To: Scenario describes fetch-scoped aggregation when a source has **Accounts API filter** configured; cross-references source-service; clarifies managed accounts outside the filter never enter the pipeline.
- Reason: Align spec with implemented architecture and owner intent.
- Impact: Non-breaking documentation correction; removes false high-severity drift signal.

**Source-service spec**
- From: Single requirement/scenario conflates all filtering as "jmespath" with an ISC search-syntax example.
- To: Requirement distinguishes **Accounts API filter** (server-side `accountFilter`) and **Accounts JMESPath filter** (client-side page filter); separate scenarios for each.
- Reason: Correct terminology matches `accountFilters.ts` and connector configuration UI.
- Impact: Non-breaking documentation correction.

## Capabilities

### New Capabilities

_(None.)_

### Modified Capabilities

- `account-list-operation`: Replace misleading filter scenario; add fetch-scoped cross-reference scenario.
- `source-service`: Split and correct filter requirement scenarios (API filter vs JMESPath filter).

## Impact

- `openspec/specs/account-list-operation/spec.md` (via delta merge on archive)
- `openspec/specs/source-service/spec.md` (via delta merge on archive)
- Optional: note in `.scratch/spec-drift-report.md` that account-list filter item is resolved as spec-only (manual, not blocking)
- **No** `src/` changes
- **No** test changes required (existing source-service tests already cover API filter behavior)
