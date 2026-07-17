## Context

`FusionAccount` (`src/model/fusionAccount.ts`) is the central model class for the Fusion identity connector. At 1,694 lines, it mixes 41 state fields (identity info, flags, 7 collections, timestamps, attribute bags, config) with construction, layering, status/action/review/correlation, and history logic. This coupling makes the class hard to read, test, and modify — any change to one concern risks breaking another.

The characterization tests from Plan 002 provide a safety net for mutation behavior. This plan builds on that safety net to decompose the class without changing any public API or behavior.

## Goals / Non-Goals

**Goals:**
- Separate state (data) from behavior (rules) so each can be reasoned about independently
- Reduce `FusionAccount.ts` from ~1,700 lines to under ~400 lines
- Keep each rule module focused on a single concern and under ~400 lines
- Preserve all public API contracts and all existing behavior
- Verify every step with typecheck, lint, and the full test suite

**Non-Goals:**
- Do NOT change the public API of `FusionAccount` (factory methods, accessors, mutators, method signatures)
- Do NOT change behavior — if a characterization test from Plan 002 fails, the refactor is wrong
- Do NOT modify callers outside `src/model`
- Do NOT rename `FusionAttribute.Accounts` / `missing-accounts` keys (that is Plan 004)
- Do NOT modify `fusionAccountMatcher.ts`, `fusionAccountUtils.ts`, `fusionService/*.ts`, or `operations/**/*.ts`

## Decisions

### D1: Data/rules seam vs. feature-based split

- **Choice**: Split along the data/rules seam — separate `FusionAccountState` (inert data) from rule modules (behavior functions)
- **Rationale**: State and behavior are separate concerns. Rules become pure-ish functions on state, easy to test independently. `FusionAccount` stays a thin facade.
- **Alternatives considered**: (a) Feature-based split (construction module, layer module, etc.) — methods in different modules would still share the same mutable state, requiring either passing state or keeping it on `FusionAccount`, defeating the purpose. (b) Full decomposition into independent classes — would be a breaking API change and require callers to know about multiple classes.

### D2: Number of rule modules

- **Choice**: 7 focused modules — `constructionRules`, `layerRules`, `statusRules`, `actionRules`, `reviewRules`, `correlationRules`, `historyRules`
- **Rationale**: Each module handles one clearly scoped concern. This keeps files under ~400 lines and makes it obvious where a given behavior lives.
- **Alternatives considered**: (a) Single rules module — would just move the god-class problem to a new file. (b) 3 broad modules (construction, layer, mutation) — better than one but still mixes concerns within mutation.

### D3: Public state fields vs. private with getters/setters

- **Choice**: `FusionAccountState` fields are `public` — rule functions access them directly
- **Rationale**: Adding getter/setter boilerplate on a data container adds ceremony without benefit. The state object is an internal implementation detail never exposed outside `src/model`.
- **Alternatives considered**: Private fields with getters/setters — would require 80+ accessor methods cluttering the state class. The discipline-based contract (rules operate on their named subset) is enforced by code review and the contract test in Task 6.

### D4: MatchContext adaptation

- **Choice**: Build `MatchContext` inside the layer rules function using `state` directly, without changing `fusionAccountMatcher.ts`
- **Rationale**: `fusionAccountMatcher.ts` is out of scope. The `MatchContext` interface is unchanged; we just wire callbacks to rule functions instead of closures over `this`.
- **Alternatives considered**: Change `MatchContext` to take a state object — would require modifying the out-of-scope matcher file.

### D5: No barrel file

- **Choice**: Import each rule module explicitly by name (e.g., `import * as FusionAccountStatusRules from './fusionAccountRules/statusRules'`)
- **Rationale**: Explicit imports let static analysis tools trace calls directly to their source. Barrel files (`index.ts`) add indirection.
- **Alternatives considered**: Re-export barrel — simpler imports but harder to trace.

## Risks / Trade-offs

- **[Risk] Rule functions mutate shared state without type-level enforcement** — A rule for status could mutate a collection field. Mitigation: code review rejects cross-concern mutations. The contract test in Task 6 verifies facade/state consistency.
- **[Risk] Plan 002 characterization tests may have gaps** — If a behavior isn't tested, the refactor could silently break it. Mitigation: Plan 002 was designed to cover the full mutation surface. Each Task's verify step runs the full test suite.
- **[Trade-off] Public state fields sacrifice encapsulation for simplicity** — Any rule can touch any field. Accepted because the state type itself documents what fields belong to which concern, and the facade is the only public entry point.
- **[Trade-off] 7 rule modules add file count** — More files to navigate. Accepted because each file is small (~200–400 lines) and named for its single concern, making discoverability better than a monolithic file.

## Migration Plan

N/A — This is a pure internal refactor with no deployment changes, no migration steps, and no behavior changes. Rollback is a simple `git revert` of the implementing commit. All verification gates (tsc, eslint, vitest) must pass before merging.

## Open Questions

None. The design is fully specified in the existing plan (`plans/003-split-fusion-account-data-rules-seam.md`). All technical decisions have been made and documented above.
