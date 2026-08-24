# Design: Drop Underscore Private Convention

## Context

The connector codebase mixes two meanings for the `_` prefix: conventionally-private class members (documented in `AGENTS.md`) and ESLint-ignored unused bindings (`argsIgnorePattern` / `varsIgnorePattern: '^_'` in `eslint.config.mjs`). TypeScript `private` / `protected` already express visibility. Roughly half of private members omit the underscore today, including within single classes (e.g. `MatchingService` uses both `matchingConfigs` and `_scoringOptions`).

The rename surface is concentrated in the model layer:

```
┌─────────────────────────────────────────────────────────────┐
│  src/model/          ~400+ refs   FusionRun, FusionAccount, │
│                                   FusionCollections, Layers │
├─────────────────────────────────────────────────────────────┤
│  src/services/       ~20 refs     sourceService, schema,  │
│                                   matching (remainder)      │
├─────────────────────────────────────────────────────────────┤
│  src/**/__tests__/   ~36 refs     (obj as any)._field       │
└─────────────────────────────────────────────────────────────┘
```

This is a rename-only refactor with no runtime or ISC connector API change.

## Goals / Non-Goals

**Goals:**

- Reserve `_` exclusively for unused variables, parameters, and functions
- Use TypeScript visibility keywords for private/protected members
- Rename accessor backing fields with a single `Value` suffix rule
- Close `FusionLayers` encapsulation gap (public `_` fields → `private *Value`)
- Update contributor documentation (`AGENTS.md`) and living `project-standards` spec
- Migrate the full `src/` tree in one change to avoid mixed conventions

**Non-Goals:**

- ECMAScript `#` private fields
- Refactoring accessor patterns away from backing storage
- User-facing MkDocs documentation changes
- Runtime behavior or public API changes
- Incremental / file-by-file drift period

## Decisions

### D1: Underscore reserved for unused bindings only

- **Choice:** `_` prefix allowed only on unused locals, parameters, and functions (matching existing ESLint config)
- **Reason:** Aligns code style with lint rules already in place; removes dual meaning
- **Considered alternatives:** Keep `_` for accessor backing (rejected — contradicts goal); adopt `#` privates (rejected — see D2)

### D2: Accessor backing uses `Value` suffix

- **Choice:** `_name` backing `get name()` becomes `private nameValue`
- **Reason:** Cannot drop `_` without renaming when a public accessor shares the base name; zero same-file name clashes verified across 54 backing fields
- **Considered alternatives:** `#name` ECMAScript private (rejected — introduces second privacy syntax); alternate suffixes like `State` or `Backing` (rejected — single rule preferred)

### D3: Private methods drop underscore prefix

- **Choice:** `private _processX()` → `private processX()`
- **Reason:** Consistency with D1; methods are class members, not unused bindings
- **Considered alternatives:** Keep `_` on methods only (rejected — partial convention)

### D4: Full-repo single-pass migration

- **Choice:** One change covering model, services, tests, and docs
- **Reason:** Avoids mixed conventions during transition; changes are mechanical
- **Considered alternatives:** Model-first then services (rejected — user chose full scope); incremental new-code-only (rejected — leaves drift)

### D5: Test private-state access updated in place

- **Choice:** Update ~36 `(obj as any)._field` test refs to new names; prefer public accessors when sufficient
- **Reason:** No new test hooks needed; rename-only
- **Considered alternatives:** Add public test-only accessors (rejected — scope creep)

### D6: ESLint naming enforcement

- **Choice:** Add `@typescript-eslint/naming-convention` rule forbidding `_`-prefixed class members (methods, properties, parameter properties); keep existing `no-unused-vars` ignore pattern
- **Reason:** Prevents regression after migration
- **Considered alternatives:** Docs-only enforcement (rejected — easy to regress on ~500-ref surface)

## Risks / Trade-offs

- **[Risk] Large diff obscures accidental logic changes** → Mitigation: rename-only commits; review by file group; run full test suite
- **[Risk] Missed `_` references leave convention drift** → Mitigation: ESLint naming rule; grep verification task in plan
- **[Trade-off] `nameValue` is more verbose than `_name`** → Accepted: clarity and single suffix rule outweigh brevity
- **[Trade-off] Mechanical rename touches hot model files** → Accepted: no behavior change; tests verify correctness

## Migration Plan

**Sequence:**

1. Update `AGENTS.md` and `eslint.config.mjs` (document + enforce target convention)
2. **Model layer** — rename in dependency order:
   - `fusionAccount.ts` (accessor backing + plain privates)
   - `fusionCollections.ts`
   - `fusionRun.ts`
   - `fusionLayers.ts` (add `private` to former public `_` fields)
   - `fusionCorrelation.ts`
3. **Services** — remaining `_` privates in `sourceService`, `schemaService`, `matchingService`, `formService`, `definitionService/stateWrapper`
4. **Tests** — update `(obj as any)._…` references
5. **Verify** — `npm run lint` and `npm test`

**Rollback:** Revert the single PR/commit; no data migration or deployment steps.

**Acceptance criteria:**

- Zero `private _…` or `protected _…` declarations in `src/`
- Zero public class fields with `_` prefix in `src/`
- Unused bindings may still use `_` prefix
- `npm run lint` passes (including new naming rule)
- `npm test` passes

## Open Questions

(none — decisions locked in brainstorm)
