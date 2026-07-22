## 1. Extract AccountAssembly Service

- [x] 1.1 Create `src/services/accountAssembly/accountAssembly.ts` and barrel `src/services/accountAssembly/index.ts` containing mode gates (`isAggregationAccountListMode`, `shouldPruneDeletedManagedAccounts`), layer application, attribute processing, and registration logic.
- [x] 1.2 Write unit tests for `AccountAssembly` in `src/services/accountAssembly/__tests__/accountAssembly.test.ts`.

## 2. Refactor Processors to Use AccountAssembly

- [x] 2.1 Refactor `FusionService` (`src/services/fusionService/fusionService.ts`) to delegate account assembly to `AccountAssembly`.
- [x] 2.2 Refactor `IdentityProcessor` (`src/services/fusionService/identityProcessor.ts`) to delegate account assembly to `AccountAssembly`.
- [x] 2.3 Refactor `DecisionProcessor` (`src/services/fusionService/decisionProcessor.ts`) to delegate account assembly to `AccountAssembly`.
- [x] 2.4 Refactor `ManagedAccountOutcomeHandler` (`src/services/matchingService/managedAccountOutcomeHandler.ts`) to delegate account assembly to `AccountAssembly`.

## 3. Verification & Cleanup

- [x] 3.1 Run test suite (`npm test`) and lint checks (`npm run lint`).
- [x] 3.2 Update internal documentation/JSDoc in affected processor modules.
