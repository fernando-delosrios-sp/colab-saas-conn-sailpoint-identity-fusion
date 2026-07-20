## Why

`FusionAccountBase` has 4 layer methods (`addManagedAccountLayer`, `addIdentityLayer`, `addFusionDecisionLayer`, `addFusionMatch`) that are thin pass-throughs to free functions in `layerRules.ts`. Each does nothing but `freeFunc(this.state, ...args)`. They exist only because `this.state` is `protected`. Meanwhile, the three main callers (`DecisionProcessor`, `IdentityProcessor`, `FusionService`) all pass identical service-layer context (WorkQueue, managedAccountsAllById, pruning callbacks) through these methods — context the model doesn't own. The methods are conceptually processor orchestration dressed as model behavior.

## What Changes

**FusionAccountBase layer methods**
- From: `FusionAccountBase` exposes 4 layer methods that accept service-layer context as parameters and delegate to free functions via `this.state`
- To: Layer methods removed from `FusionAccountBase`. `state` becomes `public readonly`. Callers import from `layerRules.ts` and pass `fusionAccount.state` directly
- Reason: The methods don't operate on anything `FusionAccountBase` owns; they just pass state + external context to free functions
- Impact: Non-breaking for connector operations. Internal API change — tests that call layer methods on `FusionAccount` need updating

**addManagedAccountLayer call site in DecisionProcessor**
- From: `fusionAccount.addManagedAccountLayer(this.run, this.deps.sources.managedAccountsAllById, { pruneDeleted, skipBlendHistory, onBlend })`
- To: `addManagedAccountLayer(fusionAccount.state, this.run, this.deps.sources.managedAccountsAllById, { pruneDeleted, skipBlendHistory, onBlend })`
- Reason: DecisionProcessor already owns all the context; the fusionAccount pass-through was an unnecessary indirection
- Impact: Same parameters, same behavior, different receiver

**addManagedAccountLayer call site in IdentityProcessor**
- Same pattern as DecisionProcessor — replace `fusionAccount.addManagedAccountLayer(...)` with free function call

**addManagedAccountLayer call site in FusionService.processFusionAccount**
- Same pattern — direct free function call with `fusionAccount.state`

**addIdentityLayer, addFusionDecisionLayer, addFusionMatch**
- Same treatment: delete thin wrappers, callers use free functions from `layerRules.ts`

## Capabilities

### Modified Capabilities
- `fusion-service`: FusionAccount exposes `public readonly state`; layer pass-through methods removed; processors import layer free functions directly and pass `fusionAccount.state`
- `matching-service`: `addFusionMatch` called as free function with `fusionAccount.state` instead of instance method

## Impact

- **Code**: ~40 lines of thin-wrapper methods deleted from `FusionAccountBase`. ~4 imports added to processor files. 3 call sites updated per layer method (~12 total). Callers gain direct access to `fusionAccount.state` for any future free-function operation.
- **Tests**: `fusionAccount.test.ts` layer method tests restructured to call free functions directly with `fusionAccount.state`. Integration tests in `fusionService.test.ts` updated similarly.
- **API**: No breaking changes to config schema, connector operations, or external API. Internal-only refactor.
- **Dependencies**: Complementary to active change `encapsulate-fusionrun-state`; both move logic toward the service layer.
