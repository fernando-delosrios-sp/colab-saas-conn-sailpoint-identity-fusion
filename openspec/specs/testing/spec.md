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

Test files SHALL follow the project's testing conventions for naming, placement, and configuration.

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
