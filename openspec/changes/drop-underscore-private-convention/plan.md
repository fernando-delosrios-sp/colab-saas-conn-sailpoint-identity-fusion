# Drop Underscore Private Convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reserve `_` for unused bindings only; rename all private class members to use TypeScript visibility without `_`; accessor backing fields use `Value` suffix.

**Architecture:** Documentation and ESLint enforcement first, then mechanical renames in model layer (highest ref count), services sweep, test updates, full verification. Rename-only — no behavior changes.

**Tech Stack:** TypeScript (strict, CommonJS), Vitest (globals: true), ESLint + typescript-eslint.

**Canonical test command:** `npm test` (full suite) or targeted `npx vitest run <path>`

## Global Constraints

- Prettier: 120 col, 4-space indent, single quotes, NO semicolons, trailing commas.
- NEVER pipe `npm test` to `tail` (see `AGENTS.md`).
- Git commits require explicit user authorization — skip commit steps unless requested.
- Reference: `openspec/changes/drop-underscore-private-convention/design.md`, `specs/project-standards/spec.md`.

## Rename Rules (apply everywhere)

| Before | After |
|--------|-------|
| `private _foo` (no accessor) | `private foo` |
| `private _name` backing `get name()` | `private nameValue` |
| `private _processX()` | `private processX()` |
| Public `_needsRefresh` + getter | `private needsRefreshValue` + getter |
| Unused `_log` param | unchanged |

---

### Task 1: Documentation and ESLint enforcement

**Files:**
- Modify: `AGENTS.md` (TypeScript conventions section ~L110)
- Modify: `eslint.config.mjs`

**Spec scenarios:** TypeScript conventions documented; unused binding; Value suffix; lint enforcement

- [ ] **Step 1:** Replace AGENTS.md line `_` prefix on field names indicates conventionally-private members with three rules: (1) `_` for unused only, (2) `private`/`protected` without `_`, (3) accessor backing uses `Value` suffix with example
- [ ] **Step 2:** Add `@typescript-eslint/naming-convention` to `eslint.config.mjs`:

```js
'@typescript-eslint/naming-convention': [
    'error',
    {
        selector: 'memberLike',
        modifiers: ['private', 'protected'],
        format: ['camelCase'],
        leadingUnderscore: 'forbid',
    },
    {
        selector: 'parameterProperty',
        format: ['camelCase'],
        leadingUnderscore: 'allow',
        filter: { regex: '^_', match: true },
    },
],
```

- [ ] **Step 3:** Run `npm run lint` — expect failures on existing `_` privates (confirms rule works)

---

### Task 2: fusionAccount.ts

**Files:**
- Modify: `src/model/fusionAccount.ts`

**Rename map (accessor backing → Value):** `_key`→`keyValue`, `_managedKey`→`managedKeyValue`, `_iscAccountId`→`iscAccountIdValue`, `_email`→`emailValue`, `_name`→`nameValue`, `_sourceName`→`sourceNameValue`, `_type`→`typeValue`, `_modified`→`modifiedValue`, `_identityInfo`→`identityInfoValue`, `_attributeBag`→`attributeBagValue`, `_sourceAttributeMapCache`→`sourceAttributeMapCacheValue`, `_config`→`configValue`

- [ ] **Step 1:** Rename all `private _*` field declarations and every `this._*` reference in the file per map above
- [ ] **Step 2:** Rename any `private _*` methods (drop underscore prefix)
- [ ] **Step 3:** Run `npx vitest run src/model/__tests__/fusionAccount` (or matching test path if exists)

---

### Task 3: fusionCollections.ts

**Files:**
- Modify: `src/model/fusionCollections.ts`

- [ ] **Step 1:** For each `private _foo` with public `get foo()` / `set foo()`, rename to `fooValue`
- [ ] **Step 2:** For plain `private _*` fields and methods, drop `_` prefix
- [ ] **Step 3:** Run targeted model tests touching collections

---

### Task 4: fusionRun.ts

**Files:**
- Modify: `src/model/fusionRun.ts`

- [ ] **Step 1:** Rename accessor backing fields to `*Value` (e.g. `_fusionAccountMap` if backed by getter, else drop `_`)
- [ ] **Step 2:** Rename plain private fields/methods (drop `_`)
- [ ] **Step 3:** Run `npx vitest run src/model/__tests__/fusionRun.test.ts`

---

### Task 5: fusionLayers.ts + fusionCorrelation.ts

**Files:**
- Modify: `src/model/fusionLayers.ts`
- Modify: `src/model/fusionCorrelation.ts`

- [ ] **Step 1:** `fusionLayers.ts` — convert public `_needsRefresh` etc. to `private needsRefreshValue`; update getters/setters; rename private methods (drop `_`)
- [ ] **Step 2:** `fusionCorrelation.ts` — drop `_` from private fields/methods
- [ ] **Step 3:** Run model tests for layers/correlation

---

### Task 6: Services sweep

**Files:**
- Modify: `src/services/sourceService/sourceService.ts`
- Modify: `src/services/schemaService/schemaService.ts`
- Modify: `src/services/matchingService/matchingService.ts` (`_scoringOptions` → `scoringOptions`)
- Modify: `src/services/formService/formService.ts`
- Modify: `src/services/definitionService/stateWrapper.ts`
- Modify: any remaining `src/**/*.ts` with `private _` after grep

**Note:** In `clientService.ts`, the call-path parallel paginator was renamed to `paginateParallelForCall` to avoid colliding with the existing `paginateParallel` generator used by direct list helpers.

- [ ] **Step 1:** Grep `private _|protected _|this\._` in `src/services/` — rename each hit
- [ ] **Step 2:** Grep entire `src/` for remaining `private _` declarations — zero expected after this task

---

### Task 7: Test updates

**Files:**
- Modify: `src/services/sourceService/__tests__/sourceService.test.ts` (~13 refs)
- Modify: `src/model/__tests__/fusionRun.test.ts`
- Modify: any other `*test*.ts` with `(obj as any)._`

- [ ] **Step 1:** Grep `(obj as any)\._` and `\._` in test files — update to new private names
- [ ] **Step 2:** Where test used backing field but public accessor suffices, switch to accessor

---

### Task 8: Final verification

**Spec scenarios:** lint enforcement; full test pass

- [ ] **Step 1:** `rg 'private _|protected _' src --glob '*.ts'` — must return zero matches
- [ ] **Step 2:** `rg '^\s+_\w+\s*=' src --glob '*.ts' | rg -v test` — no public `_` class fields
- [ ] **Step 3:** Run `npm run lint` — must pass
- [ ] **Step 4:** Run `npm test` — must pass

---

### Task 9: Documentation and changelog (closing)

- [ ] **Step 1:** Verify `AGENTS.md` matches spec (Task 1 content complete)
- [ ] **Step 2:** Mark changelog N/A — internal refactor, no user-visible release note
