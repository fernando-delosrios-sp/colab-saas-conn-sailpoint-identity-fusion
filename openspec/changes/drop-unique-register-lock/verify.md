# Verify — drop-unique-register-lock

**Status:** PASS

**Verifier:** manual (openspec-verify-change skill not installed in this workspace)

## Checks

| Check | Result |
| --- | --- |
| All `tasks.md` items `[x]` | PASS |
| Scenario tests: parallel 25/batch 12; missing skip; existing-value / historical lock-serialized name; Refresh unique register does not enter unique lock; concurrent generation still distinct | PASS |
| `npx vitest run` recordUniqueRegistration + defineService + fusionService.aggregation — 114+ tests green; typecheck; lint | PASS |
| `openspec validate --all --json` — all `"valid": true` | PASS |
| Design D1–D3: lock dropped only on `registerUniqueAttributes`; no `await` in that loop; `tryRegisterUniqueValue` and unregister still lock | PASS |
| Changelog `## 2026-08-25 · v2.2.0` Improvements | PASS |
| `git status --porcelain` empty after commit | (commit in apply handoff) |

## Spec vs code

- `registerUniqueAttributes` asserts then `getUniqueValues(name).add(valueStr)` with no `unique:` `withLock`.
- Record unique registration still batches and registers the same members as a serial walk.
- Newly generated Unique values still take `tryRegisterUniqueValue` lock (concurrent refresh test).
- OpenSpec cannot drop a scenario name from MODIFIED; the historical title **Unique-set writes remain lock-serialized per attribute name** is retained with SHALL NOT take the unique lock (same contract as **Existing-value registration does not take the unique registry lock**).

## Follow-ups

None. Do not archive inside apply.
