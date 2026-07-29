# testing Spec

## Purpose

This spec defines the contract for the project's automated test infrastructure: the test runner, configuration, and environment that all test files execute under.
## Requirements
### Requirement: automated tests MUST run under Vitest

The project's automated test suite MUST execute under Vitest, not Jest. All files matching `src/**/*.test.ts` MUST be discoverable by `npm test` and the command MUST exit with a non-zero status if any test fails. Jest, `ts-jest`, `babel-jest`, and `@types/jest` MUST NOT be present in `devDependencies` once this change is applied.

#### Scenario: npm test runs the Vitest runner
- **GIVEN** a developer runs `npm test` in the project root
- **WHEN** the test command completes
- **THEN** Vitest is the runner that executed the tests
- **AND** the exit code is non-zero if any test fails
- **AND** `jest`, `ts-jest`, `babel-jest`, and `@types/jest` are absent from `devDependencies` in `package.json`

#### Scenario: vitest config preserves the prior test environment
- **GIVEN** the project has been migrated to Vitest
- **WHEN** a developer inspects `vitest.config.ts`
- **THEN** the test environment is `node`
- **AND** the include patterns cover both `src/**/__tests__/**/*.test.ts` and `src/**/*.test.ts`
- **AND** the same fixture and harness directories excluded by the prior `jest.config.js` remain excluded via the `exclude` glob

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

The `ReplayAdapter` MUST execute operations through the real `ServiceRegistry` and `PipelineRunner` instead of re-implementing pipeline phase logic. The adapter SHALL configure `ReplayApiAdapter` with prerecorded API responses and capture `res.send()` outputs for comparison against recorded goldens.

Chain replay Vitest tests MUST NOT auto-discover or replay artifacts from the local `recordings/` directory. Tests SHALL validate harness mechanics (ChainRunner, compareOutputs, scenario structure) using self-contained fixtures that do not depend on developer-local recording artifacts.

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

#### Scenario: Chain replay tests do not scan local recordings
- **GIVEN** a developer has local artifacts under `recordings/` that are incomplete or stale
- **WHEN** `npm test` runs the chain replay test file
- **THEN** tests pass without reading from `recordings/`
- **AND** harness behavior is validated against a minimal temp fixture

### Requirement: Chain recording verification CLI SHALL run offline golden replay

The project MUST provide an npm script `test-recording` that verifies a named chain recording offline without running the full Vitest suite. The script SHALL accept a chain name argument, validate required artifacts exist under `recordings/{chainName}/`, auto-execute all steps in `scenario.json`, compare outputs against recorded goldens, print per-step drift details, and exit with a non-zero status when any step fails or drift is detected.

#### Scenario: Verify named recording succeeds
- **GIVEN** a chain directory `recordings/my-chain/` with valid `scenario.json` and matching goldens
- **WHEN** a developer runs `npm run test-recording -- my-chain`
- **THEN** all steps execute automatically
- **AND** the command exits with code 0
- **AND** output includes a per-step pass summary

#### Scenario: Verify named recording reports drift
- **GIVEN** a chain directory with `scenario.json` where replay outputs differ from `expectedOutput`
- **WHEN** a developer runs `npm run test-recording -- my-chain`
- **THEN** drift lines are printed for affected steps
- **AND** the command exits with a non-zero status

#### Scenario: Verify missing chain fails clearly
- **GIVEN** no directory `recordings/unknown-chain/`
- **WHEN** a developer runs `npm run test-recording -- unknown-chain`
- **THEN** the command prints an error indicating the chain was not found
- **AND** exits with a non-zero status

---

