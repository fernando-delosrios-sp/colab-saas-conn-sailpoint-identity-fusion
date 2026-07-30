## ADDED Requirements

### Requirement: Recording artifact documentation SHALL describe matching results

Project documentation for chain recording SHALL describe `reports/matching-results.json`: when it is written, what fields it contains (identity matches, deferred matches with scores, non-matches, failures, sweep summary), and how it relates to other artifacts (`api-log.ndjson`, `steps.ndjson`, `reports/aggregation.json`).

#### Scenario: README documents matching results artifact
- **WHEN** a developer reads the chain recording section of README.md
- **THEN** the artifact table SHALL include `reports/matching-results.json` with purpose and field overview

#### Scenario: Testing guide documents artifact layout
- **WHEN** a developer reads `docs/guides/testing-process.md`
- **THEN** the guide SHALL explain capture timing (account-list end in record mode) and how tests may load matching results from a recording directory
