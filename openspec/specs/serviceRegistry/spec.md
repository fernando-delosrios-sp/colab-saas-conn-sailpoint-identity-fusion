# serviceRegistry Spec

## Purpose

The service registry (`src/services/serviceRegistry.ts`) is the connector's request-scoped service container. It uses Node's `AsyncLocalStorage` to make the long-lived service instances (config, log, lock, client, etc.) available to the operations layer without threading them through every call site, and resolves the right `Context` and `StandardCommand` for the current request. This spec defines the contract for what is available where, how scoped vs. unscoped services are distinguished, and what an operation can rely on by the time it starts executing.

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



### Requirement: Request-Scoped Dependency Injection
The `ServiceRegistry` MUST use `AsyncLocalStorage` to store the active context for each concurrent operation instead of a static property, ensuring that concurrently executing operations do not overwrite each other's registry.

#### Scenario: Concurrent Operations
- **WHEN** two operations run concurrently in the same process
- **THEN** nested services correctly access their respective operation's registry state.

### Requirement: Pipeline Lock Lifecycle
The aggregation pipeline lock MUST be hoisted outside of setup tasks that may throw exceptions.

#### Scenario: Setup Exception
- **WHEN** `setupPhase` throws an exception (e.g. schema fetch timeout)
- **THEN** the pipeline correctly tracks that the process lock was acquired and releases it in the `finally` block.

### Requirement: Velocity Prototype Isolation
The connector MUST NOT mutate the global `velocityjs.Compile.prototype`.

#### Scenario: Velocity Attribute Patch
- **WHEN** an attribute is compiled via Velocity
- **THEN** the compiler uses a subclass (`SafeCompile`) that patches dangerous property access without affecting other consumers in the process.




### Requirement: Operation Must Send Response
The connector operation handler SHALL guarantee that any custom or default operation concludes by explicitly calling `res.send()` or `res.error()`. If an operation completes its logic but fails to invoke either method, the system MUST immediately throw an explicit error to prevent a hanging request.

#### Scenario: Operation succeeds but fails to respond
- **WHEN** a custom operation handler finishes its asynchronous execution cleanly without throwing an exception
- **AND** it has not called `res.send()` or `res.error()` on the provided response object
- **THEN** the system throws a ConnectorError specifying that the operation finished without responding

#### Scenario: Operation responds correctly
- **WHEN** a custom operation handler finishes its asynchronous execution
- **AND** it has called `res.send()` or `res.error()` during its execution
- **THEN** the system completes normally and does not throw any additional errors

#### Scenario: Operation crashes before responding
- **WHEN** a custom operation handler throws an unhandled exception before calling `res.send()` or `res.error()`
- **THEN** the system catches the original exception and throws a ConnectorError wrapping the original failure, without being masked by the missing response check



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

The release-prep agent MUST edit at least one file under `docs/guides/`
when a version bump is detected, picked from the [src -> docs scope
map](#src---docs-scope-map), so the MkDocs documentation site reflects
the released code.

Feature: version-update-procedure

#### Scenario: Changes to a single src path pick the mapped guide

- **GIVEN** the diff between the previous version tag and `HEAD`
  contains at least one file under `src/services/attributeService/`
- **AND** no other `src/` path has more changed files
- **WHEN** the agent picks the most-affected guide
- **THEN** the agent edits `docs/guides/define.md` (the page mapped
  from `src/services/attributeService/**`)

#### Scenario: Multiple src paths map to the same guide, that guide wins

- **GIVEN** the diff contains three files under
  `src/services/attributeService/` and one file under
  `src/services/fusionService/`
- **WHEN** the agent picks the most-affected guide
- **THEN** the agent edits `docs/guides/define.md` (the page with the
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
- **THEN** the agent edits `docs/guides/troubleshooting.md` (the
  operations fallback from the map)
- **AND** the diff contains a meaningful edit to that page

#### Scenario: Dependency-only changes use the connection-settings fallback

- **GIVEN** the diff contains only changes to `package.json` and
  `package-lock.json`
- **WHEN** the agent picks the most-affected guide
- **THEN** the agent edits `docs/guides/advanced-connection-settings.md`
  (the dependency fallback from the map)
- **AND** the diff contains a meaningful edit to that page

#### Scenario: The diff always contains at least one edited docs guide

- **GIVEN** a version bump is detected
- **AND** at least one file in `src/**`, `connector-spec.json`, or
  `package.json` has changed since the previous version tag
- **WHEN** the agent finishes
- **THEN** the diff contains at least one file under `docs/guides/`

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
- **AND** no file in `src/**`, `docs/guides/**`, or `connector-spec.json`
  has changed since the previous release-prep run
- **WHEN** the release-prep agent runs
- **THEN** the agent does not insert a second `### 2.3.0` block
- **AND** no files are changed

#### Scenario: A `### X.Y.Z` block for the current version exists and the most-affected guide has been edited since

- **GIVEN** a `### 2.3.0` block already exists at the top of `## Changelog`
- **AND** a new file under `docs/guides/` has been edited since the
  previous run
- **WHEN** the release-prep agent runs
- **THEN** the agent does not insert a second `### 2.3.0` block
- **AND** the agent updates the previously-picked guide in place with
  a fresh edit tied to the new change

