## Why

The identity fusion connector previously duplicated account assembly glue (~15 code blocks including mode gates, pruning rules, attribute processing, and layer registration) across multiple processor files. Consolidating this logic into a unified `AccountAssembly` collaborator eliminates code duplication, improves maintainability, and allows processors to be tested independently.

## What Changes

**Account Assembly Recipe Consolidation**
- From: Duplicated account assembly logic (`isAggregationAccountListMode`, `shouldPruneDeletedManagedAccounts`, `applyAttributeProcessing`, and layer registration) scattered across `FusionService`, `IdentityProcessor`, `DecisionProcessor`, and `ManagedAccountOutcomeHandler`.
- To: A single `AccountAssembly` collaborator residing in `src/services/accountAssembly/` that encapsulates the complete account assembly recipe. Processors invoke `AccountAssembly` and supply only processor-specific variation.
- Reason: Simplifies processor maintenance, prevents logic drift, and ensures high test coverage for core assembly rules.
- Impact: Internal refactoring (non-breaking API contract).

## Capabilities

### New Capabilities
- `account-assembly`: Centralized account assembly recipe owning mode gates, layer application, attribute processing, and registration for fusion accounts.

### Modified Capabilities
- `fusion-service`: Delegates account assembly steps to the `AccountAssembly` collaborator.

## Impact

- Refactored: `src/services/fusionService/fusionService.ts`, `decisionProcessor.ts`, `identityProcessor.ts`, `src/services/matchingService/managedAccountOutcomeHandler.ts`
- New Service: `src/services/accountAssembly/`
- Test Coverage: Dedicated unit tests for `AccountAssembly` and streamlined tests for processors.
