## 1. FusionRun inventory model

- [x] 1.1 Export `ManagedAccountInfo` type from `src/model/fusionRun.ts` (or adjacent model file)
- [x] 1.2 Add `readonly managedAccountInventory = new Map<string, ManagedAccountInfo>()` to FusionRun
- [x] 1.3 Implement `hasManagedAccount`, `getManagedAccountInfo`, and `clearManagedAccountState` on FusionRun
- [x] 1.4 Update `setManagedAccount` to populate inventory metadata via a `toManagedAccountInfo(account)` helper
- [x] 1.5 Add JSDoc on FusionRun documenting work queue vs inventory lifecycle

## 2. Remove managedAccountsAllById

- [x] 2.1 Delete `managedAccountsAllById` field from FusionRun and `RunStateSnapshot` interface
- [x] 2.2 Update `snapshot()` / `restore()` to serialize `managedAccountInventory` instead of `managedAccountsAllById`
- [x] 2.3 Remove all `managedAccountsAllById.set()` calls from `sourceService.ts`
- [x] 2.4 Update `sourceService.clearManagedAccounts()` to call `run.clearManagedAccountState()`

## 3. Migrate consumers to accessors

- [x] 3.1 Update `formService.managedAccountExists` to use `run.hasManagedAccount`
- [x] 3.2 Update `formService.extractAccountInfoOverride` to use queue-first then `getManagedAccountInfo` (no `as any`)
- [x] 3.3 Update `reportService` name/url resolvers to use `getManagedAccountInfo`
- [x] 3.4 Update `sourceService.resolveIscAccountIdForManagedKey` to use inventory fallback

## 4. Simplify fusion layer call chain

- [x] 4.1 Change `_pruneDeletedManagedAccounts` to accept `ReadonlySet<string>` (inventory keys)
- [x] 4.2 Change `_preserveMissingAccountContext` to accept `ReadonlyMap<string, ManagedAccountInfo>`
- [x] 4.3 Update `fusionLayers.addManagedAccountLayer` to read inventory from `workQueue` accessors (not work queue map, not external parameter)
- [x] 4.4 Remove `allAccountsById` parameter from `fusionAccount.addManagedAccountLayer` and `accountAssembly.addManagedAccountLayer`

## 5. Tests and verification

- [x] 5.1 Add `fusionRun.test.ts` case: inventory retains key after `claimAccount`
- [x] 5.2 Update `formService.test.ts`, `reportService.test.ts`, `fusionAccount.test.ts`, and replay harness mocks to use inventory instead of `managedAccountsAllById`
- [x] 5.3 Run `npm run typecheck`, `npm test`, and `npm run lint`
- [x] 5.4 Grep confirms zero non-test references to `managedAccountsAllById`

## 6. Documentation

- [x] 6.1 Remove obsolete form-service comments referencing `managedAccountsAllById` snapshot semantics
- [x] 6.2 Add brief CHANGELOG entry under internal improvements (memory optimization)
