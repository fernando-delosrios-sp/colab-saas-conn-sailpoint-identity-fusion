## ADDED Requirements

### Requirement: MkDocs site SHALL expose six top-level navigation sections

The published MkDocs site (`mkdocs.yml`) MUST define exactly these top-level nav entries: **Home**, **Getting started**, **Configuration**, **Use guides**, **Glossary**, and **Technical reference**.

#### Scenario: Reader opens the documentation site nav

- **GIVEN** the MkDocs site is built with `npm run docs:prepare && mkdocs build`
- **WHEN** a reader views the site navigation
- **THEN** the six top-level sections listed above SHALL be present
- **AND** there SHALL NOT be a standalone **Concepts** top-level section

### Requirement: Home SHALL embed the Map-Define-Match framework inline

The Home page (`docs/index.md`) MUST embed the Map, Define, and Match framework narrative directly in the page. Home MUST NOT sync the full README and MUST NOT link to a separate map-define-match concepts page as the primary framework entry.

#### Scenario: Reader lands on Home

- **GIVEN** the documentation site is published
- **WHEN** a reader opens Home
- **THEN** the page SHALL contain inline sections explaining Map, Define, and Match
- **AND** the page SHALL NOT contain connector-spec field reference tables

#### Scenario: Retired concepts page

- **GIVEN** the restructure is complete
- **WHEN** a maintainer searches for `docs/concepts/map-define-match.md`
- **THEN** the file SHALL be retired or replaced with a redirect stub pointing to Home

### Requirement: Getting started Overview SHALL embed operation modes

The Getting started Overview page MUST embed authoritative, records, and orphan operation mode explanations. Operation modes MUST NOT appear on Home.

#### Scenario: Reader prepares first configuration

- **GIVEN** the documentation site is published
- **WHEN** a reader opens Getting started → Overview
- **THEN** the page SHALL explain authoritative accounts, records, and orphan accounts modes inline

### Requirement: Configuration reference pages SHALL be generated from connector-spec.json

The project MUST provide a doc generation script (`scripts/generate-config-docs.cjs`) that emits `docs/configuration/*.md` from `connector-spec.json` organized by ISC menu and section. The script MUST run as part of `npm run docs:prepare`.

#### Scenario: Maintainer updates connector-spec.json

- **GIVEN** a field is added or changed in `connector-spec.json`
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the corresponding Configuration reference page SHALL reflect the change
- **AND** generated pages SHALL include field name, type, default, required flag, validation constraints, and a link to the relevant Use guide where applicable

### Requirement: connector-spec helpKey strings SHALL link to Configuration reference

Each `helpKey` in `connector-spec.json` MUST be shortened to at most two sentences and MUST include a relative link to the generated Configuration reference anchor for that field.

#### Scenario: Operator views a field in ISC source configuration

- **GIVEN** a field has a `helpKey` in connector-spec.json
- **WHEN** the operator reads inline help in ISC
- **THEN** the help text SHALL be concise
- **AND** the help text SHALL direct the operator to the Configuration reference page for full detail

### Requirement: Use guides SHALL follow the four-subsection structure

Use guides (`docs/use-guides/`) MUST be organized under exactly four nav subsections, each named `[Topic] guides`: **Configuration guides**, **Operation guides**, **Validation and troubleshooting guides**, and **Deployment guides**.

#### Scenario: Reader browses Use guides nav

- **GIVEN** the documentation site is published
- **WHEN** a reader expands Use guides in the nav
- **THEN** the four subsection names above SHALL appear
- **AND** there SHALL NOT be a **Core pipeline** subsection

### Requirement: Use guides SHALL NOT duplicate Configuration field tables

Pages under `docs/use-guides/` MUST contain scenario-driven how-to content only. Field definition tables belonging in the Configuration reference MUST NOT be duplicated in Use guides; guides MUST link to Configuration reference anchors instead.

#### Scenario: Maintainer migrates a legacy guide

- **GIVEN** a legacy guide under `docs/guides/` contained per-field tables
- **WHEN** the guide is migrated to `docs/use-guides/`
- **THEN** field tables SHALL be removed from the Use guide
- **AND** the guide SHALL link to the generated Configuration reference for each field it mentions

### Requirement: Use guides roster SHALL include twelve pages

The Use guides section MUST publish exactly twelve pages: one index plus eleven guides distributed as follows — Configuration guides (6), Operation guides (2), Validation and troubleshooting guides (2), Deployment guides (1). The former `guides/match.md` MUST be split into **Matching identities** and **Review forms and reviewers**.

#### Scenario: Nav lists all Configuration guides

- **GIVEN** the documentation site is published
- **WHEN** a reader expands Use guides → Configuration guides
- **THEN** pages for Mapping attributes, Defining attributes, Matching identities, Review forms and reviewers, Tuning matching algorithms, and Configuring sources SHALL be present

#### Scenario: Proxy mode has no Use guide

- **GIVEN** the restructure is complete
- **WHEN** a reader searches Use guides for proxy mode
- **THEN** there SHALL NOT be a proxy mode Use guide page
- **AND** proxy field reference SHALL appear under Configuration reference
- **AND** proxy deployment content SHALL appear under Technical reference

### Requirement: Glossary SHALL be a top-level nav entry

The user-facing glossary MUST be published at `docs/glossary.md` (or equivalent top-level path) and MUST appear as a top-level **Glossary** nav entry. It MUST remain aligned with `openspec/specs/ubiquitous-language/spec.md`.

#### Scenario: Reader looks up a domain term

- **GIVEN** the documentation site is published
- **WHEN** a reader opens Glossary from the top-level nav
- **THEN** the glossary page SHALL load without navigating through Concepts or Use guides

### Requirement: README SHALL NOT contain Configuration field reference tables

After restructure, `README.md` MUST serve as a repository landing page only. It MUST NOT contain the "Reference: configuration at a glance" section or other field reference tables moved to Configuration reference.

#### Scenario: Contributor reads README on GitHub

- **GIVEN** the restructure is complete
- **WHEN** a contributor opens README.md
- **THEN** the file SHALL link to the documentation site for Configuration reference and Use guides
- **AND** the file SHALL NOT duplicate connector-spec field tables

### Requirement: Docs CI SHALL reject lean-ctx placeholder corruption

The docs CI pipeline MUST fail if any file under `docs/` contains the pattern `lean-ctx: omitted` indicating corrupted lean-ctx read artifacts.

#### Scenario: Corrupted doc is committed

- **GIVEN** a markdown file under `docs/` contains `... [lean-ctx: omitted`
- **WHEN** `npm run ci:docs-review` runs
- **THEN** the command SHALL exit with a non-zero status

### Requirement: Full README sync to Home SHALL be removed

The project MUST NOT copy the entire README to `docs/index.md` via `scripts/sync-docs-home.cjs`. Home content SHALL be authored directly in `docs/index.md`.

#### Scenario: Docs prepare runs

- **GIVEN** `scripts/sync-docs-home.cjs` performed a full README copy before restructure
- **WHEN** the restructure is complete and `npm run docs:prepare` runs
- **THEN** `docs/index.md` SHALL NOT be overwritten with the full README contents
