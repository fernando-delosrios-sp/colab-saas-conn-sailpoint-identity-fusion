# Velocity Helper Empty Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure all custom Velocity context helpers return empty string on failure so template evaluation never leaks literal Velocity expressions into attribute values.

**Architecture:** Extract shared `withVelocityHelperFallback` utility; refactor existing Normalize and Datefns wrappers to use it; wrap remaining leaking helpers (JSON.parse, AddressParse); verify via `evaluateVelocityTemplate` integration tests.

**Tech Stack:** TypeScript, Node.js 24, Vitest, Apache Velocity (velocityjs)

## Global Constraints

- Failure sentinel MUST be `''` (empty string), not `undefined` or `null`
- Wrap at export boundary only — internal pure functions keep returning `undefined`
- Do NOT wrap native `$Math` / `$String`
- Do NOT wrap boolean-only helpers (`isValid`, `isBefore`, etc.)
- Non-breaking for templates with valid inputs

---

## Task 1: Shared fallback utility

**Files:**
- Create: `src/services/definitionService/contextHelpers/velocityFallback.ts`

- [ ] **Step 1:** Create `withVelocityHelperFallback`:

```typescript
import { logger } from '@sailpoint/connector-sdk'

export function withVelocityHelperFallback<T extends (...args: any[]) => any>(
    helperName: string,
    fn: T
): (...args: Parameters<T>) => Exclude<ReturnType<T>, undefined | null> | '' {
    return (...args: Parameters<T>) => {
        try {
            const result = fn(...args)
            if (result === undefined || result === null) {
                logger.debug(`${helperName} returned ${result} for input: ${JSON.stringify(args[0])}`)
                return ''
            }
            return result
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            logger.error(`${helperName} threw unexpected error for input ${JSON.stringify(args[0])}: ${msg}`)
            return ''
        }
    }
}
```

- [ ] **Step 2:** Commit: `refactor: add shared Velocity helper fallback utility`

## Task 2: Refactor Normalize and Datefns

**Files:**
- Modify: `src/services/definitionService/contextHelpers/normalize.ts`
- Modify: `src/services/definitionService/contextHelpers/dateUtils.ts`

- [ ] **Step 1:** Replace `withNormalizeFallback` in `normalize.ts` with import from `velocityFallback.ts`; use namespaced helper names in log messages (e.g. `Normalize.date`)
- [ ] **Step 2:** Replace `withDatefnsFallback` in `dateUtils.ts` with import from `velocityFallback.ts`
- [ ] **Step 3:** Run `npm test -- src/services/definitionService/__tests__/formatting.test.ts` — all existing Normalize and Datefns tests must pass unchanged
- [ ] **Step 4:** Commit: `refactor: use shared Velocity fallback for Normalize and Datefns`

## Task 3: Wrap JSON.parse and AddressParse

**Files:**
- Modify: `src/services/definitionService/contextHelpers/json.ts`
- Modify: `src/services/definitionService/contextHelpers/addressParse.ts`

- [ ] **Step 1:** Write failing tests in `formatting.test.ts`:
  - `$JSON.parse("invalid")` → undefined
  - `$JSON.parse($missing)` → undefined
  - `$AddressParse.getCityState($city)` with missing city → undefined
  - `$AddressParse.parse($address)` with missing address → undefined
- [ ] **Step 2:** Run tests — confirm new tests fail
- [ ] **Step 3:** Wrap `JSONHelper.parse` and AddressParse methods via `withVelocityHelperFallback`
- [ ] **Step 4:** Run tests — confirm all pass
- [ ] **Step 5:** Commit: `fix: wrap JSON.parse and AddressParse with Velocity empty fallback`

## Task 4: Documentation

**Files:**
- Modify: `docs/reference/velocity-context.md`

- [ ] **Step 1:** Add subsection documenting that custom helpers return empty output (no attribute value) on missing/invalid input
- [ ] **Step 2:** Commit: `docs: document Velocity helper empty-output-on-failure contract`

## Task 5: Verification

- [ ] **Step 1:** Run `npm test -- src/services/definitionService/__tests__/formatting.test.ts`
- [ ] **Step 2:** Run `npm run lint`
