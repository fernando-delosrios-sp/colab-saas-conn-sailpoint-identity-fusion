# documentation-site Specification

## Purpose
TBD - created by archiving change documentation-restructure. Update Purpose after archive.
## Requirements
### Requirement: MkDocs site SHALL expose six top-level navigation sections

The published MkDocs site (`mkdocs.yml`) MUST define exactly these top-level nav entries: **Home**, **Use guides**, **Configuration**, **Glossary**, and **Technical reference**. Getting started content MUST appear as a subsection under **Use guides**, not as a separate top-level section.

#### Scenario: Reader opens the documentation site nav

- **GIVEN** the MkDocs site is built with `npm run docs:prepare && mkdocs build`
- **WHEN** a reader views the site navigation
- **THEN** Home, Use guides, Configuration, Glossary, and Technical reference SHALL be present as top-level entries
- **AND** Getting started SHALL appear under Use guides
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

The Getting started Overview page MUST embed authoritative, records, and orphan operation mode explanations and umbrella vs side-car deployment patterns. Operation modes MUST link to the Source types guide for full detail.

#### Scenario: Reader prepares first configuration

- **GIVEN** the documentation site is published
- **WHEN** a reader opens Getting started → Overview
- **THEN** the page SHALL explain umbrella and side-car deployment modes
- **AND** SHALL link to Source types for Authoritative, Records, and Orphan behavior

### Requirement: Configuration reference pages SHALL be generated from connector-spec.json

The project MUST provide a doc generation script (`scripts/generate-config-docs.cjs`) that emits `docs/configuration/*.md` from `connector-spec.json` organized by ISC menu and section. The script MUST run as part of `npm run docs:prepare`. When `connector-spec.json` translatable fields contain translation keys, the script MUST resolve keys against `src/messages/CONNIDENTITYFUSIONNG.json` so generated pages display English source text.

For sections where ISC inline help is intentionally slim, the generator MUST prefer curated `SECTION_INTRO_OVERRIDES` (or equivalent) so generated Configuration reference pages retain adequate field-context prose without depending on verbose `sectionHelpMessage` values.

#### Scenario: Maintainer updates connector-spec.json

- **GIVEN** a field is added or changed in `connector-spec.json`
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the corresponding Configuration reference page SHALL reflect the change
- **AND** generated pages SHALL include field name, type, default, required flag, validation constraints, and a link to the relevant Use guide where applicable

#### Scenario: Slim sectionHelpMessage does not thin generated docs

- **GIVEN** a section's `sectionHelpMessage` is shortened for ISC
- **AND** that section has a `SECTION_INTRO_OVERRIDES` entry in `generate-config-docs.cjs`
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the generated Configuration reference section intro SHALL use the override text
- **AND** SHALL NOT rely on the slim ISC `sectionHelpMessage` for substantive documentation

#### Scenario: connector-spec uses translation keys

- **GIVEN** a field `helpText` value is a translation key (not a literal English string)
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the generated Configuration reference MUST display the resolved English string from `CONNIDENTITYFUSIONNG.json`
- **AND** the generated page MUST NOT display raw translation key identifiers as help text

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

The Use guides section MUST publish an index plus configuration, operation, validation, deployment, and getting-started guides. Configuration guides MUST include, at minimum: Configuring sources and scope, Source types, Mapping attributes, Defining attributes, Matching identities, Managing correlation, Managing reviewers, Review forms and reviewers, Tuning matching algorithms, and Match tuning cookbooks.

#### Scenario: Nav lists all Configuration guides

- **GIVEN** the documentation site is published
- **WHEN** a reader expands Use guides → Configuration guides
- **THEN** pages for Configuring sources and scope, Source types, Mapping attributes, Defining attributes, Matching identities, Review forms and reviewers, Tuning matching algorithms, and Match tuning cookbooks SHALL be present

#### Scenario: Proxy mode has no Use guide

- **GIVEN** the documentation hardening change is complete
- **WHEN** a reader searches Use guides for proxy mode
- **THEN** there SHALL NOT be a proxy mode Use guide page
- **AND** proxy field reference SHALL appear under Configuration reference
- **AND** proxy deployment content SHALL appear under Technical reference

### Requirement: Glossary SHALL be a top-level nav entry

The user-facing glossary MUST be published at `docs/glossary.md` and MUST appear as a top-level **Glossary** nav entry. It MUST remain aligned with `openspec/specs/ubiquitous-language/spec.md`, including deployment mode and scope terms added by this change.

#### Scenario: Reader looks up a domain term

- **GIVEN** the documentation site is published
- **WHEN** a reader opens Glossary from the top-level nav
- **THEN** the glossary page SHALL load without navigating through Concepts or Use guides

#### Scenario: Reader looks up umbrella mode

- **GIVEN** the documentation site is published
- **WHEN** a reader opens Glossary and searches for umbrella mode
- **THEN** a definition MUST be present linking to Configuring sources and scope

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

Technical reference and Use guide pages for proxy mode and connection/observability tuning MUST describe the unified External Settings model, including: gateway toggle semantics, shared target URL/password, recording name when proxy and recording are enabled, and external logging behavior split (HTTP from ISC when proxy off; disk on proxy server when proxy on). Documentation MUST state that default disk paths are tenant-scoped: external logs under `logs/<tenant>/fusion-{YYYYMMDD}.log` and scenario recordings under `recordings/<tenant>/{scenarioName}/`, where `<tenant>` is derived from connection `baseurl`. Documentation MUST note that explicit `LOG_FILE` overrides the default log path without tenant injection. Scenario capture MUST be documented as an External Settings configuration workflow, not a separate npm record run mode.

#### Scenario: Proxy mode reference reflects External Settings

- **GIVEN** the documentation restructure for External Settings is complete
- **WHEN** a reader opens `docs/reference/proxy-mode.md`
- **THEN** the page MUST reference External Settings (not Proxy Settings) for ISC configuration
- **AND** MUST explain that external logging on a proxy server writes to `LOG_FILE` or the default tenant-scoped disk path `logs/<tenant>/fusion-{YYYYMMDD}.log`

#### Scenario: Chain recording reference documents tenant-scoped layout

- **REMOVED** — superseded by **Scenario recording reference documents tenant-scoped layout and capture workflow**; reference file renamed to `docs/reference/scenario-recording.md`.

#### Scenario: Scenario recording reference documents tenant-scoped layout and capture workflow

- **GIVEN** tenant-scoped recording paths are implemented
- **WHEN** a reader opens `docs/reference/scenario-recording.md`
- **THEN** the page MUST document that scenario artifacts are written under `recordings/<tenant>/{scenarioName}/`
- **AND** MUST explain that `<tenant>` is derived from connection `baseurl`
- **AND** MUST document External Settings as the canonical capture path
- **AND** MUST document `npm run replay` as the interactive debug replay path
- **AND** MUST document `npm run test-recording` as the headless regression path

#### Scenario: Observability tuning guide documents tenant isolation

- **GIVEN** tenant-scoped log paths are implemented
- **WHEN** a reader opens the connection and observability tuning Use guide
- **THEN** the page MUST describe default external log location as `logs/<tenant>/fusion-{YYYYMMDD}.log` on the proxy server
- **AND** MUST mention `unknown-tenant` fallback when `baseurl` is unavailable

### Requirement: Documentation site SHALL pass lean-ctx placeholder check

The `docs/` tree MUST NOT contain `lean-ctx: omitted` placeholder strings. Running `npm run docs:prepare` MUST exit with code 0, including the `check-lean-ctx-docs.cjs` step.

#### Scenario: Maintainer runs docs prepare

- **GIVEN** documentation changes are complete
- **WHEN** the maintainer runs `npm run docs:prepare`
- **THEN** the command MUST exit successfully
- **AND** `docs/CHANGELOG.md` MUST contain full changelog content without lean-ctx omission markers

### Requirement: Use guides SHALL NOT contain screenshot placeholder labels when assets exist

Pages under `docs/use-guides/` MUST NOT include `**Screenshot placeholder:**` labels or HTML `<!-- PLACEHOLDER: ... -->` comments when a corresponding image exists under `docs/assets/images/`. Guides MUST use standard markdown image syntax only.

#### Scenario: Reader opens a configuration guide with screenshots

- **GIVEN** a Use guide references an image that exists in `docs/assets/images/`
- **WHEN** a reader views the rendered page
- **THEN** the page MUST display the image
- **AND** MUST NOT display placeholder label text above the image

### Requirement: Getting started subsection SHALL provide onboarding path

The MkDocs nav under **Use guides** MUST include a **Getting started** subsection with: Overview, First aggregation, and Which guide do I need? pages. Overview MUST include a Day 1–7 checklist linking to primary configuration guides.

#### Scenario: New reader finds onboarding

- **GIVEN** the documentation site is published
- **WHEN** a reader expands Use guides → Getting started
- **THEN** Overview, First aggregation, and Which guide do I need? MUST be listed
- **AND** Overview MUST link to Configuring sources and scope as the first configuration step

### Requirement: Guide decision tree page SHALL route readers to correct guides

The page `docs/getting-started/which-guide.md` MUST include a decision flow (mermaid or equivalent) mapping deployment goals (Match, Map/Define only, Records, Orphan) to the appropriate Use guide entry points.

#### Scenario: Reader unsure which guide to open

- **GIVEN** the documentation site is published
- **WHEN** a reader opens Which guide do I need?
- **THEN** the page MUST link to Configuring sources and scope, Source types, and Matching identities as appropriate outcomes

### Requirement: Configuration to account-list phase reference SHALL exist

The project MUST publish `docs/reference/config-to-phases.md` mapping Configuration settings areas to account-list phases/steps and searchable log prefixes. The page MUST appear under Technical reference nav.

#### Scenario: Troubleshooter maps config to logs

- **GIVEN** a reader is debugging account-list behavior
- **WHEN** they open the config-to-phases reference
- **THEN** they MUST find at least identity scope, reset accounts, orphan disable, and Match sweep mappings

### Requirement: Match tuning cookbooks guide SHALL document three worked scenarios

The project MUST publish `docs/use-guides/configuration/match-tuning-cookbooks.md` with at least three scenarios: HR+AD dedup (umbrella), username pool (Records/side-car), and contractor orphan cleanup. Each scenario MUST include goal, representative config keys, and dry-run validation step.

#### Scenario: Reader implements HR+AD dedup pattern

- **GIVEN** the cookbooks guide is published
- **WHEN** a reader opens the HR+AD dedup section
- **THEN** the section MUST describe authoritative Fusion, two Authoritative sources, and link to dry-run analysis

### Requirement: Operation pages SHALL embed architecture diagrams from drawio exports

For each operation page that has a corresponding file under `docs/operations/diagrams/*.drawio`, the published page MUST embed an exported PNG from `docs/assets/images/operations/`. `docs/README.md` MUST document how maintainers re-export PNGs when drawio sources change.

#### Scenario: Reader views entitlement list operation

- **GIVEN** `docs/operations/diagrams/entitlementList.drawio` exists
- **WHEN** a reader opens `docs/operations/entitlement-list.md`
- **THEN** the page MUST display the exported architecture diagram PNG

### Requirement: PAT scope recommender script SHALL be documented

The project MUST provide `scripts/recommend-pat-scopes.cjs` and an npm script (for example `pat-scopes:recommend`) that outputs minimal and conditional PAT scope lists from an exported source config JSON file. `docs/reference/pat-scopes.md` MUST document usage.

#### Scenario: Operator derives scopes from config export

- **GIVEN** an exported Fusion source config JSON with Match and delayed aggregation enabled
- **WHEN** the operator runs the PAT scope recommender script
- **THEN** the output MUST include core minimum scopes plus conditional scopes for forms, workflow, and accounts-state as applicable

### Requirement: MkDocs site SHALL enable edit-on-GitHub

`mkdocs.yml` MUST enable Material theme feature `content.action.edit` with `edit_uri` pointing to the repository docs path so readers can propose doc fixes from the published site.

#### Scenario: Reader proposes doc fix from site

- **GIVEN** the site is published with edit links enabled
- **WHEN** a reader clicks edit on a documentation page
- **THEN** they MUST be directed to the corresponding file under `docs/` on GitHub

### Requirement: Configuration reference index SHALL link entitlements

The generated Configuration reference index (`docs/configuration/index.md`) MUST include Entitlement list under Related references, linking to `docs/operations/entitlement-list.md`.

#### Scenario: Reader finds entitlements from Configuration reference

- **GIVEN** docs have been prepared
- **WHEN** a reader opens Configuration reference index
- **THEN** Related references MUST include Entitlement list

---

### Requirement: connector-spec helpKey strings SHALL be concise with Configuration reference links

Each `helpKey` in `connector-spec.json` MUST be at most 220 characters of plain text (HTML tags excluded from the count). Each `helpKey` MUST contain exactly one short summary sentence and MUST include a markdown link to the generated Configuration reference anchor for that field (`configuration/<menu-slug>.md#<field-key>`).

#### Scenario: Operator views a field tooltip in ISC

- **GIVEN** a field has a `helpKey` in `connector-spec.json`
- **WHEN** the operator reads inline help in ISC source configuration
- **THEN** the help text SHALL fit in a brief tooltip without scrolling
- **AND** the help text SHALL link to the Configuration reference page for full field semantics

#### Scenario: Maintainer adds a new configuration field

- **GIVEN** a new field is added to `connector-spec.json` with a `helpKey`
- **WHEN** the maintainer runs `npm run lint`
- **THEN** the help lint check SHALL fail if the `helpKey` exceeds 220 plain-text characters or omits a Configuration reference link

---

### Requirement: connector-spec sectionHelpMessage strings SHALL be concise with guide links

Each `sectionHelpMessage` in `connector-spec.json` MUST be at most 320 characters of plain text (HTML tags excluded). Each `sectionHelpMessage` MUST contain at most two sentences and MUST include a markdown link to the primary Use guide or Technical reference page for that section. Section help MUST NOT contain HTML bullet lists (`<ul>`, `<li>`).

#### Scenario: Operator expands a configuration section in ISC

- **GIVEN** a section has a `sectionHelpMessage` in `connector-spec.json`
- **WHEN** the operator reads the section header help in ISC
- **THEN** the help text SHALL summarize the section purpose in at most two sentences
- **AND** the help text SHALL direct the operator to a Use guide or reference page for detailed walkthroughs

#### Scenario: Attribute Definition sections are slimmed

- **GIVEN** the Normal Attribute Definitions or Unique Attribute Definitions sections in `connector-spec.json`
- **WHEN** an operator reads their `sectionHelpMessage` in ISC
- **THEN** the plain-text length SHALL NOT exceed 320 characters
- **AND** the message SHALL link to [Defining attributes](../use-guides/configuration/defining-attributes.md) and/or [Velocity context reference](../reference/velocity-context.md)
- **AND** detailed Velocity helper documentation SHALL remain available in those reference pages

---

### Requirement: connector-spec inline help SHALL be guarded by an automated lint check

The project MUST provide `scripts/check-connector-spec-help.cjs` that validates all `helpKey` and `sectionHelpMessage` values against the length and link rules above. The check MUST run as part of `npm run lint` or `npm run docs:prepare` and MUST exit non-zero on violation.

#### Scenario: CI rejects verbose inline help

- **GIVEN** a `helpKey` or `sectionHelpMessage` exceeds its character limit or lacks a required link
- **WHEN** the maintainer runs `npm run lint`
- **THEN** the command SHALL exit with a non-zero status
- **AND** the output SHALL identify the offending field key or section title

#### Scenario: Clean connector-spec passes help lint

- **GIVEN** all inline help strings comply with length and link rules
- **WHEN** the maintainer runs `npm run lint`
- **THEN** the connector-spec help check SHALL pass without errors

---

