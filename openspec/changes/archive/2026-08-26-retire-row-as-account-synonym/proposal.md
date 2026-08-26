## Why

Operators and agents still see **row** used for Fusion accounts, managed source accounts, and identity snapshots. The connector SDK does not use that word; ubiquitous language already retired **source record** but the glossary still says “non-matched rows” and “identity-origin row”. That leftover tabular slang collides with real tables (mappings, scores, HTML reports). Align living language now, before more specs copy “Fusion row” from Refresh work.

## What Changes

**Account taxonomy vs row**
- From: Fusion row, persisted fusion row, identity-origin row, managed-origin row, managed row, non-matched row, this row (for a Fusion account)
- To: Fusion account, identity-origin Fusion account, managed-origin Fusion account, managed source account, non-matched managed source account, this Fusion account
- Reason: Same family as the retired **source record**; accounts are not table lines
- Impact: Non-breaking — docs, living specs, comments; no runtime or config-key change

**Account-list streaming prose**
- From: “account rows” / “streamed rows” as the name of `StdAccountListOutput` payloads
- To: streamed Fusion accounts / `StdAccountListOutput` objects; summary key `rowsSent` unchanged
- Reason: Protocol listing is not a domain type
- Impact: Non-breaking — spec and docs wording; dry-run JSON field stays `rowsSent`

**Allowed table sense of row**
- Keep: attribute mapping/definition config rows, match score rows (`ExactMatchScoreRow`), HTML report / review-form table rows, phase-timing table rows, “per-account rows” in report HTML
- Reason: Those are tables
- Impact: None

**Retirement table**
- Add: Fusion row, identity-origin row, managed row, account row (as entity names) → canonical account terms
- Do not add **Row** as a domain entity

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `ubiquitous-language`: Retire row-as-account synonyms; rewrite glossary entries that currently say “row”; add an allowed table sense; extend documentation/code canonical-term scenarios
- `fusion-service`: Replace Fusion-row wording in source-snapshot materialization and refresh lookup requirements
- `fusion-run`: Replace “loaded Fusion row” with loaded Fusion account
- `matching-service/match-outcome-dispatch`: Linked-key scenarios use Fusion account, not Fusion row
- `mapping-service`: Managed-origin / identity-origin Fusion accounts, not rows
- `definition-service`: Same identity-context wording
- `account-list-operation`: Streaming and hydration prose; keep `rowsSent`

## Impact

- **Specs:** Deltas listed above; archive merges into `openspec/specs/`
- **Docs:** `docs/glossary.md`, `docs/concepts/glossary.md`, use-guides (source types mermaid, mapping, defining attributes, correlation, dry-run, index), `docs/operations/`, `docs/reference/velocity-context.md`
- **Code:** Comments/JSDoc/test titles in `src/` (e.g. `fusionLayers.ts`, `managedAccountLink.ts`, `fusionService.ts`, `accountList.ts`); no identifier rename of `rowsSent` or `ExactMatchScoreRow`
- **Tests:** Named scan (or equivalent) that living `docs/`, `openspec/specs/`, and `src/` do not use the retired account-row phrases, with allowlists for table contexts and `rowsSent`
- **Out:** `openspec/changes/archive/`, historical CHANGELOG bullets, connector-spec keys
