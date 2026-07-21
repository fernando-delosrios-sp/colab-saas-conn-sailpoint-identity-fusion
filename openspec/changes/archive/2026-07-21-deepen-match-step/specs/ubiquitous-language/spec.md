## ADDED Requirements

### Requirement: Match outcome dispatch is defined in the ubiquitous language

The ubiquitous-language spec SHALL define **Match outcome dispatch** as the routing of a scored managed source account to one of four outcomes (exact match, partial match, deferred match, or non-match) and the application of the resulting action, including automatic assignment, review-form creation, deferred claim, or non-match registration.

#### Scenario: Code uses the canonical term
- **WHEN** a developer refers to the routing and application of Match outcomes
- **THEN** the term "Match outcome dispatch" SHALL be used, and the implementation SHALL reside in `MatchOutcomeDispatcher` within `src/services/matchingService/`

#### Scenario: Architecture reviews use the canonical term
- **WHEN** an architecture review discusses scoring, resolution, and outcome application
- **THEN** it SHALL distinguish between **MatchingService** (scoring engine), **Match** (the product step), and **Match outcome dispatch** (the routing and application of outcomes)

---

### Requirement: MatchingService owns the Match step

The ubiquitous-language spec SHALL state that `MatchingService` is responsible for the **Match** step, including scoring and match outcome dispatch. The `FusionService` orchestrates the operation run but SHALL NOT own the Match step's resolution logic.

#### Scenario: Service ownership is documented
- **WHEN** the spec describes the Match step
- **THEN** it SHALL attribute scoring and match outcome dispatch to `MatchingService`
- **AND** it SHALL attribute operation-run orchestration to `FusionService`

#### Scenario: Code ownership follows the spec
- **WHEN** new Match-outcome behavior is added
- **THEN** it SHALL be added to `src/services/matchingService/` rather than `src/services/fusionService/`
