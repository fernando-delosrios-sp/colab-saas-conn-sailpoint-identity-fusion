## ADDED Requirements

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

## MODIFIED Requirements

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
