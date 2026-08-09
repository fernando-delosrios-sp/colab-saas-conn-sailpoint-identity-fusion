# Brainstorm: Drop Underscore Private Convention

## Context

The codebase documents `_` prefix on field names as **conventionally-private** members (`AGENTS.md`). TypeScript already provides `private` / `protected` visibility. ESLint already reserves `_` for unused bindings (`argsIgnorePattern` / `varsIgnorePattern: '^_'`).

Current state is mixed:

| Pattern | Approx. count | Example |
|---------|---------------|---------|
| `private _foo` + `this._foo` | ~87 unique fields, ~505 refs | `FusionRun`, `FusionAccount`, `FusionCollections` |
| `private foo` (no underscore) | ~497 refs | `MatchingService.matchingConfigs`, most services |
| `_foo` without `private` | 6 fields | `FusionLayers._needsRefresh` |
| `_param` for unused | Already correct | `constructor(_log: LogService)` |

Heavy files: `fusionRun.ts`, `fusionCollections.ts`, `fusionAccount.ts`, `fusionLayers.ts`, plus smaller counts in services.

## Decision Chain

### Q1: What should `_` mean going forward?

**Decision:** Reserve `_` exclusively for **unused** variables, parameters, and functions. Use TypeScript visibility keywords for private members.

### Q2: How to handle accessor backing fields (`_name` backing `get name()`)?

**Options considered:**

- **A. ECMAScript `#` private fields** — clean, no collision; different syntax; breaks `(obj as any)._field` test pattern at runtime
- **B. Suffix backing name** — e.g. `_name` → `nameValue`; consistent with plain `private`; no new syntax
- **C. Keep `_` only for backing** — minimal churn; contradicts Q1

**Decision:** **B — suffix.** Use **`Value`** as the single backing suffix for all accessor-backed fields.

```ts
// before
private _name?: string
get name() { return this._name }

// after
private nameValue?: string
get name() { return this.nameValue }
```

Collision check: all 54 accessor-backing fields — zero same-file clashes with `Value` suffix.

### Q3: Should private methods follow the same rule?

**Decision:** **Yes.** Drop `_` from private methods (e.g. `_processIdentityMatchedAccounts` → `processIdentityMatchedAccounts`).

### Q4: How to handle tests that poke private state via `(obj as any)._field`?

**Decision (default):** Update tests to renamed private fields (same `as any` pattern). Prefer public accessors where the test was hitting backing storage unnecessarily. ~36 test refs affected.

### Q5: Scope?

**Decision:** **Full repo** — model layer, services, tests, `AGENTS.md`, optional ESLint enforcement.

## Migration Categories

| Category | Count | Transform |
|----------|-------|-----------|
| Accessor backing | ~54 | `_name` → `nameValue` (private) |
| Plain private fields | ~39 | `_registry` → `registry` |
| Private methods | ~17 | `_processX` → `processX` |
| FusionLayers public `_` fields | ~6 | `_needsRefresh` → `private needsRefreshValue` + getter/setter |
| Already correct | ~497 | Leave as-is |
| Unused params/vars | ~15 | Keep `_` prefix |

## FusionLayers Encapsulation Gap

`FusionLayers` currently exposes `_needsRefresh` etc. as **public class fields** with getters/setters. Migration should add `private` to backing fields while renaming to `*Value`.

## Enforcement

1. Update `AGENTS.md` — document new convention
2. Update `project-standards` living spec — private member naming requirement
3. Optional: `@typescript-eslint/naming-convention` to forbid `_` on class members (while keeping unused-var ignore pattern)

## Execution Order

1. Document convention (AGENTS.md + spec delta)
2. Model layer (`fusionAccount`, `fusionCollections`, `fusionRun`, `fusionLayers`)
3. Services sweep (remaining `_` privates)
4. Test updates (`(obj as any)._…` refs)
5. Verify: `npm run lint` + `npm test`

## Trade-offs Accepted

- **Suffix verbosity:** `nameValue` is longer than `_name` but reads clearly and avoids `#` syntax split
- **Large diff:** ~500 references; mechanical rename acceptable for one-time convention lock-in
- **Mixed period:** Avoid by doing full-repo migration in one change rather than incremental drift

## Out of Scope

- ECMAScript `#` private fields
- Refactoring accessor patterns away from backing fields
- Runtime behavior changes (rename-only; no API changes)
