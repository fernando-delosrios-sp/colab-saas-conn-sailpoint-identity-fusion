## MODIFIED Requirements

### Requirement: Code conventions are documented

TypeScript, formatting, naming, error-handling, and testing conventions SHALL be documented in `AGENTS.md`.

Private member naming SHALL follow these rules:

- The `_` prefix SHALL be reserved exclusively for unused variables, parameters, and functions (matching ESLint `argsIgnorePattern` / `varsIgnorePattern: '^_'`).
- Class fields and methods that are not public SHALL use TypeScript `private` or `protected` visibility without an `_` prefix.
- When a public accessor (`get` / `set`) shares a name with its backing storage, the private backing field SHALL use the `Value` suffix (e.g. `private nameValue` backing `get name()`).

#### Scenario: TypeScript conventions are documented

- **GIVEN** a contributor opens `AGENTS.md`
- **WHEN** they write or edit TypeScript code
- **THEN** they find documented conventions for strict mode, ESM imports, and private member naming without `_` prefixes

#### Scenario: Unused binding underscore convention is documented

- **GIVEN** a contributor opens `AGENTS.md`
- **WHEN** they need to mark an unused parameter or local variable
- **THEN** they find that the `_` prefix is reserved for unused bindings only

#### Scenario: Accessor backing Value suffix is documented

- **GIVEN** a contributor opens `AGENTS.md`
- **WHEN** they implement a public accessor backed by private storage
- **THEN** they find that the backing field SHALL use the `Value` suffix and `private` visibility

#### Scenario: Formatting conventions are documented

- **WHEN** a contributor writes or edits code
- **THEN** they find documented formatting rules (120-char width, 4-space tabs, single quotes, no semicolons, ES5 trailing commas)

#### Scenario: Error handling conventions are documented

- **WHEN** a contributor writes error handling
- **THEN** they find documented conventions for using `ConnectorError` and `createOperationHandler`

#### Scenario: Testing conventions are documented

- **WHEN** a contributor writes tests
- **THEN** they find documented conventions for Vitest globals, file naming, directory placement, and timeout

## ADDED Requirements

### Requirement: Private member naming is enforced by lint

The ESLint configuration SHALL forbid `_`-prefixed names on class members (properties, methods, and parameter properties) while preserving the existing unused-binding ignore pattern for `_`-prefixed locals and parameters.

#### Scenario: Underscore-prefixed private field fails lint

- **GIVEN** a developer adds `private _example = 1` to a class in `src/`
- **WHEN** they run `npm run lint`
- **THEN** ESLint reports a naming-convention violation

#### Scenario: Unused parameter with underscore passes lint

- **GIVEN** a function declares an unused parameter `_unused`
- **WHEN** they run `npm run lint`
- **THEN** ESLint does not report an unused-variable or naming-convention error for that parameter

#### Scenario: Value-suffixed accessor backing passes lint

- **GIVEN** a class declares `private nameValue?: string` with a public `get name()` accessor
- **WHEN** they run `npm run lint`
- **THEN** ESLint does not report a naming-convention violation
