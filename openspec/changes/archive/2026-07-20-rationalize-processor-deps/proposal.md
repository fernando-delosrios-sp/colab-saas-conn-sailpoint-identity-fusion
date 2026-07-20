# Proposal: Rationalize Processor / Runner / Handler Deps Interfaces

## Context

After the `encapsulate-fusionrun-state` change (now archived), the `IdentityProcessor`, `DecisionProcessor`, and `ManagedAccountOutcomeHandler` collaborators still receive a `Deps` object whose closure fields forward to `FusionService` methods that do nothing but call through to `FusionRun` or to real services. The result is `IdentityProcessorDeps` with 5 forwarding closures out of 8 fields, `DecisionProcessorDeps` with 5 forwarding closures out of 10 fields, and `ManagedAccountOutcomeHandlerDeps` with 10 forwarding closures out of 11 fields.

Each closure is a pure trampoline:

```ts
// Before
setFusionAccount: (fa) => this.setFusionAccount(fa)
// where FusionService.setFusionAccount(fa) { this.run.registerFusionAccount(fa, this._tracker) }

registerFusionBlend: (fa, account) => this.registerFusionBlend(fa, account)
// where FusionService.registerFusionBlend(fa, account) { ... this._tracker.fusionBlends.push(...) }

applyAttributeProcessing: (fa) => this.applyAttributeProcessing(fa)
// where FusionService.applyAttributeProcessing(fa) {
//   this.mappingService.mapAttributes(fa, this.run)
//   await this.definitionService.refreshNormalAttributes(fa)
//   this.definitionService.refreshReverseCorrelationAttributes(fa)
// }
```

The closures add an indirection layer, hide the real dependencies from the reader of the processor code, and make `FusionService` look larger than it is.

Two further smells compound the issue:

1. `FusionService.registerFusionBlend` is the partial piece of `encapsulate-fusionrun-state` that did not make it onto `FusionRun`. Blend records are pushed to a tracker that lives on `FusionRun` (via `AggregationTracker.fusionBlends`), but the side-effecting call is on `FusionService`. The result: the "blend event" has no canonical write site.

2. `IdentityProcessorDeps.initializeSourceReviewers` is an orchestration hook that runs once at the end of `processIdentities`, not per-identity. It does not belong in a per-call `Deps` interface; it belongs in the orchestrator (`FusionService`).

## Goals

- Dissolve the pure-forwarding closures on `IdentityProcessorDeps`, `DecisionProcessorDeps`, and `ManagedAccountOutcomeHandlerDeps`.
- Move the blend-record side effect to a named method on `FusionRun` so the write site is canonical.
- Move `initializeSourceReviewers` out of the `IdentityProcessorDeps` interface and into the `FusionService.processIdentities` orchestrator.
- Decompose `FusionService.applyAttributeProcessing` into the two services it actually calls (`MappingService` + `DefinitionService`) and inject them directly.
- Replace `setFusionAccount` Deps closures with a direct `run.registerFusionAccount(fa, tracker)` call.
- Preserve the `getTracker()` thunk pattern (post-construction `setTracker` means the tracker may be undefined at construction time).

## Non-Goals

- No new behavior. The change is structural.
- No changes to `FusionRun` field privacy (the partial work in `encapsulate-fusionrun-state` is out of scope).
- No new services. Existing `MappingService`, `DefinitionService`, `ManagedAccountOutcomeHandler` are reused.
- No spec changes to the `fusion-service` or `match-service` capabilities. The behavior is unchanged.

## Decisions

### D1: `FusionRun.recordFusionBlend(blend, tracker?)` is the canonical write site

The blend record is built in `FusionService.buildFusionBlend(fa, account)` (pure, returns `FusionReportBlend`). The processor's `onBlend` callback is now:

```ts
onBlend: (account) =>
    this.run.recordFusionBlend(this.deps.buildFusionBlend(fa, account), this.deps.getTracker())
```

This satisfies the user-stated constraint "processor free of view-layer dependencies": the processor never touches `urlContext`. The `buildFusionBlend` closure in `Deps` is a value-returning function, not a side-effecting forwarder.

`FusionService.registerFusionBlend` is deleted.

### D2: `applyAttributeProcessing` is decomposed, not forwarded

The recipe in `FusionService.applyAttributeProcessing` is:

```ts
this.mappingService.mapAttributes(fa, this.run)
await this.definitionService.refreshNormalAttributes(fa)
this.definitionService.refreshReverseCorrelationAttributes(fa)
```

The processor now takes `mappingService: MappingService` and `definitionService: DefinitionService` directly. A private `applyAttributeProcessing(fa)` method on the processor calls them in the same order. `FusionService.applyAttributeProcessing` is deleted.

### D3: `setFusionAccount` is replaced with a direct `run.registerFusionAccount` call

The Deps closure `setFusionAccount: (fa) => this.setFusionAccount(fa)` is replaced by a private `setFusionAccount(fa)` method on the processor that calls `this.run.registerFusionAccount(fa, this.deps.getTracker())`. The optional `tracker` argument is the same one `FusionRun.registerFusionAccount` already takes.

`FusionService.setFusionAccount` is kept (it is part of the test surface and is still used by tests for setup), but production code no longer goes through it.

### D4: `shouldPruneDeletedManagedAccounts` and `isAggregationAccountListMode` are inlined

Both are read from captured `commandType` / `operationContext` constructor args. Each processor stores them as private readonly fields and computes the bool in a private method. The `FusionConfig` is also captured for completeness.

### D5: `handleNonAuthoritativeNoMatch` is replaced with a direct `outcomeHandler` reference

`DecisionProcessorDeps.handleNonAuthoritativeNoMatch` (forwarding to `FusionService.handleNonAuthoritativeNoMatch`) is replaced by a direct `outcomeHandler: ManagedAccountOutcomeHandler` injection. The processor calls `this.deps.outcomeHandler.handleNonAuthoritativeNoMatch(fa, sourceType, sourceInfo, account)`.

### D6: `initializeSourceReviewers` moves to the orchestrator

The hook is called once at the end of `IdentityProcessor.processIdentities`. Move it to `FusionService.processIdentities`:

```ts
public async processIdentities(): Promise<FusionAccount[]> {
    const results = await this.identityProcessor.processIdentities()
    await this.initializeSourceReviewers()
    return results
}
```

The Deps field is removed.

### D7: The `tracker` thunk becomes `getTracker(): AggregationTracker | undefined`

`FusionService.setTracker` is called post-construction (in some test paths, before `processIdentities`; in production, before). The original `tracker: () => AggregationTracker` thunk deferred the read. The new shape `getTracker(): AggregationTracker | undefined` is the same idea but is a method call instead of a property read, and signals that the value may be undefined.

The two processors and the outcome handler each call `this.deps.getTracker()` at the point of use. The methods that consume the tracker (`run.registerFusionAccount`, `run.recordFusionBlend`) already accept `undefined` and no-op in that case.

### D8: OutcomeHandler's orchestration closures stay

`ManagedAccountOutcomeHandlerDeps` retains the genuinely-orchestrating closures: `preProcessManagedAccount`, `processFusionIdentityDecision`, `removeMatchAccount`, `queueDisableOperation`, `isDeferredMatchingEnabledForSource`. These forward to `FusionService` methods that touch many fields, not just `FusionRun`. Moving them to direct service refs would require either (a) moving the logic out of `FusionService` (out of scope) or (b) injecting `FusionService` back into the outcome handler (reverses the `extract-map-define-match-services` work). They stay.

The 6 trampoline closures that go away: `applyAttributeProcessing`, `registerFusionBlend`, `setFusionAccount`, `addMatchScoringTimeMs`, `shouldPruneDeletedManagedAccounts`, `isAggregationAccountListMode`. The first three are dissolved (D2, D3, D1). The last three were declared on the interface but unused in the file — they were dead code waiting to be cleaned up.

### D9: Construction order in `FusionService` is fixed

The `outcomeHandler` constructor needs `candidateRegistry` and `managedAccountAnalyzer`, which are constructed after the original `outcomeHandler` instantiation. The order is corrected: `managedAccountAnalyzer` and `candidateRegistry` are constructed first, then `outcomeHandler`, then `matchingRunner`, then `identityProcessor`, then `decisionProcessor` (which depends on `outcomeHandler`).

## Scope

In:

- `src/model/fusionRun.ts` — add `recordFusionBlend`.
- `src/services/fusionService/fusionService.ts` — replace `registerFusionBlend` with `buildFusionBlend`; delete `applyAttributeProcessing`; reorder constructor; call `initializeSourceReviewers` from `processIdentities`; replace one internal self-call site.
- `src/services/fusionService/identityProcessor.ts` — dissolve 5 closures, inject `MappingService` + `DefinitionService`, capture `commandType`/`operationContext`, use `FusionAccountBase` method form (state is protected).
- `src/services/fusionService/decisionProcessor.ts` — same.
- `src/services/matchingService/managedAccountOutcomeHandler.ts` — dissolve 5 closures, capture `commandType`/`operationContext`.
- `src/services/fusionService/__tests__/fusionService.test.ts` — update one spy from `fusionService.setFusionAccount` to `fusionService.run.registerFusionAccount`.

Out:

- No changes to `ManagedAccountMatchingRunner` Deps (already a clean value object).
- No changes to the `extract-map-define-match-services` / `move-layer-methods-to-processors` archived work.
- No changes to `FusionRun` field privacy.
- No changes to public service signatures (only construction site).

## Risks

- **R1**: The `tracker` thunk pattern survives as `getTracker()`. Pure mechanical refactor; risk is small.
- **R2**: The construction order change in `FusionService` is the highest-risk edit. Mitigated by tests (933 pass) and by leaving the order of all subsequent setup unchanged.
- **R3**: The test spy change in `fusionService.test.ts` is the only test edit. The spy is updated to the new write site.
