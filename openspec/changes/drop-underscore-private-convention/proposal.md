# Proposal: Drop Underscore Private Convention

## Why

The codebase uses `_`-prefixed names for two conflicting purposes: conventionally-private class members and ESLint-ignored unused bindings. TypeScript already expresses visibility with `private` and `protected`, so the underscore prefix adds noise without enforcement benefit. Roughly half the codebase already omits `_` on private members, producing inconsistent style in the same classes. Aligning on one convention improves readability and matches the existing ESLint unused-variable rule.

## What Changes

**Private member naming**
- From: `_` prefix marks conventionally-private fields and methods (`private _fusionAccountMap`, `_processX()`)
- To: TypeScript visibility keywords only; no `_` on class members (`private fusionAccountMap`, `private processX()`)
- Reason: `_` should mean unused, not private
- Impact: Non-breaking at runtime; large mechanical rename across `src/`

**Accessor backing fields**
- From: `_name` backs public `get name()` / `set name()`
- To: `nameValue` (private) backs public accessor; `Value` suffix is the single rule for all backing fields
- Reason: Cannot drop `_` without renaming when a public accessor shares the base name
- Impact: Non-breaking; affects ~54 fields in model layer (`FusionAccount`, `FusionCollections`, `FusionRun`, `FusionLayers`)

**FusionLayers encapsulation**
- From: Public `_needsRefresh` (and similar) with getter/setter wrappers
- To: `private needsRefreshValue` with same public accessors
- Reason: Close encapsulation gap while renaming
- Impact: Non-breaking

**Unused bindings (unchanged)**
- From: `_log`, `_index` on unused params/locals — allowed by ESLint
- To: Same — `_` reserved exclusively for unused variables, parameters, and functions
- Impact: None

**Documentation and enforcement**
- From: `AGENTS.md` documents `_` as conventionally-private
- To: `AGENTS.md` and `project-standards` spec document the new rules; optional ESLint naming rule forbids `_` on class members
- Impact: Contributor-facing convention change

**Tests**
- From: ~36 refs poke private state as `(obj as any)._field`
- To: Updated to new private field names; prefer public accessors where sufficient
- Impact: Test-only edits

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `project-standards`: Update code-conventions requirements for private member naming — `_` reserved for unused bindings; `private`/`protected` for visibility; accessor backing fields use `Value` suffix

## Impact

- **Code:** Full `src/` sweep — model layer heaviest (`fusionRun`, `fusionCollections`, `fusionAccount`, `fusionLayers`); smaller counts in services (`sourceService`, `schemaService`, `matchingService`, etc.)
- **Tests:** ~36 `(obj as any)._…` references updated
- **Docs:** `AGENTS.md` convention section; no user-facing MkDocs change
- **Tooling:** Optional `@typescript-eslint/naming-convention` rule in `eslint.config.mjs`
- **APIs / runtime:** No external contract change; rename-only refactor
