## MODIFIED Requirements

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
- **THEN** the agent edits `docs/use-guides/operation/connection-and-observability-tuning.md`
  (the dependency fallback from the map)
- **AND** the diff contains a meaningful edit to that page

#### Scenario: The diff always contains at least one edited docs guide

- **GIVEN** a version bump is detected
- **AND** at least one file in `src/**`, `connector-spec.json`, or
  `package.json` has changed since the previous version tag
- **WHEN** the agent finishes
- **THEN** the diff contains at least one file under `docs/use-guides/`

## MODIFIED Requirements

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
