# Brainstorm: Velocity Helper Empty-Output Fallback

## Background

Identity Fusion attribute definitions evaluate Apache Velocity templates via `evaluateVelocityTemplate` in `definitionService/formatting.ts`. Custom context helpers (`$Normalize`, `$Datefns`, `$JSON`, `$AddressParse`, `$MD5`) are merged into the render context alongside native `$Math` and `$String`.

When a custom helper returns JavaScript `undefined`, `velocityjs` cannot render the result and falls back to outputting the **literal template expression** (e.g. `$Datefns.format($Datefns.parse($INACTIVE_DATE, "yyyy-MM-dd"))`). This leaks raw Velocity syntax into account attribute values — a serious data-quality bug.

A user reported this with `$Datefns.format($Datefns.parse($INACTIVE_DATE, "yyyy-MM-dd"))` when `$INACTIVE_DATE` is null or missing. A direct commit (`0014641`) fixed `$Datefns` by wrapping helpers to return `''` on failure (matching `$Normalize` and `$MD5`). The same leak still affects other helpers.

## Current Helper Audit

| Helper | Failure behavior today | Leaks literal? |
|--------|------------------------|----------------|
| `$Normalize.*` | `withNormalizeFallback` → `''` | No |
| `$MD5` | returns `''` directly | No |
| `$JSON.stringify` | returns `''` on failure | No |
| `$Datefns.*` | `withDatefnsFallback` → `''` (fixed in 0014641) | No |
| `$JSON.parse` | returns `undefined` | **Yes** |
| `$AddressParse.getCityState` / `getCityStateCode` | returns `undefined` | **Yes** |
| `$AddressParse.parse` | returns `null` | **Yes** (null also triggers literal fallback in nested calls) |
| `$AddressParse.getStateName` / `getStateCode` | returns `''` | No |
| `$Math.*` / `$String.*` | native JS (e.g. `NaN`, `0`) | No (different semantics) |

`evaluateVelocityTemplate` already converts empty-string render output to `undefined` for the attribute pipeline.

## Decision Chain

### Q1: Scope — which helpers get the fallback?

**Options:**
- A: Only helpers that currently leak (JSON.parse, AddressParse)
- B: All custom context helpers, including consolidating existing per-module wrappers
- C: All helpers including native Math/String

**Decision: B — all custom context helpers, unified pattern**

Rationale: User asked for "this behaviour for all helper functions." Custom helpers are the contract we control. `$Normalize`, `$Datefns`, and `$MD5` already behave correctly but use duplicated wrapper logic — consolidate into one shared utility. `$Math` / `$String` are native globals with established JS semantics (`NaN`, type coercion); wrapping them is out of scope and could break existing templates.

---

### Q2: Implementation — per-module wrappers vs shared utility?

**Options:**
- A: Copy `withNormalizeFallback` / `withDatefnsFallback` into each module
- B: Extract shared `withVelocityHelperFallback` in a small util, use everywhere

**Decision: B — shared utility**

Rationale: Three modules already have near-identical wrappers. A single function in e.g. `contextHelpers/velocityFallback.ts` keeps logging consistent and makes the contract obvious for future helpers.

---

### Q3: What should helpers return on failure?

**Options:**
- A: `undefined` (current broken behavior for some helpers)
- B: `''` (empty string)
- C: `null` (Velocity renders `"null"` string — rejected)

**Decision: B — empty string**

Rationale: Proven pattern from `$Normalize`, `$MD5`, `$JSON.stringify`. Velocity renders `''` cleanly; `evaluateVelocityTemplate` maps it to `undefined` for attribute output.

---

### Q4: Which return types need wrapping?

**Decision:** Wrap any custom helper method that can return `undefined` or `null` on failure. This includes:
- `$JSON.parse`
- `$AddressParse.getCityState`, `getCityStateCode`, `parse`
- Re-wrap `$Datefns` exports via shared utility (behavior unchanged)
- Re-wrap `$Normalize` exports via shared utility (behavior unchanged)

Methods that always return booleans (`$Datefns.isValid`, `$Datefns.isBefore`, etc.) or valid objects (`$Datefns.now()`) do not need wrapping.

---

### Q5: Relationship to the already-committed Datefns fix?

**Decision:** Treat commit `0014641` as an interim fix. This change refactors to the shared utility and completes coverage for remaining helpers. No behavior regression for Datefns.

---

## Non-Goals

- Wrapping native `$Math` / `$String` globals
- Changing Velocity semantics for unresolved variables (`$missing` still renders literally per standard Velocity — use `$!missing` for quiet refs)
- Exposing `$State` / `$City` geo facades in the render context (not currently exported)

## Files Affected

| File | Change |
|------|--------|
| `contextHelpers/velocityFallback.ts` | New shared `withVelocityHelperFallback` |
| `contextHelpers/normalize.ts` | Use shared wrapper (remove local duplicate) |
| `contextHelpers/dateUtils.ts` | Use shared wrapper (remove local duplicate) |
| `contextHelpers/json.ts` | Wrap `parse` |
| `contextHelpers/addressParse.ts` | Wrap methods returning undefined/null |
| `__tests__/formatting.test.ts` | Integration tests per helper namespace |
| `docs/reference/velocity-context.md` | Document empty-output-on-failure contract |

## Acceptance Criteria

- No custom helper expression with missing/null/invalid input renders the literal Velocity syntax
- `npm test` passes for definitionService formatting tests
- Existing successful helper behavior unchanged
