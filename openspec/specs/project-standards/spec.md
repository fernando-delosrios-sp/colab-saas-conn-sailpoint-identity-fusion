# project-standards Spec

## Purpose

This spec defines the build, test, lint, and development tooling conventions for the project, as well as the directory structure and code conventions that all contributors (human or AI) should follow.
## Requirements
### Requirement: Build and dev commands are documented

All essential project commands SHALL be documented in `.agents/AGENTS.md` with their purpose.

#### Scenario: Build command is documented
- **WHEN** a contributor needs to compile the project
- **THEN** they find `npm run build` documented with its purpose (clean + sync spec + bundle with ncc)

#### Scenario: Test command is documented
- **WHEN** a contributor needs to run tests
- **THEN** they find `npm test` documented as running the Vitest suite

#### Scenario: Lint command is documented
- **WHEN** a contributor needs to verify code quality before committing
- **THEN** they find `npm run lint` documented as ESLint + knip dead-code check

### Requirement: Project structure is documented

The `src/` directory layout and key architectural patterns SHALL be documented in `.agents/AGENTS.md`.

#### Scenario: Service implementations are locatable
- **WHEN** a contributor needs to modify or add service logic
- **THEN** they know services live under `src/services/` with barrel exports via `index.ts`

#### Scenario: Test files are locatable
- **WHEN** a contributor needs to find or create tests
- **THEN** they know tests live in `__tests__/` directories alongside the code they test

#### Scenario: Domain models are locatable
- **WHEN** a contributor needs to understand or extend domain logic
- **THEN** they know domain models live under `src/model/`

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

### Requirement: Use guide documentation roles are enforced

Use guides under `docs/use-guides/` SHALL follow documented information-architecture roles. Each topic guide MUST cover one configuration or operation concern. Router pages (`getting-started/index.md`, `use-guides/configuration/index.md`, `use-guides/operation/index.md`, `validation-and-troubleshooting/troubleshooting.md`) MUST link to canonical topic guides instead of embedding full workflows for topics that already have an owner page.

Field-level reference material SHALL live under `docs/configuration/`, `docs/reference/`, or `docs/operations/` — not duplicated as embedded mini-guides inside topic pages.

#### Scenario: Topic guide has a single concern
- **WHEN** a contributor adds or edits a file under `docs/use-guides/` (other than `index.md` routers)
- **THEN** the page addresses one practical configuration or operation goal
- **AND** detailed workflows for other topics are linked, not copied inline

#### Scenario: Use guide structure is validated locally and in CI
- **WHEN** a contributor runs `npm run lint:docs-guides` or CI runs `ci:docs-review`
- **THEN** `scripts/check-use-guide-structure.cjs` verifies duplicate H2 headings and owned-section violations across use guides
- **AND** the command exits non-zero when a non-allowlisted duplicate H2 or embedded owned section is detected

#### Scenario: Documentation conventions are documented for contributors
- **WHEN** a contributor edits MkDocs use guides
- **THEN** `AGENTS.md` documents router vs topic vs reference roles and the `lint:docs-guides` command

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

### Requirement: Use Native APIs for UUID and FormData
The system MUST use native Node.js APIs (`crypto.randomUUID()` and `FormData`) instead of external dependencies (`uuid` and `form-data`) to reduce package footprint.

#### Scenario: Generating UUIDs
- **WHEN** a unique identifier is required for a correlation or fusion process
- **THEN** the system uses `crypto.randomUUID()` to generate it

#### Scenario: Processing multipart forms
- **WHEN** the system communicates with the API using multipart payloads
- **THEN** it uses native `FormData`

### Requirement: Detect a version bump in package.json

The release-prep agent MUST detect a version bump in `package.json` and
proceed with the release-prep workflow only when the current `version`
field differs from the version at the previous version tag.

Feature: version-update-procedure

#### Scenario: No version bump detected

- **GIVEN** the `version` field in `package.json` is `2.2.0`
- **AND** the most recent version tag is `v2.2.0`
- **WHEN** the release-prep agent runs
- **THEN** the agent takes no action
- **AND** no files are changed

#### Scenario: Version bump detected

- **GIVEN** the `version` field in `package.json` is `2.3.0`
- **AND** the most recent version tag is `v2.2.0`
- **WHEN** the release-prep agent runs
- **THEN** the agent proceeds to draft a `### 2.3.0` changelog block
- **AND** the agent identifies the most-affected docs page

#### Scenario: No previous version tag exists

- **GIVEN** the `version` field in `package.json` is `1.0.0`
- **AND** no version tag exists in the repository
- **WHEN** the release-prep agent runs
- **THEN** the agent treats the initial commit as the previous version
- **AND** the agent proceeds to draft a `### 1.0.0` changelog block

### Requirement: Insert a `### X.Y.Z` changelog block at the top of `## Changelog` in README.md

The release-prep agent MUST insert a new `### X.Y.Z` block at the top of
the `## Changelog` section in `README.md` when a version bump is
detected, formatted to match the existing convention.

Feature: version-update-procedure

#### Scenario: Changelog block uses the `### X.Y.Z` heading style without a trailing date

- **GIVEN** a version bump to `2.3.0` is detected
- **WHEN** the agent inserts a changelog block
- **THEN** the block heading is exactly `### 2.3.0` (no trailing date)
- **AND** the block is inserted at the top of the `## Changelog`
  section, before any older `### X.Y.Z` block
- **AND** older `### X.Y.Z - YYYY-MM-DD` blocks (when present) are
  preserved below the new block exactly as they are

#### Scenario: Each changelog entry is a bulleted line with a `(YYYY-MM-DD)` prefix

- **GIVEN** a version bump to `2.3.0` is detected
- **WHEN** the agent writes entries for the merged PRs since the previous version tag
- **THEN** each entry is a bulleted line starting with `- (YYYY-MM-DD)`
  followed by a summary derived from the merged PR title
- **AND** entries are sorted by merge date descending (newest first)
- **AND** the date is formatted as `YYYY-MM-DD` in UTC

#### Scenario: Changelog block reflects every merged PR since the previous version tag

- **GIVEN** the previous version tag is `v2.2.0`
- **AND** the merged PRs between `v2.2.0` and `HEAD` are titled
  `Fix schema bug`, `Add new matcher`, and `Refactor helpers`
- **WHEN** the agent writes entries for version `2.3.0`
- **THEN** the block contains exactly one bulleted line per merged PR
- **AND** each line starts with `- (YYYY-MM-DD)` followed by a summary
  of the corresponding PR title

#### Scenario: Changelog block has no entries when no PRs were merged

- **GIVEN** the previous version tag is `v2.2.0`
- **AND** no PRs were merged between `v2.2.0` and `HEAD`
- **WHEN** the agent writes entries for version `2.3.0`
- **THEN** the `### 2.3.0` heading is still inserted
- **AND** the block has no bulleted lines below the heading

### Requirement: Edit the most-affected docs guide so the MkDocs site stays in lockstep with the release

The release-prep agent MUST edit at least one file under `docs/use-guides/`
when a version bump is detected, picked from the [src -> docs scope
map](#src---docs-scope-map), so the MkDocs documentation site reflects
the released code.

Feature: version-update-procedure

#### Scenario: Changes to a single src path pick the mapped guide

- **GIVEN** the diff between the previous version tag and `HEAD`
  contains at least one file under `src/services/attributeService/`
- **AND** no other `src/` path has more changed files
- **WHEN** the agent picks the most-affected guide
- **THEN** the agent edits `docs/use-guides/configuration/defining-attributes.md` (the page mapped
  from `src/services/attributeService/**`)

#### Scenario: Multiple src paths map to the same guide, that guide wins

- **GIVEN** the diff contains three files under
  `src/services/attributeService/` and one file under
  `src/services/fusionService/`
- **WHEN** the agent picks the most-affected guide
- **THEN** the agent edits `docs/use-guides/configuration/defining-attributes.md` (the page with the
  most hits)

#### Scenario: Ties in hit count are broken by lexicographic order of the page path

- **GIVEN** the diff contains two files under
  `src/services/attributeService/` and two files under
  `src/services/fusionService/`
- **WHEN** the agent picks the most-affected guide
- **THEN** the agent picks the page whose path is lexicographically
  smaller
- **AND** the agent edits that page

#### Scenario: Changes only to operations use the operations fallback

- **GIVEN** the diff contains only files under `src/operations/**`
- **WHEN** the agent picks the most-affected guide
- **THEN** the agent edits `docs/use-guides/validation-and-troubleshooting/troubleshooting.md` (the
  operations fallback from the map)
- **AND** the diff contains a meaningful edit to that page

#### Scenario: Dependency-only changes use the connection-settings fallback

- **GIVEN** the diff contains only changes to `package.json` and
  `package-lock.json`
- **WHEN** the agent picks the most-affected guide
- **THEN** the agent edits `docs/use-guides/operation/index.md` or the most relevant operation guide from that index
- **AND** the diff contains a meaningful edit to that page

#### Scenario: The diff always contains at least one edited docs guide

- **GIVEN** a version bump is detected
- **AND** at least one file in `src/**`, `connector-spec.json`, or
  `package.json` has changed since the previous version tag
- **WHEN** the agent finishes
- **THEN** the diff contains at least one file under `docs/use-guides/`

### Requirement: Rules are enforced by the release-prep opencode subagent, not by CI

The rules in this specification MUST be enforced by the `release-prep`
opencode subagent, invoked by the maintainer locally via
`/opsx:release-prep`. No CI workflow is added or modified to enforce
these rules.

Feature: version-update-procedure

#### Scenario: The agent is invoked via the opencode command

- **GIVEN** the maintainer has bumped the `version` field in `package.json`
- **WHEN** the maintainer runs `/opsx:release-prep` in opencode
- **THEN** the `release-prep` command delegates to the `release-prep`
  subagent
- **AND** the subagent reads this spec and follows its rules

#### Scenario: No CI workflow is added or modified

- **GIVEN** the rules in this specification
- **WHEN** the change that introduces the rules is merged
- **THEN** no new file is added under `.github/workflows/`
- **AND** no existing `.github/workflows/` file is modified
- **AND** the existing `ci-check-readme-changelog.cjs` script and
  `new-version-full-review.yml` workflow remain unchanged

### Requirement: No dedicated release-notes docs page is created

The "at least one `docs/**` file must change" requirement MUST be
satisfied by editing the most-affected existing guide page, not by
adding a new `docs/release-notes.md` (or similar) page.

Feature: version-update-procedure

#### Scenario: The agent does not create a new docs page

- **GIVEN** a version bump is detected
- **WHEN** the agent finishes
- **THEN** no new file is added under `docs/`
- **AND** the change to the most-affected guide is an edit, not a new
  file

### Requirement: Re-running the agent does not duplicate the changelog entry

The release-prep agent MUST be idempotent with respect to the
changelog block. A re-run with no further changes MUST NOT produce a
second `### X.Y.Z` block for the same version.

Feature: version-update-procedure

#### Scenario: A `### X.Y.Z` block for the current version already exists and no further changes are present

- **GIVEN** a `### 2.3.0` block already exists at the top of `## Changelog`
- **AND** the `version` field in `package.json` is still `2.3.0`
- **AND** no file in `src/**`, `docs/use-guides/**`, or `connector-spec.json`
  has changed since the previous release-prep run
- **WHEN** the release-prep agent runs
- **THEN** the agent does not insert a second `### 2.3.0` block
- **AND** no files are changed

#### Scenario: A `### X.Y.Z` block for the current version exists and the most-affected guide has been edited since

- **GIVEN** a `### 2.3.0` block already exists at the top of `## Changelog`
- **AND** a new file under `docs/use-guides/` has been edited since the
  previous run
- **WHEN** the release-prep agent runs
- **THEN** the agent does not insert a second `### 2.3.0` block
- **AND** the agent updates the previously-picked guide in place with
  a fresh edit tied to the new change

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

