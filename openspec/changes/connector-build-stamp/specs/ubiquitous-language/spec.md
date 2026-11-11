## ADDED Requirements

### Requirement: Glossary defines Connector build stamp

The ubiquitous-language glossary SHALL define **Connector build stamp** as the identifier of the exact tree a connector package was built from: short commit SHA, commit date, and branch, with a `-dirty` suffix when non-ignored working-tree changes existed at pack time. It SHALL appear in the Configuration vocabulary table of `openspec/specs/ubiquitous-language/spec.md` and in `docs/glossary.md`.

#### Scenario: Glossary entry for Connector build stamp

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up how to identify the build a tenant runs
- **THEN** it SHALL contain a **Connector build stamp** entry
- **AND** the entry SHALL define the short commit SHA, commit date, and branch
- **AND** the entry SHALL state that `-dirty` marks a package built from uncommitted changes
- **AND** the entry SHALL state that it is not the **Installed connector version**

#### Scenario: Documentation naming

- **GIVEN** documentation or help copy tells an operator which package is deployed
- **WHEN** the copy names the commit-level identity
- **THEN** it SHALL call it a **Connector build stamp**
- **AND** it SHALL NOT call it a build number, CI build id, or version

---

## MODIFIED Requirements

### Requirement: Glossary defines Installed connector version

The ubiquitous-language glossary SHALL define **Installed connector version** as the semver string in `package.json` `version` for the connector package operators have installed in ISC. It SHALL NOT mean a git SHA, CI build number, or Identity Security Cloud platform version. The glossary SHALL state that it is a release label and not build identity, so telling whether a tenant runs a current build uses the **Connector build stamp** instead. Documentation and help copy that tell operators which package is deployed SHALL use this term.

#### Scenario: Glossary entry for Installed connector version

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Installed connector version** entry
- **AND** the entry SHALL identify `package.json` `version` as the source
- **AND** the entry SHALL exclude git SHA, CI build number, and ISC platform version

#### Scenario: Installed connector version is a release label

- **GIVEN** two packages built from different commits under the same `package.json` `version`
- **WHEN** an operator consults the glossary entry for **Installed connector version**
- **THEN** the entry SHALL state that it is a release label
- **AND** SHALL direct build comparison to the **Connector build stamp**

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

_(none)_
