## MODIFIED Requirements

### Requirement: This spec is the source of truth for domain vocabulary

`openspec/specs/ubiquitous-language/spec.md` SHALL be the authoritative source for canonical domain terms, definitions, and usage rules. `docs/glossary.md` and all other artifacts SHALL reflect the definitions in this spec.

#### Scenario: Glossary entry conflicts with spec

- **WHEN** a glossary entry uses a different definition or term than this spec
- **THEN** the glossary MUST be updated to match this spec

#### Scenario: Code uses a term not defined in the spec

- **WHEN** a developer introduces a new domain term in code or documentation
- **THEN** the term SHALL be added to this spec before it is used elsewhere

## MODIFIED Requirements

### Requirement: Documentation uses canonical terms

All documentation (`docs/`, `README.md`, inline comments) SHALL use canonical terms consistently. Retired terms (such as `consolidated account`, `raw account`, `pass`, `new-unmatched`, `automatic assignment`, or `link to existing identity` in Match-outcome context) SHALL be replaced with their canonical successors. User-facing glossary content SHALL be published at `docs/glossary.md` and linked from the top-level **Glossary** nav entry.

#### Scenario: Guide documentation

- **WHEN** a guide under `docs/use-guides/` explains a concept or process
- **THEN** the guide SHALL use canonical terms (e.g., "Fusion account", not "consolidated account"; "deferred candidate", not "new-unmatched peer"; "automatic merge", not "automatic assignment")

#### Scenario: Operation documentation

- **WHEN** an operation is documented under `docs/reference/` or `docs/operations/`
- **THEN** the documentation SHALL use canonical terms for inputs, outputs, phases, sweeps, and behavior

#### Scenario: Glossary is reachable from top-level nav

- **GIVEN** the documentation site is published
- **WHEN** a reader opens the Glossary from the top-level nav
- **THEN** the page at `docs/glossary.md` SHALL load
- **AND** the page SHALL state that this spec is the source of truth

## ADDED Requirements

### Requirement: Retired glossary path SHALL redirect or be removed

After restructure, `docs/concepts/glossary.md` MUST be retired in favor of `docs/glossary.md`. Legacy links to the concepts path MUST be updated or redirected.

#### Scenario: Maintainer follows old glossary link

- **GIVEN** a document links to `docs/concepts/glossary.md`
- **WHEN** the restructure is complete
- **THEN** the link SHALL be updated to `docs/glossary.md` or an equivalent redirect stub SHALL exist
