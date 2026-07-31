# documentation-site Specification

## Purpose
TBD - created by archiving change documentation-restructure. Update Purpose after archive.
## Requirements
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

The project MUST provide a doc generation script (`scripts/generate-config-docs.cjs`) that emits `docs/configuration/*.md` from `connector-spec.json` organized by ISC menu and section. The script MUST run as part of `npm run docs:prepare`. When `connector-spec.json` translatable fields contain translation keys, the script MUST resolve keys against `src/messages/CONNIDENTITYFUSIONNG.json` so generated pages display English source text.

#### Scenario: Maintainer updates connector-spec.json

- **GIVEN** a field is added or changed in `connector-spec.json`
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the corresponding Configuration reference page SHALL reflect the change
- **AND** generated pages SHALL include field name, type, default, required flag, validation constraints, and a link to the relevant Use guide where applicable

#### Scenario: connector-spec uses translation keys

- **GIVEN** a field `helpText` value is a translation key (not a literal English string)
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the generated Configuration reference MUST display the resolved English string from `CONNIDENTITYFUSIONNG.json`
- **AND** the generated page MUST NOT display raw translation key identifiers as help text

---

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

### Requirement: Full README sync to Home SHALL be removed

The project MUST NOT copy the entire README to `docs/index.md` via `scripts/sync-docs-home.cjs`. Home content SHALL be authored directly in `docs/index.md`.

#### Scenario: Docs prepare runs

- **GIVEN** `scripts/sync-docs-home.cjs` performed a full README copy before restructure
- **WHEN** the restructure is complete and `npm run docs:prepare` runs
- **THEN** `docs/index.md` SHALL NOT be overwritten with the full README contents

### Requirement: Configuration doc generator SHALL resolve platform i18n keys

`scripts/generate-config-docs.cjs` MUST load `src/messages/CONNIDENTITYFUSIONNG.json` and resolve translation keys referenced in `connector-spec.json` translatable fields (`label`, `helpText`, `sectionTitle`, `sectionHelpMessage`, `docLinkLabel`, `placeholder`) when generating Configuration reference pages.

#### Scenario: Doc generator encounters a helpText translation key

- **GIVEN** `connector-spec.json` contains `"helpText": "field.connection.baseurl.helpText"`
- **AND** `CONNIDENTITYFUSIONNG.json` maps that key to an English help string with a Configuration reference link
- **WHEN** `npm run docs:prepare` runs
- **THEN** the generated field section MUST include the resolved English help string
- **AND** relative Configuration reference links MUST be rewritten for the generated page context

### Requirement: Configuration reference SHALL document External Settings section

The generated Configuration reference (`docs/configuration/advanced.md` or equivalent) MUST document the External Settings section with fields: `externalProcessingEnabled`, `externalTargetUrl`, `externalTargetPassword`, `externalProxyEnabled`, `externalRecordingEnabled`, `recordingName`, `externalLoggingEnabled`, and `externalLoggingLevel`. The reference MUST NOT document removed Proxy Settings keys (`proxyEnabled`, `proxyUrl`, `proxyPassword`) or Developer Settings external logging keys (`externalLoggingUrl`).

#### Scenario: Doc generation after connector-spec update

- **GIVEN** `connector-spec.json` defines External Settings under Advanced Settings
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the Configuration reference MUST include External Settings field entries
- **AND** MUST NOT list `proxyEnabled` or `externalLoggingUrl` as active fields

### Requirement: Proxy mode and observability guides SHALL describe External Settings behavior

Technical reference and Use guide pages for proxy mode and connection/observability tuning MUST describe the unified External Settings model, including: gateway toggle semantics, shared target URL/password, recording name when proxy and recording are enabled, and external logging behavior split (HTTP from ISC when proxy off; disk on proxy server when proxy on). Documentation MUST state that default disk paths are tenant-scoped: external logs under `logs/<tenant>/fusion-{YYYYMMDD}.log` and chain recordings under `recordings/<tenant>/{chainName}/`, where `<tenant>` is derived from connection `baseurl`. Documentation MUST note that explicit `LOG_FILE` overrides the default log path without tenant injection.

#### Scenario: Proxy mode reference reflects External Settings

- **GIVEN** the documentation restructure for External Settings is complete
- **WHEN** a reader opens `docs/reference/proxy-mode.md`
- **THEN** the page MUST reference External Settings (not Proxy Settings) for ISC configuration
- **AND** MUST explain that external logging on a proxy server writes to `LOG_FILE` or the default tenant-scoped disk path `logs/<tenant>/fusion-{YYYYMMDD}.log`

#### Scenario: Chain recording reference documents tenant-scoped layout

- **GIVEN** tenant-scoped recording paths are implemented
- **WHEN** a reader opens `docs/reference/chain-recording.md`
- **THEN** the page MUST document that chain artifacts are written under `recordings/<tenant>/{chainName}/`
- **AND** MUST explain that `<tenant>` is derived from connection `baseurl`

#### Scenario: Observability tuning guide documents tenant isolation

- **GIVEN** tenant-scoped log paths are implemented
- **WHEN** a reader opens the connection and observability tuning Use guide
- **THEN** the page MUST describe default external log location as `logs/<tenant>/fusion-{YYYYMMDD}.log` on the proxy server
- **AND** MUST mention `unknown-tenant` fallback when `baseurl` is unavailable

