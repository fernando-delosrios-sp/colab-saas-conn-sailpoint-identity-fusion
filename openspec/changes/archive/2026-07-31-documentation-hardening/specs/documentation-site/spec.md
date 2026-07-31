## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: MkDocs site SHALL expose six top-level navigation sections

The published MkDocs site (`mkdocs.yml`) MUST define exactly these top-level nav entries: **Home**, **Use guides**, **Configuration**, **Glossary**, and **Technical reference**. Getting started content MUST appear as a subsection under **Use guides**, not as a separate top-level section.

#### Scenario: Reader opens the documentation site nav

- **GIVEN** the MkDocs site is built with `npm run docs:prepare && mkdocs build`
- **WHEN** a reader views the site navigation
- **THEN** Home, Use guides, Configuration, Glossary, and Technical reference SHALL be present as top-level entries
- **AND** Getting started SHALL appear under Use guides
- **AND** there SHALL NOT be a standalone **Concepts** top-level section

### Requirement: Getting started Overview SHALL embed operation modes

The Getting started Overview page MUST embed authoritative, records, and orphan operation mode explanations and umbrella vs side-car deployment patterns. Operation modes MUST link to the Source types guide for full detail.

#### Scenario: Reader prepares first configuration

- **GIVEN** the documentation site is published
- **WHEN** a reader opens Getting started → Overview
- **THEN** the page SHALL explain umbrella and side-car deployment modes
- **AND** SHALL link to Source types for Authoritative, Records, and Orphan behavior

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
