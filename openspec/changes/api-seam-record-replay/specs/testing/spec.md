## MODIFIED Requirements

### Requirement: ReplayAdapter SHALL delegate to the real pipeline

The `ReplayAdapter` MUST execute operations through the real `ServiceRegistry` and `PipelineRunner` instead of re-implementing pipeline phase logic. The adapter SHALL configure `ReplayApiAdapter` with prerecorded API responses and capture `res.send()` outputs for comparison against recorded goldens.

#### Scenario: ReplayAdapter uses real pipeline
- **WHEN** `buildReplayContext` constructs a replay context for a step
- **THEN** it instantiates a `ServiceRegistry` via `createTestRegistry()`
- **AND** it configures `ReplayApiAdapter` with api-log entries loaded from the scenario's recorded data
- **AND** it delegates to `PipelineRunner.run()` to execute the operation
- **AND** it captures `res.send()` calls instead of manually simulating pipeline phases

#### Scenario: ReplayAdapter does not duplicate pipeline logic
- **WHEN** the real pipeline phase order changes in `corePipeline.ts`
- **THEN** replay tests continue to pass without coordinated edits to `ReplayAdapter`
- **AND** `ReplayAdapter` contains no code that re-implements phase ordering, Map/Define evaluation, or service wiring

## REMOVED Requirements

### Requirement: No remaining FakeApiAdapter references

`FakeApiAdapter` SHALL NOT exist in the test harness. All references SHALL be replaced with `ReplayApiAdapter` (for replay tests) or inline `ApiLogEntry[]` arrays (for unit-style operation tests).

#### Scenario: FakeApiAdapter file does not exist
- **WHEN** a developer inspects the test harness directory
- **THEN** `src/operations/__tests__/chain/harness/fakeApiAdapter.ts` does not exist

#### Scenario: No imports of FakeApiAdapter
- **WHEN** a developer searches the codebase for `FakeApiAdapter`
- **THEN** no import or reference remains in any test or source file

### Requirement: Service-method mocks in ReplayAdapter SHALL be deleted

`ReplayAdapter` SHALL NOT contain hand-mocked service methods (`processFusionAccounts`, `fetchManagedAccounts`, `fetchIdentityById`, `getISCAccount`, `forEachISCAccount`, etc.). The real service implementations SHALL handle all logic driven by `ReplayApiAdapter` responses.

#### Scenario: ReplayAdapter has no service-method mocks
- **WHEN** a developer inspects `ReplayAdapter.buildReplayContext`
- **THEN** no `vi.fn()` or mock overrides on individual service methods exist
- **AND** only `IscApiAdapter` is substituted via `createTestRegistry()`
