## MODIFIED Requirements

### Requirement: MatchOutcomeDispatcher applies the four Match outcomes

`MatchOutcomeDispatcher` SHALL route each scored account to exactly one of the four outcomes: exact match (automatic merge), partial match (review form), deferred match (claim for later), or non-match (register as new Fusion account). It SHALL apply the domain action associated with each outcome.

#### Scenario: Exact match triggers automatic assignment
- **WHEN** a managed account scores above the automatic merge threshold with all mandatory rules passing
- **THEN** `MatchOutcomeDispatcher` SHALL mark the identity auto-merged, register a synthetic FusionDecision with `automaticMerge: true` via `FormService`, and apply the decision

#### Scenario: Partial match triggers a review form
- **WHEN** a managed account scores above the manual review threshold but below automatic merge
- **THEN** `MatchOutcomeDispatcher` SHALL create a Fusion review form via `FormService` with merge-with-existing-identity and create-new-identity options and clear the candidate references

#### Scenario: Deferred match defers identity creation
- **WHEN** the best candidate for a managed account is a deferred candidate from the same source
- **THEN** `MatchOutcomeDispatcher` SHALL claim the managed account for later comparison and log the deferred matches

#### Scenario: Non-match registers a new Fusion account
- **WHEN** a managed account has no acceptable identity or deferred candidates
- **THEN** `MatchOutcomeDispatcher` SHALL register the provisional Fusion account in `FusionRun` and, for authoritative sources, register it as a deferred candidate if deferred matching is enabled
