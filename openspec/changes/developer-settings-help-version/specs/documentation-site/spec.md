## ADDED Requirements

### Requirement: Developer Settings sectionHelpMessage SHALL include the installed connector version

The Developer Settings `sectionHelpMessage` in `connector-spec.json` MUST contain the **installed connector version** — the exact `package.json` `version` string. `sectionTitle` MUST remain `Developer Settings`. The canonical `SECTION_HELP` template MUST interpolate that version when slim/rewrite writes the committed spec.

#### Scenario: Operator expands Developer Settings in ISC

- **GIVEN** `package.json` `version` is `2.2.0`
- **AND** the connector package with that version is installed in ISC
- **WHEN** an operator reads the Developer Settings `sectionHelpMessage`
- **THEN** the help text SHALL include `2.2.0` as visible text
- **AND** `sectionTitle` SHALL be `Developer Settings`

#### Scenario: Slim rewrite interpolates the current version

- **GIVEN** `package.json` `version` is `2.3.0`
- **WHEN** a maintainer runs the connector-spec help slim/rewrite
- **THEN** Developer Settings `sectionHelpMessage` in `connector-spec.json` SHALL include `2.3.0`
- **AND** SHALL NOT retain a previous version as the installed connector version

---

### Requirement: Generated Developer Settings Configuration intro SHALL NOT embed the installed connector version

`SECTION_INTRO_OVERRIDES` (or equivalent) for Developer Settings MUST NOT include the `package.json` version. Use-guide copy MUST tell operators that the **installed connector version** appears in the Developer Settings `sectionHelpMessage`, not in the section header.

#### Scenario: Maintainer generates Configuration reference after a version bump

- **GIVEN** `package.json` `version` has changed
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the generated Developer Settings intro SHALL NOT contain that semver solely because of the bump
- **AND** SHALL NOT claim the section header displays the installed connector version

#### Scenario: Operator reads the reset Fusion state guide

- **GIVEN** the Use guide for reset Fusion state
- **WHEN** an operator looks up how to confirm the deployed build
- **THEN** the guide SHALL point to Developer Settings section help
- **AND** SHALL NOT say the section header displays the installed connector version

---

## MODIFIED Requirements

### Requirement: connector-spec inline help SHALL be guarded by an automated lint check

The project MUST provide `scripts/check-connector-spec-help.cjs` that validates all `helpKey` and `sectionHelpMessage` values against the length and link rules above. The check MUST also fail when Developer Settings `sectionHelpMessage` does not contain the current `package.json` `version`. The check MUST run as part of `npm run lint` or `npm run docs:prepare` and MUST exit non-zero on violation.

#### Scenario: CI rejects verbose inline help

- **GIVEN** a `helpKey` or `sectionHelpMessage` exceeds its character limit or lacks a required link
- **WHEN** the maintainer runs `npm run lint`
- **THEN** the command SHALL exit with a non-zero status
- **AND** the output SHALL identify the offending field key or section title

#### Scenario: Clean connector-spec passes help lint

- **GIVEN** all inline help strings comply with length and link rules
- **AND** Developer Settings `sectionHelpMessage` contains the current `package.json` version
- **WHEN** the maintainer runs `npm run lint`
- **THEN** the connector-spec help check SHALL pass without errors

#### Scenario: CI rejects Developer Settings version drift

- **GIVEN** `package.json` `version` is `2.3.0`
- **AND** Developer Settings `sectionHelpMessage` does not contain `2.3.0`
- **WHEN** the maintainer runs `npm run lint`
- **THEN** the connector-spec help check SHALL exit with a non-zero status
- **AND** the output SHALL identify Developer Settings

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

_(none)_
