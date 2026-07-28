## ADDED Requirements

### Requirement: Glossary defines deferred drain and anchor deferred candidate

The ubiquitous-language glossary SHALL define **Deferred drain** and **Anchor deferred candidate** as canonical terms for the sequential deferred-matching resolution phase and the non-match Fusion accounts that seed the deferred candidate pool.

#### Scenario: Deferred drain entry in glossary
- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up how pending managed accounts are resolved after identity scoring
- **THEN** a **Deferred drain** entry SHALL define it as the sequential per-source phase that scores each deferred-pending account against the current candidate pool and dispatches a deferred-match or non-match outcome before advancing to the next account

#### Scenario: Anchor deferred candidate entry in glossary
- **GIVEN** a reader consults the glossary
- **WHEN** they look up Fusion accounts that unblock deferred matching for later accounts in the same sweep
- **THEN** an **Anchor deferred candidate** entry SHALL define it as a persisted or materialized non-match Fusion account registered in the deferred candidate pool so subsequent pending accounts from the same source can defer against it

## Canonical Terms (delta — Matching nuances section)

Add glossary table rows when this change is archived:

| Term | Definition |
|------|------------|
| **Deferred drain** | The sequential per-source phase after identity scoring that evaluates each deferred-pending managed account one at a time against the current deferred candidate pool (persisted anchors plus materialized non-match anchors from earlier steps in the same drain), dispatching deferred-match or non-match outcomes before the next account is scored. |
| **Anchor deferred candidate** | A persisted fusion account from a prior run or a non-match Fusion account materialized during the current deferred drain, registered in the CandidateRegistry so later pending accounts from the same source can match and defer against it. |
