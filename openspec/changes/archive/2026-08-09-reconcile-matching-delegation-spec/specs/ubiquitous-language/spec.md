## MODIFIED Requirements

### Requirement: Type naming follows ubiquitous language

Production code, configuration keys, and spec identifiers SHALL use canonical terms from this document. When a retired term appears in legacy code or docs, new work SHALL migrate toward the canonical term without breaking existing wire contracts.

#### Scenario: Function naming follows ubiquitous language

- **WHEN** a developer names a function for match scoring or deferred handling
- **THEN** the function name SHALL use canonical terms (e.g., `scoreIdentityCandidates`, not `analyzeIdentityPhase`; `hasDeferredCandidateMatches`, not `hasNewUnmatchedPeerMatches`)

#### Scenario: Type naming follows ubiquitous language (updated)

- **WHEN** a developer defines a type, enum, or class for match outcomes
- **THEN** the type SHALL reference `MatchingService` for scoring concerns, not `ScoringService`
- **WHEN** a developer defines a type, enum, or class for match sweep orchestration or outcome dispatch
- **THEN** the type name SHALL use `MatchOutcomeDispatcher`, not `ManagedAccountMatchingRunner` or `ManagedAccountPassRunner`

---

## ADDED Requirements

### Requirement: Match sweep orchestration term is MatchOutcomeDispatcher

The canonical implementation type for managed-account match sweep orchestration and outcome dispatch SHALL be `MatchOutcomeDispatcher`. Documentation and specs SHALL refer to **Match outcome dispatch** and the two-sweep lifecycle (identity scoring sweep → deferred drain) in terms of `MatchOutcomeDispatcher.runMatchSweep`, not `ManagedAccountMatchingRunner`.

#### Scenario: Specs reference MatchOutcomeDispatcher for sweeps

- **WHEN** a living spec describes who orchestrates the two-sweep match lifecycle
- **THEN** it SHALL name `MatchOutcomeDispatcher` as the orchestrator
- **AND** it SHALL NOT require `ManagedAccountMatchingRunner` as an active type

#### Scenario: Correlated account sweep is distinct from two-sweep lifecycle

- **WHEN** documentation describes the correlated account sweep
- **THEN** it SHALL treat that sweep as a FusionService pipeline pre-pass
- **AND** it SHALL NOT conflate the correlated account sweep with the identity-scoring or deferred-drain sweeps inside `MatchOutcomeDispatcher`

---

## MODIFIED Requirements (Retired Terms)

The following entry in the Retired Terms table SHALL be updated when this delta is merged:

- **From:** `ManagedAccountPassRunner` → `ManagedAccountMatchingRunner`
- **To:** `ManagedAccountPassRunner` → `MatchOutcomeDispatcher`; `ManagedAccountMatchingRunner` → `MatchOutcomeDispatcher` (both retired intermediate names)

#### Scenario: ManagedAccountMatchingRunner is not used in new specs

- **WHEN** an author writes a new requirement for match sweep orchestration
- **THEN** they SHALL NOT use `ManagedAccountMatchingRunner` as the normative type name
- **AND** they SHALL use `MatchOutcomeDispatcher` or the **Match outcome dispatch** domain term
