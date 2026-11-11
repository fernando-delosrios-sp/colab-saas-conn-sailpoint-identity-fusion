## ADDED Requirements

### Requirement: Build verification use guide SHALL exist in Operation guides

The documentation site SHALL provide one operation use guide at `docs/use-guides/operation/verify-deployed-connector-build.md`, listed under Operation guides in `mkdocs.yml`, and passing `npm run lint:docs-guides`.

#### Scenario: Guide structure and navigation

- **GIVEN** the documentation navigation in `mkdocs.yml`
- **WHEN** a reader opens Operation guides
- **THEN** the build verification guide SHALL be listed
- **AND** the guide SHALL pass `npm run lint:docs-guides`

### Requirement: Build verification use guide SHALL explain the comparison outcomes

The build verification use guide SHALL tell an operator how to read the **connector build stamp** in Developer Settings section help and how to compare it with `npm run build:stamp` on the branch that produces packages. It SHALL NOT claim that the connector decides whether a tenant is current.

#### Scenario: Operator needs to know whether a tenant is up to date

- **GIVEN** a maintainer with `2.2.0/preview` checked out
- **WHEN** they open the build verification use guide
- **THEN** the guide SHALL explain where the connector build stamp appears in ISC
- **AND** SHALL show `npm run build:stamp` as the reference for the current checkout

#### Scenario: Comparison outcomes are named

- **GIVEN** a tenant showing a connector build stamp
- **WHEN** the operator compares it with `npm run build:stamp`
- **THEN** the guide SHALL state that an equal stamp means the tenant runs the same tree
- **AND** SHALL state that a different stamp means the tenant was packed from another commit
- **AND** SHALL state that a `-dirty` stamp cannot be matched to a commit
- **AND** SHALL NOT describe an automatic current or behind check

---

## MODIFIED Requirements

### Requirement: Developer Settings sectionHelpMessage SHALL include the installed connector version

The Developer Settings `sectionHelpMessage` in `connector-spec.json` MUST contain the **installed connector version** — the exact `package.json` `version` string. A packaged connector zip MUST also carry the **connector build stamp** in that message, after the version sentence. The committed `connector-spec.json` MUST NOT carry a build stamp; stamping happens while packaging and is reverted afterwards. `sectionTitle` MUST remain `Developer Settings`. The canonical `SECTION_HELP` template MUST interpolate that version when slim/rewrite writes the committed spec.

#### Scenario: Operator expands Developer Settings in ISC

- **GIVEN** `package.json` `version` is `2.2.0`
- **AND** the connector package with that version is installed in ISC
- **WHEN** an operator reads the Developer Settings `sectionHelpMessage`
- **THEN** the help text SHALL include `2.2.0` as visible text
- **AND** `sectionTitle` SHALL be `Developer Settings`

#### Scenario: Packaged spec carries both identities

- **GIVEN** a package packed from a clean tree at commit `def5678`
- **WHEN** an operator reads the Developer Settings `sectionHelpMessage`
- **THEN** the help text SHALL show the installed connector version
- **AND** SHALL show the connector build stamp `def5678` with its commit date and branch

#### Scenario: Slim rewrite interpolates the current version

- **GIVEN** `package.json` `version` is `2.3.0`
- **WHEN** a maintainer runs the connector-spec help slim/rewrite
- **THEN** Developer Settings `sectionHelpMessage` in `connector-spec.json` SHALL include `2.3.0`
- **AND** SHALL NOT retain a previous version as the installed connector version

#### Scenario: Committed spec stays unstamped

- **GIVEN** the repository working tree at any commit
- **WHEN** a maintainer reads the committed `connector-spec.json` Developer Settings help
- **THEN** it SHALL NOT contain a connector build stamp
- **AND** the inline help version check SHALL pass against the current `package.json` version

### Requirement: Generated Developer Settings Configuration intro SHALL NOT embed the installed connector version

`SECTION_INTRO_OVERRIDES` (or equivalent) for Developer Settings MUST NOT include the `package.json` version. Use-guide copy MUST tell operators that the **installed connector version** appears in the Developer Settings `sectionHelpMessage`, not in the section header, and that the **connector build stamp** appears next to it in a packaged connector.

#### Scenario: Maintainer generates Configuration reference after a version bump

- **GIVEN** `package.json` `version` has changed
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the generated Developer Settings intro SHALL NOT contain that semver solely because of the bump
- **AND** SHALL NOT claim the section header displays the installed connector version

#### Scenario: Operator reads the reset Fusion state guide

- **GIVEN** the Use guide for reset Fusion state
- **WHEN** an operator looks up how to confirm the deployed build
- **THEN** the guide SHALL point to Developer Settings section help
- **AND** SHALL link to the build verification use guide
- **AND** SHALL NOT say the section header displays the installed connector version

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

_(none)_
