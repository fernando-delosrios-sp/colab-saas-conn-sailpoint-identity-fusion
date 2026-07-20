# Design: Rationalize Processor / Runner / Handler Deps Interfaces

## Context

See `proposal.md` for the problem statement. This design covers the mechanical shape of the change.

## Goals

- `IdentityProcessorDeps` shrinks from 8 fields to 7 (1 closure remains: `buildFusionBlend`).
- `DecisionProcessorDeps` shrinks from 10 fields to 8 (1 closure remains: `buildFusionBlend`).
- `ManagedAccountOutcomeHandlerDeps` shrinks from 11 fields to 12 (5 genuinely-orchestrating closures remain; 6 dead/trampoline closures removed).
- `FusionRun.recordFusionBlend` is the canonical write site for blend events.
- `FusionService.applyAttributeProcessing` and `FusionService.registerFusionBlend` are deleted.

## Decisions (from proposal, restated for implementation)

### D1: `FusionRun.recordFusionBlend(blend, tracker?)`

```ts
recordFusionBlend(blend: FusionReportBlend, tracker?: AggregationTracker): void {
    if (!tracker) return
    tracker.fusionBlends.push(blend)
}
```

Lives next to `addDecision` / `addReviewUrlForReviewer` in `model/fusionRun.ts`. Tolerates `undefined` tracker.

### D2: `FusionService.buildFusionBlend` (value-returning)

```ts
public buildFusionBlend(fusionAccount: FusionAccount, account: Account): FusionReportBlend {
    const sourceName = account.sourceName ?? ''
    const nativeIdentity = trimStr(account.nativeIdentity) ?? ''
    const blendedAccountName = trimStr(account.name) || nativeIdentity || account.id ?? ''
    return {
        accountName: fusionAccount.name ?? fusionAccount.identityId ?? 'Unknown',
        accountUrl: fusionAccount.identityId ? this.urlContext.identity(fusionAccount.identityId) : undefined,
        blendedAccountName,
        blendedSource: sourceName,
    }
}
```

`FusionService.registerFusionBlend` is deleted.

### D3: `IdentityProcessor.processIdentity` call site

```ts
addManagedAccountLayer(
    fusionAccount.state,
    this.run,
    this.deps.sources.managedAccountsAllById,
    {
        pruneDeleted: this.shouldPruneDeletedManagedAccounts(),
        onBlend: (account) =>
            this.run.recordFusionBlend(this.deps.buildFusionBlend(fusionAccount, account), this.deps.getTracker()),
    }
)
```

The free function `addManagedAccountLayer` from `model/fusionAccountRules/layerRules.ts` is used (not the method form) because the existing `identityProcessor.ts` already uses the free function form. This keeps the diff minimal.

### D4: `applyAttributeProcessing` becomes a private method

```ts
private async applyAttributeProcessing(fusionAccount: FusionAccount): Promise<void> {
    this.deps.mappingService.mapAttributes(fusionAccount, this.run)
    await this.deps.definitionService.refreshNormalAttributes(fusionAccount)
    this.deps.definitionService.refreshReverseCorrelationAttributes(fusionAccount)
}
```

Each processor takes `mappingService: MappingService` and `definitionService: DefinitionService` in its `Deps`.

### D5: `setFusionAccount` becomes a private method

```ts
private setFusionAccount(fusionAccount: FusionAccount): void {
    this.run.registerFusionAccount(fusionAccount, this.deps.getTracker())
}
```

### D6: `shouldPruneDeletedManagedAccounts` + `isAggregationAccountListMode` inlined

Both processors and the outcome handler capture `commandType` and `operationContext` as private readonly constructor args and compute the bool in a private method:

```ts
private isAggregationAccountListMode(): boolean {
    return (
        this.commandType === StandardCommand.StdAccountList ||
        this.operationContext === OperationContext.AccountList
    )
}

private shouldPruneDeletedManagedAccounts(): boolean {
    return (
        this.isAggregationAccountListMode() ||
        this.commandType === StandardCommand.StdAccountRead ||
        this.commandType === StandardCommand.StdAccountUpdate ||
        this.commandType === StandardCommand.StdAccountEnable ||
        this.commandType === StandardCommand.StdAccountDisable
    )
}
```

### D7: `outcomeHandler` direct injection

`DecisionProcessorDeps` gets `outcomeHandler: ManagedAccountOutcomeHandler`. The processor's call site becomes:

```ts
if (await this.deps.outcomeHandler.handleNonAuthoritativeNoMatch(fusionAccount, sourceType, sourceInfo, managedAccount)) {
```

### D8: `initializeSourceReviewers` moves to the orchestrator

```ts
public async processIdentities(): Promise<FusionAccount[]> {
    const results = await this.identityProcessor.processIdentities()
    await this.initializeSourceReviewers()
    return results
}
```

`IdentityProcessorDeps.initializeSourceReviewers` is removed. The processor no longer triggers source reviewer init.

### D9: `getTracker()` thunk

Each `Deps` interface replaces `tracker: () => AggregationTracker` with `getTracker(): AggregationTracker | undefined`. The construction site passes `() => this._tracker`. The processor and handler call `this.deps.getTracker()` at the point of use.

### D10: OutcomeHandler orchestrating closures stay

`ManagedAccountOutcomeHandlerDeps` retains:

- `preProcessManagedAccount: (account: Account) => Promise<FusionAccount>`
- `processFusionIdentityDecision: (decision: FusionDecision) => Promise<FusionAccount | undefined>`
- `removeMatchAccount: (managedAccountId: string | undefined) => void`
- `queueDisableOperation: (account: Account) => void`
- `isDeferredMatchingEnabledForSource: (sourceName: string | undefined) => boolean`

Plus the new `buildFusionBlend: (fa, account) => FusionReportBlend`.

The 6 dead/trampoline closures that disappear from the interface: `applyAttributeProcessing`, `registerFusionBlend`, `setFusionAccount`, `addMatchScoringTimeMs`, `shouldPruneDeletedManagedAccounts`, `isAggregationAccountListMode`.

### D11: Construction order in `FusionService`

Original order had `outcomeHandler` constructed before `candidateRegistry`, leaving `candidateRegistry: undefined` in the `outcomeHandler` Deps. Corrected order:

1. `managedAccountAnalyzer` (no deps)
2. `candidateRegistry` (no deps)
3. `outcomeHandler` (deps on `candidateRegistry` etc.)
4. `matchingRunner` (deps on `managedAccountAnalyzer` + `candidateRegistry`)
5. `identityProcessor` (deps on `managedAccountAnalyzer` indirectly via `run`)
6. `decisionProcessor` (deps on `outcomeHandler`)

The change is local to the `FusionService` constructor.

## Final Deps Shapes

### IdentityProcessorDeps

```ts
export interface IdentityProcessorDeps {
    identities: IdentityService
    getTracker(): AggregationTracker | undefined
    sources: SourceService
    configSourceNames: Set<string>
    mappingService: MappingService
    definitionService: DefinitionService
    buildFusionBlend(fa: FusionAccount, account: Account): FusionReportBlend
}
```

### DecisionProcessorDeps

```ts
export interface DecisionProcessorDeps {
    forms: FormService
    sources: SourceService
    identities: IdentityService
    correlationManager: CorrelationManager
    outcomeHandler: ManagedAccountOutcomeHandler
    mappingService: MappingService
    definitionService: DefinitionService
    getTracker(): AggregationTracker | undefined
    buildFusionBlend(fa: FusionAccount, account: Account): FusionReportBlend
}
```

### ManagedAccountOutcomeHandlerDeps

```ts
export interface ManagedAccountOutcomeHandlerDeps {
    readonly config: FusionConfig
    readonly log: LogService
    readonly run: FusionRun
    readonly forms: FormService
    readonly definitionService: DefinitionService
    readonly matchingService: MatchingService
    readonly correlationManager: CorrelationManager
    readonly candidateRegistry: CandidateRegistry
    readonly reviewersBySourceId: Map<string, Set<FusionAccount>>
    readonly sourcesWithoutReviewers: Set<string>
    readonly getTracker: () => AggregationTracker | undefined
    readonly preProcessManagedAccount: (account: Account) => Promise<FusionAccount>
    readonly processFusionIdentityDecision: (decision: FusionDecision) => Promise<FusionAccount | undefined>
    readonly removeMatchAccount: (managedAccountId: string | undefined) => void
    readonly queueDisableOperation: (account: Account) => void
    readonly isDeferredMatchingEnabledForSource: (sourceName: string | undefined) => boolean
    readonly buildFusionBlend: (fa: FusionAccount, account: Account) => FusionReportBlend
}
```

## Risks and Trade-offs

- **R1**: The `buildFusionBlend` closure in the `Deps` interface is the only forwarding closure that survives. It is a value-returning function, not a side-effecting forwarder. Future work could move it onto `FusionService` (already there) and have the processor receive a `FusionService` reference — but that reverses the `extract-map-define-match-services` decoupling. Acceptable cost: one closure per processor.
- **R2**: `applyAttributeProcessing` ordering matters. The recipe is `map → refreshNormal → refreshReverseCorrelation`. If a future change reorders these, the inline private method in two places must be updated in sync. The recipe is small (3 lines) and well-documented in the existing `FusionService.applyAttributeProcessing` JSDoc. Acceptable.
- **R3**: The construction order fix in `FusionService` is silent — the original code worked only because the Deps field `candidateRegistry` was a `readonly` reference captured at construction and the order happened to work for the test fixture (which calls `setTracker` before the relevant method). The original code would have crashed if `outcomeHandler` was actually exercised before `candidateRegistry` was assigned. The fix is a real correctness improvement, not just a refactor.

## Migration Plan

1. Add `FusionRun.recordFusionBlend`. Run tests — no other code uses it yet.
2. Replace `FusionService.registerFusionBlend` with `buildFusionBlend`. Update the one internal call site in `processFusionAccount`. Run tests.
3. In `IdentityProcessor`, replace the `onBlend` callback body. Run tests.
4. In `DecisionProcessor`, same.
5. In `IdentityProcessor` / `DecisionProcessor` / `ManagedAccountOutcomeHandler`, replace the `applyAttributeProcessing` Deps closure with `mappingService` + `definitionService` direct injection; add the private `applyAttributeProcessing` method. Run tests.
6. Replace `setFusionAccount` Deps closures with private `setFusionAccount` methods. Run tests.
7. Replace `handleNonAuthoritativeNoMatch` Deps closure with `outcomeHandler` direct injection. Run tests.
8. Replace `isAggregationAccountListMode` and `shouldPruneDeletedManagedAccounts` Deps closures with inlined private methods using captured `commandType`/`operationContext`. Run tests.
9. Replace `tracker: () => AggregationTracker` thunk with `getTracker(): AggregationTracker | undefined` getter. Run tests.
10. Move `initializeSourceReviewers` call to `FusionService.processIdentities`. Remove the Deps field. Run tests.
11. Reorder the `FusionService` constructor body. Run tests.
12. Update the one test spy in `fusionService.test.ts`. Run tests.
13. Run `npm run lint` and `npm run build`.
