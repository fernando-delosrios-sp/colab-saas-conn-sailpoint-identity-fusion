# code-quality-guardrails Specification

## Purpose
TBD - created by archiving change holistic-dead-code-cleanup. Update Purpose after archive.
## Requirements
### Requirement: Dead Code Prevention
The CI/CD pipeline and local build process SHALL error out if there are any unused exports, types, or variables in the codebase.

#### Scenario: Unused export is added
- **WHEN** a developer adds an export that is not imported anywhere
- **THEN** the linter/static analysis tool (`knip`) will report an error
- **AND** the CI pipeline will fail

### Requirement: Strict Type Declarations
The linter SHALL warn on any usage of explicit `any` and error on `case` block declarations without block scoping.

#### Scenario: A developer uses explicit `any`
- **WHEN** a developer writes `let data: any`
- **THEN** the linter will emit a warning

#### Scenario: A developer declares a variable in a case clause without a block
- **WHEN** a developer writes `case 'foo': const bar = 1; break;`
- **THEN** the linter will emit an error
