## Why

`FusionAccount` in `src/model/fusionAccount.ts` has grown to 1,694 lines containing 41 private fields, 4 factory methods, 3 layer methods, and ~30 mutators — all in a single class. This god-class makes it difficult to reason about state independently from behavior, slows down code review, and creates risk when modifying any single concern. Decomposing it along the data/rules seam lets readers understand what state exists (data container) separately from how that state is manipulated (rule functions), without changing any public API or behavior.

## What Changes

- **New `FusionAccountState` class** — A data container owning all 41 fields as public properties, with readonly config. Moves the `syncCollectionAttributesToBag` serialization method into it.
- **7 new rule modules** under `src/model/fusionAccountRules/` — Each module exports pure-ish functions that take `FusionAccountState` and mutate it: `constructionRules`, `layerRules`, `statusRules`, `actionRules`, `reviewRules`, `correlationRules`, `historyRules`.
- **`FusionAccount` becomes a thin facade** — Factory methods, accessors, and mutators all delegate to rule functions. No private helpers remain. Target: under 400 lines.
- No public API changes, no behavior changes, no callers outside `src/model` modified.

## Capabilities

### New Capabilities

<!-- No new domain-level capabilities. This change refactors internals of the existing fusionService capability. -->

### Modified Capabilities

- `fusionService`: Internal architecture changes — `FusionAccount` decomposed into `FusionAccountState` (data) + rule modules (behavior), with the class retained as a thin delegation facade. No behavioral requirements change.

## Impact

- **New files**: `src/model/fusionAccountState.ts`, 7 files under `src/model/fusionAccountRules/`
- **Modified files**: `src/model/fusionAccount.ts` (private fields replaced with `state` delegate; all logic moved to rules), `src/model/fusionAccountTypes.ts` (re-export `FusionAccountState`), `src/model/__tests__/fusionAccount.test.ts` (add contract test)
- **Unchanged**: `fusionAccountMatcher.ts`, `fusionAccountUtils.ts`, `fusionAccountTypes.ts` (except re-export), all `fusionService/*.ts`, all `operations/**/*.ts`
- **Verification gates**: `npx tsc --noEmit`, `npx eslint "src/**/*.ts"`, `npx vitest run` (981 passed / 2 skipped baseline)
- **Dependency**: Plan 002 (characterization tests) must be completed and passing before this plan begins
