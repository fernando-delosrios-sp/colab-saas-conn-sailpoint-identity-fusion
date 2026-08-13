## Why

When custom Velocity context helpers return JavaScript `undefined` or `null`, `velocityjs` cannot render the result and outputs the literal template expression into attribute values. A user hit this with `$Datefns.format($Datefns.parse($INACTIVE_DATE, "yyyy-MM-dd"))` when `$INACTIVE_DATE` was missing — the raw Velocity string appeared in output instead of no value.

`$Normalize`, `$MD5`, and `$JSON.stringify` already return empty string on failure, and `$Datefns` was patched similarly in commit `0014641`. The same leak still affects `$JSON.parse` and several `$AddressParse` methods. Without a unified contract, future helpers risk reintroducing the bug.

## What Changes

**Unified empty-output fallback for custom Velocity helpers**
- From: Inconsistent failure handling — some helpers return `''`, others return `undefined`/`null` and leak literal expressions
- To: All custom context helpers return `''` on failure; `evaluateVelocityTemplate` continues mapping empty output to `undefined`
- Reason: Prevent raw Velocity syntax in generated attribute values
- Impact: Non-breaking for templates that already handle empty output; fixes incorrect literal-string outputs

**Shared fallback utility**
- From: Duplicated `withNormalizeFallback` / `withDatefnsFallback` per module
- To: Single `withVelocityHelperFallback` used by all custom helper exports
- Reason: One contract, consistent logging, easier to maintain
- Impact: Internal refactor only; no template syntax changes

**Remaining helper coverage**
- From: `$JSON.parse`, `$AddressParse.getCityState`, `$AddressParse.getCityStateCode`, and `$AddressParse.parse` can leak literals on failure
- To: Wrapped with the same empty-string fallback
- Reason: Complete coverage of exported custom helpers
- Impact: Missing/invalid inputs yield no attribute value instead of literal syntax

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-service`: Velocity context helpers MUST return empty string (not `undefined` or `null`) when they cannot produce a valid result, so template evaluation never renders the literal expression.

## Impact

- `src/services/definitionService/contextHelpers/` — new shared fallback util; refactor Normalize, Datefns; wrap JSON.parse and AddressParse
- `src/services/definitionService/__tests__/formatting.test.ts` — integration tests for failure paths per helper
- `docs/reference/velocity-context.md` — document empty-output-on-failure behavior
- No new npm dependencies; no config or schema changes
