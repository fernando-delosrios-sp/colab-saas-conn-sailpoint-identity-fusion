## ADDED Requirements

### Requirement: Scenario recording test suite SHALL be invoked separately

The project MUST provide an npm script `test:scenario` that runs Vitest against files matching `src/operations/__tests__/scenario/**/*.test.ts` using `vitest.scenario.config.ts`. Default commands `npm test`, `npm run test:watch`, and `npm run test:coverage` MUST NOT discover or execute those files. The named golden-replay CLI `npm run test-recording` MUST remain a separate command.

#### Scenario: npm test does not run scenario folder tests

- **GIVEN** Vitest files exist under `src/operations/__tests__/scenario/`
- **WHEN** a developer runs `npm test` in the project root
- **THEN** Vitest MUST NOT load any `*.test.ts` file from `src/operations/__tests__/scenario/`
- **AND** the command MUST still execute the global test suite and exit non-zero if any of those tests fail

#### Scenario: test:scenario runs the scenario recording test suite

- **GIVEN** Vitest files exist under `src/operations/__tests__/scenario/`
- **WHEN** a developer runs `npm run test:scenario`
- **THEN** Vitest MUST execute those `*.test.ts` files
- **AND** MUST NOT require `VERIFY_RECORDING_SCENARIO` (or other recording env vars) for fixture-based tests
- **AND** env-gated tests MUST continue to skip when their env vars are unset

#### Scenario: npm test path override cannot pull in scenario tests

- **GIVEN** `vitest.config.ts` excludes `src/operations/__tests__/scenario/**`
- **WHEN** a developer runs `npm test -- src/operations/__tests__/scenario/chain.replay.test.ts`
- **THEN** Vitest MUST NOT execute that file
- **AND** documentation MUST instruct developers to use `npm run test:scenario` instead

#### Scenario: test-recording CLI remains distinct

- **GIVEN** a valid scenario directory `recordings/my-tenant/my-scenario/`
- **WHEN** a developer runs `npm run test-recording -- my-tenant/my-scenario`
- **THEN** the command MUST still verify that named recording offline
- **AND** MUST NOT be the command that runs the Vitest scenario recording test suite

---

## MODIFIED Requirements

### Requirement: automated tests MUST run under Vitest

The project's automated test suite MUST execute under Vitest, not Jest. Files matching `src/**/*.test.ts` except those under `src/operations/__tests__/scenario/` MUST be discoverable by `npm test` and the command MUST exit with a non-zero status if any test fails. Jest, `ts-jest`, `babel-jest`, and `@types/jest` MUST NOT be present in `devDependencies` once this change is applied.

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
- **AND** `src/operations/__tests__/scenario/**` is listed in `exclude`

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
- **WHEN** `npm run test:scenario` runs the scenario replay test file
- **THEN** tests MUST pass without reading from `recordings/`
- **AND** harness behavior MUST be validated against a minimal temp fixture
