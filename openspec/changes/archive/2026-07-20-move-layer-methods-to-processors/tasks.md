## 1. Expose state on FusionAccountBase

- [x] 1.1 Change `protected readonly state` to `public readonly state` in `src/model/fusionAccountBase.ts`
- [x] 1.2 Verify compilation: `npx tsc --noEmit`

## 2. Remove layer methods from FusionAccountBase

- [x] 2.1 Delete `addIdentityLayer`, `addManagedAccountLayer`, `addFusionDecisionLayer`, `addFusionMatch` methods and doc comments from `src/model/fusionAccountBase.ts`
- [x] 2.2 Remove the `layerRules.ts` import block used only by those 4 methods (verify no other code in the file references those imports)
- [x] 2.3 Verify compilation: `npx tsc --noEmit`

## 3. Update DecisionProcessor to use free functions

- [x] 3.1 Add imports for `addIdentityLayer`, `addManagedAccountLayer`, `addFusionDecisionLayer` from `src/model/fusionAccountRules/layerRules.ts`
- [x] 3.2 Replace `fusionAccount.addIdentityLayer(selectedIdentity)` with `addIdentityLayer(fusionAccount.state, selectedIdentity)`
- [x] 3.3 Replace `fusionAccount.addFusionDecisionLayer(fusionDecision)` with `addFusionDecisionLayer(fusionAccount.state, fusionDecision)`
- [x] 3.4 Replace `fusionAccount.addManagedAccountLayer(this.run, this.deps.sources.managedAccountsAllById, {...})` with `addManagedAccountLayer(fusionAccount.state, this.run, this.deps.sources.managedAccountsAllById, {...})`

## 4. Update IdentityProcessor to use free functions

- [x] 4.1 Add imports for `addIdentityLayer`, `addManagedAccountLayer` from `src/model/fusionAccountRules/layerRules.ts`
- [x] 4.2 Replace `existingAccount.addIdentityLayer(identity)` and `fusionAccount.addIdentityLayer(identity)` with `addIdentityLayer(existingAccount.state, identity)` and `addIdentityLayer(fusionAccount.state, identity)`
- [x] 4.3 Replace `fusionAccount.addManagedAccountLayer(this.run, this.deps.sources.managedAccountsAllById, {...})` with `addManagedAccountLayer(fusionAccount.state, this.run, this.deps.sources.managedAccountsAllById, {...})`

## 5. Update FusionService to use free functions

- [x] 5.1 Add imports for `addIdentityLayer`, `addManagedAccountLayer`, `addFusionDecisionLayer` from `src/model/fusionAccountRules/layerRules.ts`
- [x] 5.2 Replace `fusionAccount.addIdentityLayer(identity)` with `addIdentityLayer(fusionAccount.state, identity)` in `processFusionAccount`
- [x] 5.3 Replace `fusionAccount.addFusionDecisionLayer(authorizedLinkDecision)` with `addFusionDecisionLayer(fusionAccount.state, authorizedLinkDecision)` in `processFusionAccount`
- [x] 5.4 Replace `fusionAccount.addManagedAccountLayer(this.run, this.sources.managedAccountsAllById, {...})` with `addManagedAccountLayer(fusionAccount.state, this.run, this.sources.managedAccountsAllById, {...})` in `processFusionAccount`

## 6. Update MatchingService to use free function

- [x] 6.1 Add import for `addFusionMatch` from `src/model/fusionAccountRules/layerRules.ts`
- [x] 6.2 Replace `fusionAccount.addFusionMatch(fusionMatch)` with `addFusionMatch(fusionAccount.state, fusionMatch)` in `compareFusionAccounts`

## 7. Update tests

- [x] 7.1 Update `model/__tests__/fusionAccount.test.ts`: replace `acc.addManagedAccountLayer(run, ...)` with `addManagedAccountLayer(acc.state, run, ...)`; replace `acc.addIdentityLayer(identity)` with `addIdentityLayer(acc.state, identity)`; replace `acc.addFusionDecisionLayer(decision)` with `addFusionDecisionLayer(acc.state, decision)`; replace `acc.addFusionMatch(match)` with `addFusionMatch(acc.state, match)`
- [x] 7.2 Update `services/fusionService/__tests__/fusionService.test.ts`: replace layer method calls with free function equivalents
- [x] 7.3 Update test harness `operations/__tests__/chain/harness/ReplayAdapter.ts`: replace `fusionAccount.addManagedAccountLayer(...)` and `fusionAccount.addIdentityLayer(...)` with free function calls

## 8. Verify

- [x] 8.1 Run full test suite: `npm test`
- [x] 8.2 Run lint: `npm run lint`
- [x] 8.3 Run build: `npm run build`
