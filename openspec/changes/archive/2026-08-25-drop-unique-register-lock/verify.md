# Verify — drop-unique-register-lock

**Status:** PASS

**Verifier:** `/opsx-verify` (manual; openspec-verify-change skill not installed)

**Change:** `drop-unique-register-lock` · schema `ferspec`

## Summary

| Dimension | Status |
| --- | --- |
| Completeness | 13/13 tasks, 2/2 requirements implemented |
| Correctness | 2/2 reqs covered; 5/5 scenarios have named tests |
| Coherence | Design D1–D4 followed |

## Completeness

- All `tasks.md` checkboxes `[x]`.
- MODIFIED **Record unique registration processes accounts in bounded parallel batches** — `registerUniqueValuesFromRecordManagedAccounts` + unlocked `registerUniqueAttributes` (`definitionService.ts:280-294`, `:312-327`).
- ADDED **Registering existing unique values does not take the unique registry lock** — same method; `tryRegisterUniqueValue` still locks (`definitionService.ts:867-873`).

## Correctness

| Scenario | Test |
| --- | --- |
| Parallel registration yields the same unique set as a serial walk | `registerUniqueValuesFromRecordManagedAccounts registers 25 distinct values with batch size 12` |
| Unique-set writes remain lock-serialized per attribute name | `it.each` in `recordUniqueRegistration.test.ts` |
| Existing-value registration does not take the unique registry lock | same `it.each` |
| Missing values still skip without error | `registerUniqueValuesFromRecordManagedAccounts skips missing unique values without error` |
| Refresh unique register does not enter unique lock | `Refresh unique register does not enter unique lock` |

Generation lock still covered by `two concurrent refreshUniqueAttributes calls...` and `does not hold unique:${name} during evaluateAttributeTemplate`. Unregister still uses `unique:` lock (`definitionService.ts:346-351`). Register loop has no `await`.

`openspec validate --all --json`: 39/39 valid.

## Coherence

D1–D3: lock dropped only on existing-value insert; unregister and generation unchanged. D4: historical scenario title retained with SHALL NOT lock (OpenSpec will not drop a named scenario from MODIFIED). Changelog under `## 2026-08-25 · v2.2.0` Improvements; no Unreleased; no operator-facing lock keys.

## Issues

None critical. None warning.

**SUGGESTION:** After archive, the canonical spec will still title a no-lock scenario **Unique-set writes remain lock-serialized per attribute name**. Leave it: OpenSpec archive refuses to drop that name. The THEN and the sibling scenario state the real contract.

## Final assessment

All checks passed. Ready for archive (`/opsx-archive`).
