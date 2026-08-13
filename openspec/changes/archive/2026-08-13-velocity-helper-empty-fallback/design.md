## Context

The definition service evaluates Apache Velocity templates for attribute definitions. Custom helpers are exported from `contextHelpers/index.ts` and merged into the render context in `formatting.ts`. When helpers return `undefined`, `velocityjs` renders the literal expression — a data-quality bug reported for `$Datefns` with missing date inputs.

Three helpers already handle this correctly via ad-hoc wrappers (`Normalize`, `Datefns`) or direct empty-string returns (`MD5`, `JSON.stringify`). `JSON.parse` and parts of `AddressParse` still leak. Native `$Math` and `$String` are out of scope — they follow JavaScript coercion semantics.

## Goals / Non-Goals

**Goals:**
- Establish a single empty-string fallback contract for all custom Velocity context helpers
- Extract shared `withVelocityHelperFallback` utility to DRY existing per-module wrappers
- Wrap remaining leaking helpers: `JSON.parse`, `AddressParse.getCityState`, `AddressParse.getCityStateCode`, `AddressParse.parse`
- Refactor `Normalize` and `Datefns` to use the shared utility without behavior change
- Add integration tests and document the contract in velocity-context reference

**Non-Goals:**
- Wrapping native `$Math` / `$String` globals
- Changing standard Velocity unresolved-variable semantics (`$missing` vs `$!missing`)
- Exposing internal geo facades (`State`, `City`) to the render context
- Changing successful-path return types (dates remain Date objects, booleans remain booleans)

## Decisions

### D1: Empty string as the Velocity-safe failure sentinel
- **Choice**: Custom helpers return `''` when they cannot produce a valid result
- **Reason**: Velocity renders `''` cleanly; `evaluateVelocityTemplate` already converts empty output to `undefined` for the attribute pipeline
- **Considered alternatives**: Returning `undefined` (causes literal leak); returning `null` (Velocity renders `"null"` string)

### D2: Shared wrapper utility
- **Choice**: New `withVelocityHelperFallback(helperName, fn)` in `contextHelpers/velocityFallback.ts`
- **Reason**: Eliminates duplicated wrapper logic in `normalize.ts` and `dateUtils.ts`; provides consistent debug/error logging
- **Considered alternatives**: Per-module wrappers (already exists, harder to maintain); central proxy on entire `contextHelpers` object (too coarse, hides which method failed)

### D3: Wrap at export boundary, not internal functions
- **Choice**: Apply wrapper on the exported helper object methods (`Datefns.format`, `Normalize.date`, etc.), keep internal pure functions returning `undefined`
- **Reason**: Unit tests for date/normalize logic continue testing pure functions; Velocity integration tests verify render behavior
- **Considered alternatives**: Change internal functions to return `''` (breaks TypeScript return types and non-Velocity callers)

### D4: Selective wrapping by return-type risk
- **Choice**: Wrap methods that can return `undefined` or `null`; skip methods that always return booleans or guaranteed-valid objects (`isValid`, `now`, `isBefore`, etc.)
- **Reason**: Boolean `false` and `"false"` are valid Velocity output; wrapping everything adds noise without benefit
- **Considered alternatives**: Wrap all methods uniformly (unnecessary for boolean helpers)

### D5: AddressParse.parse null handling
- **Choice**: Wrap `parse` so `null` results become `''` at the Velocity boundary
- **Reason**: `null` from parse triggers the same literal-expression fallback as `undefined` in nested template calls
- **Considered alternatives**: Return empty object `{}` (misleading — implies successful parse)

## Risks / Trade-offs

- [Risk] Nested helper chains where inner failure returns `''` and outer helper treats it as valid input → Mitigation: Outer helpers already validate input (`format('')` → invalid date → `''`); add nested-chain integration tests
- [Risk] Refactoring Normalize/Datefns wrappers causes subtle regression → Mitigation: Existing formatting.test.ts coverage must pass unchanged; only add new failure-path tests
- [Trade-off] Internal pure functions still return `undefined` while Velocity exports return `''` → Accepted: clean separation between domain logic and template rendering contract

## Migration Plan

N/A — behavioral fix with no deployment or configuration changes. Templates that previously received literal Velocity strings will now receive no attribute value (undefined). This is the intended correction, not a breaking change for correctly behaving templates.

## Open Questions

None — scope and approach confirmed by user request and codebase audit.
