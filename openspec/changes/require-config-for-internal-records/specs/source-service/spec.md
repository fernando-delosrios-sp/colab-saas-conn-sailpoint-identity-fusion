## MODIFIED Requirements

### Requirement: Source service SHALL resolve configured Internal Record sources from the customizer package

SourceService SHALL resolve an Internal Record source from the customizer package ONLY when Source Settings contains an enabled source with `sourceType` set to `record` and `internal` toggled on whose `name` matches an entry in the packaged Internal Record configuration. SourceService SHALL NOT look up that source in Identity Security Cloud and SHALL NOT require an Identity Security Cloud source ID for it. Packaged Internal Record configuration entries without a matching enabled `Record` source with `internal` toggled on SHALL be ignored and SHALL NOT be accounted for. When an enabled `Record` source with `internal` toggled on has no customizer package directory, no matching `sourceName` in the packaged Internal Record configuration, or no matching file in the packaged manifest, setup SHALL fail before Fetch and name that source or file. Configured sources with `internal` off or omitted SHALL keep Identity Security Cloud discovery and fetch behavior unchanged.

#### Scenario: Named packaged dump becomes an Internal Record source

- **REMOVED** — superseded by **Packaged configuration becomes an Internal Record source**. Discovery reads the saved configuration, not a Source Settings file field.

#### Scenario: Configured internal file is absent

- **REMOVED** — superseded by **Packaged file is absent from the manifest**. Setup names the file missing from the packaged manifest.

#### Scenario: Packaged configuration becomes an Internal Record source

- **GIVEN** Source Settings contains an enabled source named `Sample Records` with `sourceType` `record` and `internal` `true`
- **AND** the attached customizer contains a saved entry for `Sample Records.csv` named `Sample Records` in its Internal Record configuration and manifest
- **WHEN** source discovery completes
- **THEN** `Sample Records` SHALL be resolved with `Record` type and internal provenance
- **AND** SourceService SHALL NOT look up `Sample Records` in Identity Security Cloud or call Identity Security Cloud account listing for it

#### Scenario: Unconfigured or disabled packaged dump is ignored

- **GIVEN** the attached customizer contains a saved entry for `Sample Records.csv` named `Sample Records`
- **AND** Source Settings either has no source named `Sample Records`, has `Sample Records` disabled, or has `internal` `false`
- **WHEN** source discovery completes
- **THEN** `Sample Records` SHALL NOT be accounted for as an Internal Record source
- **AND** its accounts SHALL NOT be loaded or registered

#### Scenario: Configured internal Record source missing from customizer package fails setup

- **GIVEN** Source Settings contains an enabled source named `Sample Records` with `sourceType` `record` and `internal` `true`
- **AND** either no customizer Internal Record directory is present or the packaged Internal Record configuration has no entry named `Sample Records`
- **WHEN** setup validates sources
- **THEN** setup SHALL fail before Fetch
- **AND** the error SHALL name `Sample Records`

#### Scenario: Packaged file is absent from the manifest

- **GIVEN** Source Settings contains an enabled source named `Sample Records` with `sourceType` `record` and `internal` `true`
- **AND** the packaged Internal Record configuration names `Sample Records.csv` for `Sample Records`
- **AND** the attached manifest does not contain that file
- **WHEN** setup validates sources
- **THEN** setup SHALL fail before Fetch
- **AND** the error SHALL name `Sample Records.csv`

### Requirement: Internal Record sources SHALL use existing Record-source processing controls

Internal Record sources SHALL honor `includeRecordAccountsForMatching` and other Record-source settings configured on the matching source entry in Source Settings. When `includeRecordAccountsForMatching` is enabled (or omitted, defaulting to true), they SHALL enter Map, Define, and Match processing. When it is disabled, they SHALL use selective Map and unique-attribute registration without Match scoring. In either case they SHALL NOT create a Fusion account solely because they are unmatched.

#### Scenario: Internal record enters Match by default

- **REMOVED** — superseded by **Source Settings Match flag scores the record**. Match follows the flag in Source Settings.

#### Scenario: Internal record skips Match when configured

- **REMOVED** — superseded by **Source Settings Match flag skips scoring**. Skipping Match is configured in Source Settings.

#### Scenario: Saved Match flag scores the record

- **REMOVED** — superseded by **Source Settings Match flag scores the record**. Match is configured in Source Settings, not in the customizer.

#### Scenario: Saved Match flag skips scoring

- **REMOVED** — superseded by **Source Settings Match flag skips scoring**. Match is configured in Source Settings, not in the customizer.

#### Scenario: Source Settings Match flag scores the record

- **GIVEN** an enabled Internal Record source in Source Settings with `includeRecordAccountsForMatching` enabled (or omitted)
- **WHEN** its record is processed
- **THEN** it SHALL follow the existing Record source Match path
- **AND** an unmatched record SHALL NOT create a Fusion account

#### Scenario: Source Settings Match flag skips scoring

- **GIVEN** an enabled Internal Record source in Source Settings with `includeRecordAccountsForMatching` disabled
- **WHEN** its record is processed
- **THEN** it SHALL register mapped unique attributes without Match scoring
- **AND** it SHALL be released from the work queue after registration

---

## REMOVED Requirements

### Requirement: Source service SHALL reject an Internal Record source name that matches a configured source

**Reason**: Internal Record sources now require a matching enabled `Record` source with `internal: true` in Source Settings rather than forbidding configured sources with the same name.

**Migration**: Add each active Internal Record source to Source Settings with `Source type: Records`, `Internal: On`, and the desired `Include record accounts in Match` setting.
