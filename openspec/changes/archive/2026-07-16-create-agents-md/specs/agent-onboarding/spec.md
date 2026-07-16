## ADDED Requirements

### Requirement: Agent discovers build and dev commands

Feature: agent-onboarding
Rule: AI agents reading `.agents/AGENTS.md` can locate all essential project commands without inspecting `package.json`.

#### Scenario: Agent finds the build command
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent needs to compile the project
- **THEN** it finds `npm run build` documented with its purpose (clean + sync spec + bundle with ncc)

#### Scenario: Agent finds the test command
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent needs to run tests
- **THEN** it finds `npm test` documented as running the Vitest suite

#### Scenario: Agent finds the lint command
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent needs to verify code quality before committing
- **THEN** it finds `npm run lint` documented as ESLint + knip dead-code check

### Requirement: Agent understands project structure

Feature: agent-onboarding
Rule: AI agents reading `.agents/AGENTS.md` understand the `src/` directory layout and key architectural patterns.

#### Scenario: Agent locates service implementations
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent needs to modify or add service logic
- **THEN** it knows services live under `src/services/` with barrel exports via `index.ts`

#### Scenario: Agent locates test files
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent needs to find or create tests
- **THEN** it knows tests live in `__tests__/` directories alongside the code they test

#### Scenario: Agent identifies domain models
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent needs to understand or extend domain logic
- **THEN** it knows domain models live under `src/model/`

### Requirement: Agent follows project code conventions

Feature: agent-onboarding
Rule: AI agents reading `.agents/AGENTS.md` apply the project's TypeScript, formatting, naming, error-handling, and testing conventions.

#### Scenario: Agent applies TypeScript conventions
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent writes or edits TypeScript code
- **THEN** it uses strict mode, ESM imports (not require), and avoids `_` prefix unless indicating conventionally-private members

#### Scenario: Agent applies formatting conventions
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent writes or edits code
- **THEN** it formats with 120-char width, 4-space tabs, single quotes, no semicolons, and ES5 trailing commas

#### Scenario: Agent applies error handling conventions
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent writes error handling
- **THEN** it uses `ConnectorError` from `@sailpoint/connector-sdk` for known operation errors and wraps handlers in `createOperationHandler`

#### Scenario: Agent applies testing conventions
- **GIVEN** an AI agent has read `.agents/AGENTS.md`
- **WHEN** the agent writes tests
- **THEN** it uses Vitest with `globals: true`, names files `*.test.ts`, places them in `__tests__/` directories, and respects the 180s timeout

## MODIFIED Requirements

<!-- No existing requirements modified. -->

## REMOVED Requirements

<!-- No requirements removed. -->
