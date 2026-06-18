## 1. Identity service scope tracking

- [x] 1.1 Add `identityIdsInScope` set to `IdentityService`, populated only by `fetchIdentities()`
- [x] 1.2 Add `hasIdentityInScope(id?: string): boolean` method
- [x] 1.3 Add async `isIdentityInScope(id: string): Promise<boolean>` using targeted `id:"<id>"` search combined with scope query
- [x] 1.4 Ensure `clear()` also clears `identityIdsInScope`
- [x] 1.5 Add unit tests for scope tracking and targeted scope check

## 2. FusionAccount orphan rule extension

- [x] 2.1 Add `_originIdentityInScope` private field and `setOriginIdentityInScope` setter
- [x] 2.2 Update `addManagedAccountLayer` orphan logic to consider identity-origin accounts
- [x] 2.3 Preserve `baseline` status when identity-origin account becomes orphan
- [x] 2.4 Add unit tests for identity-origin orphan scenarios

## 3. Aggregation processing

- [x] 3.1 In `FusionService.processFusionAccount`, compute origin identity scope membership and set the flag before `addManagedAccountLayer`
- [x] 3.2 In `FusionService.processIdentity`, set `_originIdentityInScope = true` for newly created identity accounts
- [x] 3.3 Add integration tests in `fusionService.test.ts` for aggregation orphan behavior

## 4. Single-account operations

- [x] 4.1 Update `rebuildFusionAccount` to perform scope-aware identity check before processing
- [x] 4.2 Ensure accountRead/update/enable/disable paths honor the new orphan status
- [x] 4.3 Add tests for single-account orphan detection

## 5. Validation and cleanup

- [x] 5.1 Run full test suite (`npm test`)
- [x] 5.2 Run `openspec validate extend-delete-empty-to-identity-accounts --type change --strict`
- [x] 5.3 Update any affected documentation or schema descriptions if needed
