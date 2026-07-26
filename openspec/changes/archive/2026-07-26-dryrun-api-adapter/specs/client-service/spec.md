## ADDED Requirements

### Requirement: Client service SHALL support a DryRunApiAdapter for write inhibition

When dry-run mode is active on account-list, `ServiceRegistry` SHALL wrap the live `SdkApiAdapter` with a `DryRunApiAdapter`. The adapter SHALL delegate all read API calls to the inner adapter unchanged. The adapter SHALL inhibit all write API calls (using shared write-method classification) without calling the inner adapter, and SHALL return synthetic responses from an in-memory shadow store so callers that assert on returned IDs can continue.

#### Scenario: Read calls delegate to live SDK

- **GIVEN** dry-run mode is active and `DryRunApiAdapter` wraps `SdkApiAdapter`
- **WHEN** a read API method (e.g. `listAccounts`, `getSource`) is invoked
- **THEN** the inner `SdkApiAdapter` SHALL receive the call
- **AND** the live response SHALL be returned to the caller

#### Scenario: Write calls are inhibited

- **GIVEN** dry-run mode is active
- **WHEN** a write API method (e.g. `updateAccount`, `updateSource`, `createFormDefinition`) is invoked
- **THEN** the inner `SdkApiAdapter` SHALL NOT receive the call
- **AND** the adapter SHALL return a synthetic response without mutating the ISC tenant

#### Scenario: Synthetic form responses include IDs

- **GIVEN** dry-run mode is active
- **WHEN** `createFormDefinition` or `createFormInstance` is invoked
- **THEN** the synthetic response SHALL include an `id` field
- **AND** downstream FormService assertions SHALL succeed

### Requirement: Write-method classification SHALL be shared between replay and dry-run adapters

The connector SHALL extract write-method detection from `ReplayApiAdapter` into a shared module. Both `ReplayApiAdapter` and `DryRunApiAdapter` SHALL import the same classification so replay and dry-run agree on which methods are writes.

#### Scenario: Replay and dry-run classify the same method as a write

- **GIVEN** an API method name classified as a write (e.g. `updateSource`)
- **WHEN** either `ReplayApiAdapter` or `DryRunApiAdapter` handles a call to that method
- **THEN** both adapters SHALL treat it as a write (replay: recorded response; dry-run: inhibited with synthetic response)

### Requirement: ServiceRegistry SHALL activate dry-run adapter at accountList entry

`ServiceRegistry` SHALL expose `activateDryRunMode()` to wrap the client adapter before any account-list phase issues API calls. Activation SHALL occur at the start of `accountList` after parsing `dryRun.enabled`, because the registry is constructed before input is available.

#### Scenario: Adapter activated before setup phase API calls

- **GIVEN** an account-list invocation with `{ dryRun: { enabled: true } }`
- **WHEN** `accountList` begins execution
- **THEN** `activateDryRunMode()` SHALL be called before Setup phase API calls
- **AND** all subsequent `ClientService.call()` invocations SHALL route through `DryRunApiAdapter`
