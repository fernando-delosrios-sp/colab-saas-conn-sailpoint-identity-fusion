# Add MD5 Velocity Context Util Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose `$MD5(input)` as a direct function call in Velocity template expressions for deterministic lowercase hex MD5 digests.

**Architecture:** Add a new `contextHelpers/md5.ts` module exporting `MD5` as a callable function, register it in `contextHelpers/index.ts`, and verify via existing `evaluateVelocityTemplate` integration tests. Uses Node.js native `crypto.createHash('md5')` — no new dependencies.

**Tech Stack:** TypeScript, Node.js 24, Vitest, Apache Velocity (velocityjs)

## Global Constraints

- Return `''` for null, undefined, non-string, or whitespace-only input (matches JSON/Normalize helper behavior)
- Output MUST be lowercase hex MD5 (32 characters)
- No new npm dependencies
- Non-breaking additive change

---

## Task 1: MD5 context helper module

**Files:**
- Create: `src/services/definitionService/contextHelpers/md5.ts`
- Modify: `src/services/definitionService/contextHelpers/index.ts`

- [ ] **Step 1:** Write failing tests in `formatting.test.ts` under a new `describe('MD5()')` block:
  - `$MD5($email)` with `{ email: 'user@example.com' }` → expect known digest `b58996c504c5638798eb6b511e6f49af`
  - `$MD5($missing)` with empty context → expect `undefined` from `evaluateVelocityTemplate` (empty string renders as undefined)
  - `$MD5($n)` with `{ n: 123 }` → expect undefined/empty
- [ ] **Step 2:** Run `npm test -- src/services/definitionService/__tests__/formatting.test.ts` — confirm new tests fail
- [ ] **Step 3:** Create `md5.ts`:

```typescript
import { createHash } from 'crypto'

export function MD5(text: unknown): string {
    if (text === null || text === undefined) return ''
    if (typeof text !== 'string') return ''
    const trimmed = text.trim()
    if (!trimmed) return ''
    return createHash('md5').update(trimmed).digest('hex')
}
```

- [ ] **Step 4:** Update `index.ts` — import `MD5` and add to `contextHelpers` export
- [ ] **Step 5:** Run tests — confirm all pass
- [ ] **Commit:** `feat: add MD5 Velocity context helper`

## Task 2: Documentation

**Files:**
- Modify: `docs/guides/define.md`

- [ ] **Step 1:** Add a `#### $MD5 (hashing)` subsection after the `$Normalize` section in the Apache Velocity context area
- [ ] **Step 2:** Document `$MD5(input)` — returns lowercase hex MD5 digest; empty/invalid input returns empty string
- [ ] **Step 3:** Include example: `$MD5($email)` and note that MD5 is for deterministic identifiers, not password or secret hashing
- [ ] **Commit:** `docs: document MD5 Velocity context helper`

## Task 3: Verification

- [ ] **Step 1:** Run `npm test -- src/services/definitionService/__tests__/formatting.test.ts`
- [ ] **Step 2:** Run `npm run lint`
