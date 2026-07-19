# match-service Spec (Delta)

## RENAMED Requirements

FROM: `scoring-service` TO: `match-service`

The service SHALL be referenced as `match-service` in specs, `MatchService` in code, and `src/services/matchService/` on disk. All requirements from the former `scoring-service` spec remain in effect under the new name.

## ADDED Requirements

### Requirement: MatchService dispatches exact match → automatic assignment

When scoring produces an exact match (all evaluated rules score 100, none skipped) and automatic assignment is enabled, MatchService SHALL create a synthetic decision and assign the managed account to the matching identity without creating a review form.

#### Scenario: Exact match triggers automatic assignment
- **GIVEN** automatic assignment is enabled and scoring produces an exact match
- **WHEN** MatchService handles the outcome
- **THEN** a synthetic FusionDecision SHALL be created with automaticAssignment: true
- **AND** the managed account SHALL be linked to the identity
- **AND** no review form SHALL be created

### Requirement: MatchService dispatches identity match → partial match review

When scoring produces identity-candidate matches but no exact match (or automatic assignment is disabled), MatchService SHALL create a review form with the highest-scoring identity candidates.

#### Scenario: Identity match creates review form
- **GIVEN** scoring produces identity-candidate matches with combined scores above threshold
- **WHEN** MatchService handles the outcome
- **THEN** a review form SHALL be created via FormService
- **AND** the form SHALL include the top candidates up to maxCandidatesForForm
- **AND** the FusionAccount's identity references SHALL be cleared after form creation

### Requirement: MatchService dispatches non-match per source type

When no identity candidates meet the threshold, MatchService SHALL apply source-type-specific policies: authoritative accounts produce new Fusion accounts, record accounts register unique attributes only, orphan accounts may be disabled.

#### Scenario: Authoritative non-match creates new Fusion account
- **GIVEN** an authoritative managed account with no matches
- **WHEN** MatchService handles the outcome
- **THEN** a new Fusion account SHALL be created and registered in FusionRun

#### Scenario: Record non-match registers unique attributes
- **GIVEN** a record-source managed account with no matches
- **WHEN** MatchService handles the outcome
- **THEN** unique attributes SHALL be registered via DefineService
- **AND** no Fusion account SHALL be created

### Requirement: MatchService handles deferred candidate matching

When scoring produces only deferred-candidate matches, MatchService SHALL defer identity creation until the next aggregation run by not producing a new Fusion account.

#### Scenario: Deferred match skips account
- **GIVEN** a managed account with only deferred-candidate matches
- **WHEN** MatchService handles the outcome
- **THEN** the account SHALL be removed from the work queue
- **AND** no Fusion account SHALL be created for this run

### Requirement: MatchService owns the two-sweep matching runner

MatchService SHALL instantiate and orchestrate ManagedAccountMatchingRunner for the two-sweep matching lifecycle (identity scoring sweep → deferred scoring sweep).

#### Scenario: Runner executes identity scoring sweep
- **WHEN** MatchService processes uncorrelated managed accounts
- **THEN** ManagedAccountMatchingRunner SHALL execute identity-phase scoring for all accounts
- **AND** results SHALL be classified as identity-match, deferred-pending, or non-match

#### Scenario: Runner executes deferred scoring sweep
- **WHEN** the identity sweep completes with pending deferred candidates
- **THEN** ManagedAccountMatchingRunner SHALL execute deferred-phase scoring for pending accounts
- **AND** results SHALL be classified as deferred-match or non-match

### Requirement: MatchService owns the CandidateRegistry

MatchService SHALL create and manage the CandidateRegistry for per-source deferred candidate tracking across analysis sweeps.

#### Scenario: Candidates registered during identity sweep
- **WHEN** an authoritative account from a deferred-enabled source has no identity match
- **THEN** the account's managed key SHALL be registered in CandidateRegistry for its source
- **AND** it SHALL be available for deferred-phase scoring

### Requirement: MatchService exposes scoring algorithms

MatchService SHALL expose the same scoring algorithms as the former ScoringService: binary, jaro-winkler, dice, double-metaphone, lig3, name-matcher, custom-velocity. All algorithm contracts from the former scoring-service spec remain in effect.

#### Scenario: Binary algorithm returns 100 for exact match
- **WHEN** binary algorithm compares "abc123" and "abc123"
- **THEN** score is 100 and isMatch is true

### Requirement: MatchService builds and queries trigram blocking index

MatchService SHALL build a trigram blocking index over fusion identities for mandatory matching attributes. The index SHALL be queried to pre-filter identity candidates before running full similarity scoring.

#### Scenario: Trigram index pre-filters candidates
- **WHEN** buildTrigramIndex is called with a set of fusion identities
- **THEN** per-attribute inverted trigram maps SHALL be built for each mandatory matching attribute
- **AND** getCandidates SHALL return only identities sharing at least one trigram with the account's attribute values

### Requirement: MatchService receives FusionRun for state access

MatchService SHALL receive FusionRun at construction time and read/write all shared state through it. MatchService SHALL NOT hold internal mutable state beyond configuration and caches.

#### Scenario: MatchService reads fusion identities from FusionRun
- **WHEN** MatchService needs the set of existing fusion identities
- **THEN** it SHALL read from run.fusionIdentityMap, not from a service-local cache

#### Scenario: MatchService writes match outcomes to FusionRun
- **WHEN** MatchService creates a new Fusion account from a non-match
- **THEN** the account SHALL be written to run.fusionAccountMap
- **AND** autoAssigned identity IDs SHALL be written to run.autoAssignedIdentityIds
