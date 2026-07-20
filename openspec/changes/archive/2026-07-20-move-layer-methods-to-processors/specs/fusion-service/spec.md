## MODIFIED Requirements

### Requirement: FusionAccount facade SHALL delegate all operations to state and rules

`FusionAccount` MUST expose its internal state as `public readonly state: FusionAccountState`. The `state` reference SHALL NOT be reassignable. `FusionAccount` SHALL contain static factory methods delegating to construction rules, public accessors delegating to `this.state`, and public mutators delegating to the appropriate rule module. Layer operations (`addIdentityLayer`, `addManagedAccountLayer`, `addFusionDecisionLayer`, `addFusionMatch`) SHALL NOT be instance methods on `FusionAccount`. Callers SHALL import the corresponding free functions from `src/model/fusionAccountRules/layerRules.ts` and pass `fusionAccount.state` as the first argument. All other existing methods on `FusionAccount` (getters, setters, status management, review management, correlation methods) SHALL remain unchanged.

#### Scenario: State is accessible from a FusionAccount instance
- **WHEN** code holds a reference to a `FusionAccount` instance
- **THEN** `fusionAccount.state` returns the `FusionAccountState` object
- **AND** the returned object is the same one used internally by all mutator methods

#### Scenario: State reference cannot be reassigned
- **WHEN** code attempts `fusionAccount.state = new FusionAccountState(config)`
- **THEN** TypeScript compilation fails because `state` is `readonly`

#### Scenario: Factory method delegates to construction rules
- **WHEN** `FusionAccount.fromIdentity(identity)` is called
- **THEN** a new `FusionAccount` is constructed and `buildFromIdentity` is called on its `state`

#### Scenario: Mutator delegates to rule module
- **WHEN** `fusionAccount.addStatus("test-status")` is called
- **THEN** `FusionAccountStatusRules.addStatus` is invoked with `fusionAccount.state` and the status

#### Scenario: Accessor reads from state
- **WHEN** `fusionAccount.email` is accessed after `state.email` is set to `"test@example.com"`
- **THEN** the getter returns `"test@example.com"`

#### Scenario: addManagedAccountLayer is not a method on FusionAccount
- **WHEN** code attempts `fusionAccount.addManagedAccountLayer(...)`
- **THEN** TypeScript compilation fails because the method does not exist

#### Scenario: Layer operation invoked via free function
- **WHEN** a service processor needs to add a managed account layer
- **THEN** it SHALL call `addManagedAccountLayer(fusionAccount.state, ...)` as a free function imported from `layerRules.ts`

#### Scenario: Status mutation still works through FusionAccountBase after layer methods removed
- **WHEN** `fusionAccount.addStatus("candidate")` is called
- **THEN** the status is added to `fusionAccount.state.statuses` via the status rule module
- **AND** the method signature and behavior are unchanged

### Requirement: Processors SHALL invoke layer operations via free functions

DecisionProcessor, IdentityProcessor, and FusionService SHALL import the layer rule functions they need from `src/model/fusionAccountRules/layerRules.ts` and SHALL pass `fusionAccount.state` as the first argument. They SHALL NOT call layer operations as methods on `FusionAccountBase` instances.

#### Scenario: DecisionProcessor calls addManagedAccountLayer as free function
- **WHEN** DecisionProcessor.processFusionIdentityDecision needs to apply managed accounts
- **THEN** it SHALL call `addManagedAccountLayer(fusionAccount.state, this.run, this.deps.sources.managedAccountsAllById, options)` as an imported free function
- **AND** it SHALL NOT call `fusionAccount.addManagedAccountLayer(...)`

#### Scenario: IdentityProcessor calls addManagedAccountLayer as free function
- **WHEN** IdentityProcessor.processIdentity needs to apply managed accounts
- **THEN** it SHALL call `addManagedAccountLayer(fusionAccount.state, this.run, this.deps.sources.managedAccountsAllById, options)` as an imported free function

#### Scenario: FusionService calls addManagedAccountLayer as free function
- **WHEN** FusionService.processFusionAccount needs to apply managed accounts
- **THEN** it SHALL call `addManagedAccountLayer(fusionAccount.state, this.run, this.sources.managedAccountsAllById, options)` as an imported free function
