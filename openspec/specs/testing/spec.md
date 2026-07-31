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

Scenario replay Vitest tests MUST NOT auto-discover or replay artifacts from the local `recordings/` directory. Tests SHALL validate harness mechanics (ScenarioRunner, compareOutputs, scenario structure) using self-contained fixtures that do not depend on developer-local recording artifacts.

#### Scenario: ReplayAdapter uses real pipeline

- **WHEN** `buildReplayContext` constructs a replay context for a step
- **THEN** it MUST instantiate a `ServiceRegistry` via `createTestRegistry()`
- **AND** it MUST configure `ReplayApiAdapter` with api-log entries loaded from the scenario's recorded data
- **AND** it MUST delegate to `PipelineRunner.run()` to execute the operation
- **AND** it MUST capture `res.send()` calls instead of manually simulating pipeline phases

#### Scenario: ReplayAdapter does not duplicate pipeline logic

- **WHEN** the real pipeline phase order changes in `corePipeline.ts`
- **THEN** replay tests MUST continue to pass without coordinated edits to `ReplayAdapter`
- **AND** `ReplayAdapter` MUST NOT contain code that re-implements phase ordering, Map/Define evaluation, or service wiring

#### Scenario: Chain replay tests do not scan local recordings

- **REMOVED** — renamed to **Scenario replay tests do not scan local recordings**.

#### Scenario: Scenario replay tests do not scan local recordings

- **GIVEN** a developer has local artifacts under `recordings/` that are incomplete or stale
- **WHEN** `npm test` runs the scenario replay test file
- **THEN** tests MUST pass without reading from `recordings/`
- **AND** harness behavior MUST be validated against a minimal temp fixture

### Requirement: Chain recording verification CLI SHALL run offline golden replay

The project MUST provide an npm script `test-recording` that verifies a named scenario recording offline without running the full Vitest suite. The script SHALL accept a scenario reference argument, validate required artifacts exist under `recordings/{tenant}/{scenarioName}/`, auto-execute all steps in `scenario.json`, compare outputs against recorded goldens, print per-step drift details, and exit with a non-zero status when any step fails or drift is detected.

#### Scenario: Verify named recording succeeds

- **GIVEN** a scenario directory `recordings/my-tenant/my-scenario/` with valid `scenario.json` and matching goldens
- **WHEN** a developer runs `npm run test-recording -- my-tenant/my-scenario`
- **THEN** all steps MUST execute automatically
- **AND** the command MUST exit with code 0
- **AND** output MUST include a per-step pass summary

#### Scenario: Verify named recording reports drift

- **GIVEN** a scenario directory with `scenario.json` where replay outputs differ from `expectedOutput`
- **WHEN** a developer runs `npm run test-recording -- my-tenant/my-scenario`
- **THEN** drift lines MUST be printed for affected steps
- **AND** the command MUST exit with a non-zero status

#### Scenario: Verify missing chain fails clearly

- **REMOVED** — renamed to **Verify missing scenario fails clearly**.

#### Scenario: Verify missing scenario fails clearly

- **GIVEN** no directory `recordings/my-tenant/unknown-scenario/`
- **WHEN** a developer runs `npm run test-recording -- my-tenant/unknown-scenario`
- **THEN** the command MUST print an error indicating the scenario was not found
- **AND** MUST exit with a non-zero status

### Requirement: Recording artifact documentation SHALL describe matching results

Project documentation for chain recording SHALL describe `reports/matching-results.json`: when it is written, what fields it contains (identity matches, deferred matches with scores, non-matches, failures, sweep summary), and how it relates to other artifacts (`api-log.ndjson`, `steps.ndjson`, `reports/aggregation.json`).

#### Scenario: README documents matching results artifact
- **WHEN** a developer reads the chain recording section of README.md
- **THEN** the artifact table SHALL include `reports/matching-results.json` with purpose and field overview

#### Scenario: Testing guide documents artifact layout
- **WHEN** a developer reads `docs/guides/testing-process.md`
- **THEN** the guide SHALL explain capture timing (account-list end in record mode) and how tests may load matching results from a recording directory

### Requirement: Replay CLI SHALL auto-feed scenario steps through a spawned local connector

The project MUST provide an npm script `replay` that prompts for or accepts a scenario reference, spawns a local connector instance in replay mode via proxy-server, feeds all steps from `scenario.json` sequentially in recorded order, streams connector output to the terminal during each step, compares outputs against recorded goldens unless verification is disabled, writes `replay-report.json` to the scenario directory, and exits with a non-zero status when any step fails or drift is detected.

#### Scenario: Replay auto-feeds all scenario steps

- **GIVEN** a scenario directory with valid `scenario.json` and `api-log.ndjson`
- **WHEN** a developer runs `npm run replay -- tenant/scenario`
- **THEN** the command MUST spawn a local connector in replay mode
- **AND** MUST POST each scenario step to the connector in order without manual input
- **AND** MUST print per-step banners and pass/fail summary to the terminal
- **AND** MUST exit with code 0 when all steps pass

#### Scenario: Replay reports drift with non-zero exit

- **GIVEN** a scenario where replay outputs differ from `expectedOutput` for at least one step
- **WHEN** a developer runs `npm run replay -- tenant/scenario`
- **THEN** drift details MUST be printed for affected steps
- **AND** the command MUST exit with a non-zero status

#### Scenario: Replay supports debug flags

- **GIVEN** a valid scenario directory
- **WHEN** a developer runs `npm run replay -- tenant/scenario --no-verify`
- **THEN** steps MUST execute without golden comparison
- **WHEN** a developer runs `npm run replay -- tenant/scenario --step step-3`
- **THEN** only step-3 MUST execute

### Requirement: Scenario replay utilities SHALL be shared between CLI and test harness

Operation-to-SDK type mapping, output comparison, and scenario config sanitization for replay MUST live in a shared module imported by both the replay orchestrator CLI and the in-process scenario verification harness. The test harness class previously named ChainRunner MUST be renamed ScenarioRunner.

#### Scenario: CLI and harness use the same compare logic

- **GIVEN** the shared scenario replay module exports `compareOutputs`
- **WHEN** the replay CLI and `npm run test-recording` both verify a step
- **THEN** both MUST import comparison logic from the shared module
- **AND** MUST NOT duplicate divergent compare implementations

