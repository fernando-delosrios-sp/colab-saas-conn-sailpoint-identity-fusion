## 1. Characterization tests (red first)

- [x] 1.1 In `src/services/definitionService/__tests__/recordUniqueRegistration.test.ts`, add a test that spies `mockLocks.withLock`: after `registerUniqueValuesFromRecordManagedAccount` (or `registerUniqueAttributes` on a hydrated account with unique values), no call has a key matching `/^unique:/`. Pattern: existing `mockLocks` in that file (`withLock: vi.fn((_key, fn) => fn())`).
- [x] 1.2 In `src/services/definitionService/__tests__/defineService.test.ts`, add a test: Fusion account with existing Unique value, call `registerUniqueAttributes`, `withLock` not called with `unique:UID` (or the definition name used), `getUniqueValues` contains the value. Reuse a `mockLocks` spy like `does not hold unique:${name} during evaluateAttributeTemplate`.
- [x] 1.3 Keep existing tests: 25 distinct values / batch 12; two accounts distinct values; concurrent `refreshUniqueAttributes` distinct generated values; Velocity not under unique lock.
- [x] 1.4 Run 1.1–1.2 — expect RED while `registerUniqueAttributes` still awaits `withLock`.

**Verify:** `npx vitest run src/services/definitionService/__tests__/recordUniqueRegistration.test.ts src/services/definitionService/__tests__/defineService.test.ts` — new lock-absence cases fail; generation/collision tests still pass.

## 2. Remove lock from registerUniqueAttributes (green)

- [x] 2.1 In `src/services/definitionService/definitionService.ts` `registerUniqueAttributes`: delete `lockKey` / `await this.locks.withLock`. Keep `missing` skip, `assert` that the name is in `uniqueDefinitionByName`, then `this.getUniqueValues(definition.name).add(valueStr)`.
- [x] 2.2 Do not add `await` in that for-loop. Leave the method `async` (callers already await it).
- [x] 2.3 Do not change `tryRegisterUniqueValue`, `unregisterUniqueAttributes`, or generation helpers.
- [x] 2.4 Re-run 1.x — GREEN.

**Verify:** same vitest command exit 0.

**Grep:** `rg "withLock" -n src/services/definitionService/definitionService.ts` still shows unique lock in `tryRegisterUniqueValue` and `unregisterUniqueAttributes`, not in `registerUniqueAttributes`.

## 3. Verification

- [x] 3.1 `npx vitest run src/services/definitionService/__tests__/recordUniqueRegistration.test.ts src/services/definitionService/__tests__/defineService.test.ts src/services/fusionService/__tests__/fusionService.aggregation.test.ts`
- [x] 3.2 `npm run typecheck` exit 0
- [x] 3.3 `npm run lint` exit 0
- [x] 3.4 `git status` — no files outside design.md Scope

## 4. Documentation

- [x] 4.1 Invoke **changelog-generator**. PATCH Improvement under `## 2026-08-25 · v2.2.0`: registering existing Unique values no longer waits on the per-attribute uniqueness lock; newly generated Unique values still take that lock for check-then-add. No Unreleased. Do not document lock keys as operator config.

## STOP conditions

- Drift vs `e935b41`
- Concurrent generation test fails
- 25-account parallel register loses members
- Temptation to unlock `tryRegisterUniqueValue` or unregister
- Register loop would need `await` to compile

## Suggested executor toolkit

- **tdd** for sections 1 → 2
- **changelog-generator** for section 4
- Do not apply `honor-managed-account-refresh-threshold` as a prerequisite
