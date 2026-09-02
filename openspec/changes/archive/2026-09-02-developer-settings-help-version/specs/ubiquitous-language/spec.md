## ADDED Requirements

### Requirement: Glossary defines Installed connector version

The ubiquitous-language glossary SHALL define **Installed connector version** as the semver string in `package.json` `version` for the connector package operators have installed in ISC. It SHALL NOT mean a git SHA, CI build number, or Identity Security Cloud platform version. Documentation and help copy that tell operators which package is deployed SHALL use this term.

#### Scenario: Glossary entry for Installed connector version

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Installed connector version** entry
- **AND** the entry SHALL identify `package.json` `version` as the source
- **AND** the entry SHALL exclude git SHA, CI build number, and ISC platform version

---

## MODIFIED Requirements

_(none)_

---

## REMOVED Requirements

_(none)_

---

## RENAMED Requirements

_(none)_
