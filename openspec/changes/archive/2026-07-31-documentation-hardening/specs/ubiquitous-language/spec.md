## ADDED Requirements

### Requirement: Deployment mode terms SHALL be defined in ubiquitous language

The ubiquitous language spec MUST define **umbrella mode**, **side-car mode**, **sources scope**, and **identity scope** with definitions aligned to Configuring sources and scope guide content. The user-facing glossary MUST mirror these terms.

#### Scenario: Agent introduces umbrella mode in documentation

- **GIVEN** an author writes about authoritative Fusion Match deployments
- **WHEN** they use the term umbrella mode
- **THEN** the term MUST be defined in `openspec/specs/ubiquitous-language/spec.md`
- **AND** MUST appear in `docs/glossary.md`

#### Scenario: Reader distinguishes scope concepts

- **GIVEN** a reader opens the glossary
- **WHEN** they look up sources scope and identity scope
- **THEN** both terms MUST have distinct definitions
- **AND** definitions MUST clarify when identity scope is optional
