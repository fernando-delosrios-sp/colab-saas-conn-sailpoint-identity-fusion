## ADDED Requirements

### Requirement: Test harness SHALL use a single mock seam at the platform boundary

Operation tests MUST drive execution through the real `ServiceRegistry`, substituting only the `IscApiAdapter` and `Context` dependencies. The test harness SHALL NOT contain mock registries that duplicate service internals with `as any` type casts.

#### Scenario: Tests drive operations through ServiceRegistry.run
- **WHEN** an operation test executes a connector operation
- **THEN** the test calls `ServiceRegistry.run(registry, () => operation(...))` with a real `ServiceRegistry`
- **AND** only `IscApiAdapter` and `Context` are substituted
- **AND** no internal service methods are mocked with `vi.fn()` unless a specific test scenario requires overriding behavior

#### Scenario: Single factory creates test registries
- **WHEN** a test needs a `ServiceRegistry` instance
- **THEN** the test calls a single `createTestRegistry()` factory function
- **AND** the returned registry has full TypeScript types (no `as any` cast on the registry object)
- **AND** the factory does not duplicate service internals

### Requirement: Duplicate mock registries SHALL be removed

The test harness MUST NOT contain multiple mock registry implementations with overlapping functionality. At most one factory function SHALL exist for building test `ServiceRegistry` instances.

#### Scenario: No overlapping mock registries exist
- **WHEN** a developer inspects the test harness code
- **THEN** `src/operations/__tests__/harness/mockRegistry.ts` does not exist
- **AND** `src/operations/__tests__/harness/registryMocking.ts` does not exist
- **AND** exactly one test registry factory exists in the harness directory

### Requirement: ReplayAdapter SHALL delegate to the real pipeline

The `ReplayAdapter` MUST execute operations through the real `ServiceRegistry` and `PipelineRunner` instead of re-implementing pipeline phase logic. The adapter SHALL configure `FakeApiAdapter` with prerecorded API responses and capture `res.send()` outputs for comparison against recorded goldens.

#### Scenario: ReplayAdapter uses real pipeline
- **WHEN** `buildReplayContext` constructs a replay context for a step
- **THEN** it instantiates a `ServiceRegistry` via `createTestRegistry()`
- **AND** it configures `FakeApiAdapter` API mocks from prerecorded data
- **AND** it delegates to `PipelineRunner.run()` to execute the operation
- **AND** it captures `res.send()` calls instead of manually simulating pipeline phases

#### Scenario: ReplayAdapter does not duplicate pipeline logic
- **WHEN** the real pipeline phase order changes in `corePipeline.ts`
- **THEN** replay tests continue to pass without coordinated edits to `ReplayAdapter`
- **AND** `ReplayAdapter` contains no code that re-implements phase ordering, Map/Define evaluation, or service wiring

## MODIFIED Requirements

### Requirement: Test file conventions

Test files SHALL follow the project's testing conventions for naming, placement, and configuration. Operation test files MUST use the test registry factory when constructing `ServiceRegistry` instances.

#### Scenario: Test files use correct naming
- **WHEN** a developer creates a test file
- **THEN** the file is named `*.test.ts`

#### Scenario: Test files are placed in correct directories
- **WHEN** a developer creates a test file
- **THEN** the file is placed in a `__tests__/` directory alongside the code it tests

#### Scenario: Vitest globals are used
- **WHEN** a developer writes a test file
- **THEN** the test uses Vitest globals (describe, it, expect, etc.) without explicit imports

#### Scenario: Test timeout is respected
- **WHEN** a developer writes a test
- **THEN** the test respects the 180s timeout configured in vitest.config.ts

#### Scenario: Operation tests use test registry factory
- **WHEN** an operation test needs a `ServiceRegistry`
- **THEN** it constructs the registry through the canonical `createTestRegistry()` factory
- **AND** it does not import from deleted mock files (`mockRegistry`, `registryMocking`)

## REMOVED Requirements

None.
