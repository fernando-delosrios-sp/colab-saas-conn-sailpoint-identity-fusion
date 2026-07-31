#### Scenario: Agent generates documentation

- **WHEN** an AI agent generates documentation for recording or replay workflows
- **THEN** it MUST use "scenario" and MUST NOT use "chain" in the recording/replay domain

## ADDED Requirements

### Requirement: Recording scenario terminology SHALL be canonical

The term **scenario** (recording) SHALL refer to a named, tenant-scoped recording directory under `recordings/<tenant>/{scenarioName}/` containing captured operation steps (`steps.ndjson`), ISC API log (`api-log.ndjson`), compiled replay definition (`scenario.json`), and supporting artifacts. The terms **chain**, **chain reference**, and **chain name** SHALL NOT be used in new code, configuration help text, or documentation when referring to recording or replay artifacts.

#### Scenario: Documentation uses scenario for recording artifacts

- **WHEN** documentation describes capturing or replaying recorded operation sequences
- **THEN** the term "scenario" or "scenario reference" (`tenant/scenarioName`) MUST be used
- **AND** the term "chain" MUST NOT be used in the recording/replay domain

#### Scenario: Code review discovers chain terminology in recording domain

- **WHEN** a code review finds `chainName`, `chainRef`, or user-facing "chain" strings in recording/replay modules
- **THEN** the contributor MUST rename to `scenarioName`, `scenarioRef`, or "scenario" unless the identifier is a deprecated compatibility alias
