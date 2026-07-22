# Proposal: Collapse the FusionAccount facade into behavior-rich objects

## Why

`FusionAccountBase` (src/model/fusionAccountBase.ts, ~350 lines) is a pass-through facade with ~70 public methods — every single one is a 1–3 line delegation to a rule function. The 54 rule functions across 8 files under `src/model/fusionAccountRules/` each have exactly one production caller (the facade method). `FusionAccountState` exposes all 41 fields publicly, so encapsulation is missing at every level.

Understanding one behavior ("blend a managed account") bounces through four files: `layerRules.ts` → `fusionAccountMatcher.ts` → `collectionRules.ts` → `historyRules.ts`. Callers must navigate duplicate accessors (`identityId` vs `identityIdAttribute`, `attributes` vs `currentAttributes` vs `attributeBag`) and respect a hidden global invariant (`FusionAccount.configure(config)` must be called before any factory method).

This is the current relationship:

```
FusionAccountBase (~70 public methods)  → 1:1 delegation
  ├─ fusionAccountRules/layerRules.ts       (7 funcs)
  ├─ fusionAccountRules/collectionRules.ts  (7 funcs)
  ├─ fusionAccountRules/statusRules.ts     (12 funcs)
  ├─ fusionAccountRules/actionRules.ts      (6 funcs)
  ├─ fusionAccountRules/reviewRules.ts      (9 funcs)
  ├─ fusionAccountRules/correlationRules.ts (4 funcs)
  ├─ fusionAccountRules/historyRules.ts     (3 funcs)
  ├─ fusionAccountRules/constructionRules.ts (setIdentityIdAttribute)
  └─ FusionAccountState                     (41 public fields)
```

The facade adds no value — it is a 1:1 projection of the rule modules onto a single class.

## What Changes

Collapse the facade, rule modules, and state container into three behavior-rich sub-objects owned by `FusionAccount`:

1. **FusionCollections** — owns all collection sets (accounts, statuses, actions, reviews, sources, matches, history) as private fields. Exposes domain-level add/remove/has methods. History is managed internally. Exposes read-only getters and `syncToBag()`.

2. **FusionCorrelation** — owns correlation state (promises, managed-account info map, pending operations) as private fields. Exposes correlate/decorrelate methods that bundle multiple collection mutations.

3. **FusionLayers** — owns the three layer methods (identity, managed account, fusion decision) and identity-linked state. Each layer method is a self-contained behavior that directly mutates collections and correlation sub-objects.

`FusionAccount` becomes the top-level domain object (~150 lines) holding basic identity info, the three sub-objects, factory methods, `configure()`, and `toISCAccount()`. The 8 rule modules and `FusionAccountState` are deleted. Rule function bodies move directly into the methods on the sub-objects they serve.

## Capabilities

### Modified Capabilities

- **fusion-service** — Callers access `fusionAccount.collections.*`, `fusionAccount.correlation.*` instead of flat facade methods. Domain-level method names replace granular delegation (`markCorrelated` replaces `addAccountId` + `removeMissingAccountId`).
- **matching-service** — Trigram index and normalization build on `fusionAccount.collections` read-only views instead of raw state access.

### Removed

- `src/model/fusionAccountState.ts` — eliminated; state moves to private fields on sub-objects
- `src/model/fusionAccountRules/` — 8 files, 54 functions eliminated; logic inlines into sub-object methods
- `src/model/fusionAccountBase.ts` — renamed to `src/model/fusionAccount.ts` (which currently re-exports `FusionAccountBase`)

## Impact

- **Deleted files**: `fusionAccountState.ts`, 8 files under `fusionAccountRules/` (9 files total)
- **Modified files**: `src/model/fusionAccountBase.ts` → `src/model/fusionAccount.ts` (rewritten, ~150 lines), `src/model/fusionAccountAccessors.ts` (empty/deleted), `src/model/account.ts` (re-export updated), all ~20 caller files in `src/services/` and `src/operations/` updated for new sub-object API
- **New files**: `src/model/fusionCollections.ts` (~350 lines), `src/model/fusionCorrelation.ts` (~120 lines), `src/model/fusionLayers.ts` (~400 lines)
- **Net line count**: ~1,750 lines deleted, ~1,000 lines added → **~750 lines net reduction** (~43% of current model directory)
- **Public API**: Breaking changes to `FusionAccount` method surface — callers must migrate from flat methods to sub-object API
- **Verification gates**: `npx tsc --noEmit`, `npx eslint "src/**/*.ts"`, `npx vitest run`
