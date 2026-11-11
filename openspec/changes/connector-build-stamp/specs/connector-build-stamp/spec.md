## ADDED Requirements

### Requirement: Packaged connector spec SHALL carry a connector build stamp

A connector package produced by `npm run pack-zip` SHALL contain a **connector build stamp** in the Developer Settings `sectionHelpMessage`, placed after the installed connector version sentence. The stamp SHALL be plain text in the form `Build: <sha7> <YYYY-MM-DD> <branch>`, with the short commit SHA rendered in bold HTML alongside the surrounding help markup.

#### Scenario: Operator reads a freshly packed source

- **GIVEN** a connector package packed from commit `def5678` on branch `2.2.0/preview` with no uncommitted source changes
- **WHEN** an operator expands Developer Settings in the ISC source configuration
- **THEN** the section help SHALL show the installed connector version
- **AND** SHALL show `Build: def5678 2026-11-11 2.2.0/preview` as visible text
- **AND** `sectionTitle` SHALL remain `Developer Settings`

#### Scenario: Two packages from the same commit read the same

- **GIVEN** two connector packages packed from the same commit on the same branch, both from a clean tree
- **WHEN** an operator compares their Developer Settings section help
- **THEN** both SHALL show the same connector build stamp
- **AND** the installed connector version SHALL be identical in both

### Requirement: Connector build stamp SHALL identify the packed tree

The connector build stamp SHALL use the short commit SHA of `HEAD`, the commit date in `YYYY-MM-DD`, and the branch name, so that it identifies the tree rather than the moment of packing. The SHA SHALL take a `-dirty` suffix when non-ignored working-tree changes other than `connector-spec.json` existed at pack time.

#### Scenario: Packing from a dirty tree is marked

- **GIVEN** an uncommitted change to a source file that the connector bundle includes
- **WHEN** a maintainer runs `npm run pack-zip`
- **THEN** the connector build stamp SHALL carry `-dirty` on the short commit SHA

#### Scenario: Dirty detection excludes the generated and stamped spec

- **GIVEN** a clean working tree before packing
- **AND** `prebuild` rewrites `connector-spec.json`
- **WHEN** a maintainer runs `npm run pack-zip`
- **THEN** the connector build stamp SHALL NOT carry `-dirty`

#### Scenario: Commit date is used rather than pack time

- **GIVEN** a commit dated `2026-11-01` checked out on `2026-11-11`
- **WHEN** a maintainer runs `npm run pack-zip`
- **THEN** the connector build stamp SHALL contain `2026-11-01`
- **AND** SHALL NOT contain the pack date

### Requirement: Packaging SHALL restore the committed connector spec

`npm run pack-zip` SHALL write the stamped `connector-spec.json` only for the duration of the package command and SHALL restore the original file contents afterwards, whether the package command succeeds or fails. The committed `connector-spec.json` SHALL NOT contain a connector build stamp.

#### Scenario: Successful pack leaves the tree clean

- **GIVEN** a clean working tree
- **WHEN** a maintainer runs `npm run pack-zip` and the package command succeeds
- **THEN** `git status --porcelain` SHALL report no change for `connector-spec.json`
- **AND** the produced zip SHALL contain the connector build stamp

#### Scenario: Failed pack leaves the tree clean

- **GIVEN** a clean working tree
- **WHEN** the package command exits non-zero
- **THEN** `connector-spec.json` SHALL be restored to its pre-pack contents
- **AND** the wrapper SHALL exit non-zero

#### Scenario: Stamping an already stamped spec does not duplicate the line

- **GIVEN** a `connector-spec.json` whose Developer Settings help already contains a connector build stamp
- **WHEN** the stamp step runs again
- **THEN** the resulting help SHALL contain exactly one `Build:` sentence
- **AND** it SHALL show the newly resolved stamp

### Requirement: Build stamp SHALL be printable without packaging

The project SHALL provide `npm run build:stamp`, which prints the connector build stamp that the current checkout would pack, without building, stamping, or packaging.

#### Scenario: Maintainer compares the checkout with a tenant

- **GIVEN** the maintainer has `2.2.0/preview` checked out at commit `def5678`
- **WHEN** the maintainer runs `npm run build:stamp`
- **THEN** the command SHALL print `Build: def5678 2026-11-11 2.2.0/preview`
- **AND** SHALL leave `connector-spec.json` and `dist/` unchanged

### Requirement: Unavailable git facts SHALL NOT block packaging

When the repository state cannot be resolved, the connector build stamp SHALL read `Build: unknown` and packaging SHALL proceed.

#### Scenario: Packing outside a git checkout

- **GIVEN** a source tree with no git metadata available
- **WHEN** a maintainer runs `npm run pack-zip`
- **THEN** the package SHALL be produced
- **AND** its Developer Settings help SHALL show `Build: unknown`

### Requirement: Stamped Developer Settings help SHALL pass inline help limits

The connector build stamp SHALL keep the packaged Developer Settings `sectionHelpMessage` within the inline help length and sentence limits enforced by `scripts/check-connector-spec-help.cjs`.

#### Scenario: Stamped spec is validated

- **GIVEN** a `connector-spec.json` carrying a connector build stamp
- **WHEN** the inline help validation runs against it
- **THEN** it SHALL report no violation for Developer Settings
