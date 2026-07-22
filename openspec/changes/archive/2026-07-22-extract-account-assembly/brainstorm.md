# Brainstorm: Extract Account Assembly Recipe

## Context

The processor extraction in the identity fusion connector moved methods to dedicated processor files (`fusionService.ts`, `decisionProcessor.ts`, `identityProcessor.ts`, `managedAccountOutcomeHandler.ts`), but duplicated the core account assembly glue across them (~15 duplicated code blocks).
Specific duplicated logic includes:
- `isAggregationAccountListMode` (duplicated in 4 files)
- `shouldPruneDeletedManagedAccounts` (duplicated in 3 files)
- `applyAttributeProcessing` / Map & Define application (duplicated in 3 files)
- `addManagedAccountLayer` invocation & `skipBlendHistoryForManagedKeys` normalization (duplicated across processors)

Any modification to how accounts absorb layers or apply attribute processing requires coordinated changes across 3–4 files.

## Decision Chain

### Q1: What should be the responsibility of `AccountAssembly`?
- **Option A:** Pure helper utility with static functions.
- **Option B:** A dedicated class/collaborator (`AccountAssembly`) in `src/services/accountAssembly/` that owns mode gates, layer application, attribute processing, and account registration.
- **Decision:** **Option B**. Extract `AccountAssembly` into `src/services/accountAssembly/` as a deep collaborator. Processors (`FusionService`, `IdentityProcessor`, `DecisionProcessor`, `managedAccountOutcomeHandler`) delegate account assembly to `AccountAssembly`, supplying only what varies.

### Q2: What varies per processor?
- **FusionAccount processor (FusionService):** Full aggregation processing over raw source accounts and identities.
- **IdentityProcessor:** Targeted identity account evaluation and layer synthesis.
- **DecisionProcessor:** Decision-driven account assembly and resolution.
- **ManagedAccountOutcomeHandler:** Outcome handling and layer state updates for managed source accounts.

### Q3: How do we ensure testability and backward compatibility?
- Unit test `AccountAssembly` in isolation to test all mode gates, layer application rules, attribute processing, and pruning logic.
- Ensure existing integration tests and unit tests for `FusionService` and processors pass without breaking contracts.

## Design Trade-offs

- **Locality & Maintainability:** Moving assembly recipe to `src/services/accountAssembly/` consolidates ~15 duplicated blocks into a single place. Any changes to layer application or attribute processing touch only `AccountAssembly`.
- **Interface Simplicity:** Processors become thin orchestrators that supply variation points (context, identity IDs, outcomes) while delegating assembly mechanics to `AccountAssembly`.
