## ADDED Requirements

### Requirement: FusionRun tracks identity comparison count

FusionRun SHALL expose a run-scoped numeric field `identityComparisonCount` initialized to zero at run start. MatchingService SHALL add each identity-phase `compareFusionAccounts` invocation to this field. Deferred comparisons SHALL NOT increment it.

#### Scenario: Counter starts at zero

- **WHEN** a new FusionRun is constructed for an operation
- **THEN** `identityComparisonCount` SHALL be `0`

#### Scenario: Identity comparisons accumulate

- **GIVEN** an uncorrelated authoritative account whose identity pool contains 10 identities
- **WHEN** identity-phase scoring compares all 10
- **THEN** `identityComparisonCount` SHALL increase by 10

### Requirement: FusionRun tracks identity candidate-set size sum

FusionRun SHALL expose a run-scoped numeric field `identityCandidateSetSizeSum` initialized to zero at run start. For each managed account that enters identity-phase scoring, MatchingService or MatchOutcomeDispatcher SHALL add the size of the identity pool actually scored: `|getCandidates set|` when a Set is returned (including 0 for an empty set), or the Fusion identity baseline size when `getCandidates` returns undefined.

#### Scenario: Counter starts at zero

- **WHEN** a new FusionRun is constructed for an operation
- **THEN** `identityCandidateSetSizeSum` SHALL be `0`

#### Scenario: Full-scan account adds baseline size

- **GIVEN** `getCandidates` returns undefined
- **AND** the Fusion identity baseline contains 100 identities
- **WHEN** identity-phase scoring runs for that account
- **THEN** `identityCandidateSetSizeSum` SHALL increase by 100

#### Scenario: Empty candidate set adds zero

- **GIVEN** `getCandidates` returns an empty Set
- **WHEN** identity-phase scoring runs for that account
- **THEN** `identityCandidateSetSizeSum` SHALL remain unchanged for that account

---

## MODIFIED Requirements

### Requirement: FusionRun holds all run-scoped data

FusionRun SHALL contain maps, sets, and state fields for all data loaded and processed during an operation run: managed accounts, identities, Fusion accounts, Fusion identities, source information, form decisions, form counters, form delete queue, matching state, aggregation tracker, candidate blocking indexes, normalization caches, managed account processing state machine, analysis recording, and timing metrics.

#### Scenario: FusionRun contains managed account state
- **WHEN** aggregation loads managed accounts
- **THEN** run.managedAccountsById SHALL contain all loaded managed accounts initially
- **AND** run.managedAccountsByIdentityId SHALL contain identity-grouped accounts
- **AND** run.managedAccountInventory SHALL contain lightweight metadata for every loaded key (populated by `setManagedAccount`)

#### Scenario: FusionRun contains fusion processing state
- **WHEN** fusion accounts are processed
- **THEN** run.fusionAccountMap SHALL contain all fusion accounts
- **AND** run.fusionIdentityMap SHALL contain identity-linked fusion accounts
- **AND** run.autoMergedIdentityIds SHALL track automatically merged identities
- **AND** run.sourcesByName SHALL map managed source names to SourceInfo
- **AND** run.currentRunNonMatchedKeysBySource SHALL track non-matched account keys per source

#### Scenario: FusionRun contains matching state
- **WHEN** matching sweeps run
- **THEN** run.linkedAccountKeyIndex SHALL contain correlated account keys
- **AND** run.analysisRecorder SHALL capture per-account analysis results
- **AND** run.fusionBlends SHALL track blending events
- **AND** run.trigramIndexByAttribute SHALL contain per-attribute inverted trigram maps when those maps are still built
- **AND** FusionRun SHALL hold Binary exact-value and LIG3 length-bucket blocking indexes when those algorithms are configured
- **AND** run.identityComparisonCount and run.identityCandidateSetSizeSum SHALL accumulate identity-phase observability
- **AND** run.normalizedCache and run.nameNormalizedCache SHALL contain normalization caches

#### Scenario: FusionRun contains form lifecycle state
- **WHEN** form processing runs
- **THEN** run.formsCreated, run.formInstancesCreated, run.formsFound, run.formInstancesFound, and run.answeredFormInstancesProcessed SHALL track form processing counters
- **AND** run.formsToDelete, run.formDeleteQueue, run.queuedFormDeleteIds, run.pendingFormDeleteTasks, and run.activeFormDeleteWorkers SHALL track the form deletion lifecycle

#### Scenario: FusionRun contains aggregation tracker state
- **WHEN** aggregation runs
- **THEN** run.getTracker() SHALL return the active AggregationTracker
- **AND** run.setTracker(tracker) SHALL set the tracker for the current run

#### Scenario: FusionRun contains managed account processing phase state
- **WHEN** managed account processing is initialized
- **THEN** run.managedAccountProcessingState SHALL reflect the current state (`idle` or `initialized`)
- **AND** run.managedAccountProcessingStartedAt SHALL record the start timestamp
- **AND** run.managedAccountProcessingBatchSize SHALL record the batch size

### Requirement: FusionRun tracks full-scan trigram fallback count

FusionRun SHALL expose a run-scoped numeric field `fullScanFallbackCount` initialized to zero at run start. MatchingService SHALL increment this field when getCandidates returns undefined because no recall-safe candidate blocker applies (index not built, or no mandatory rule with a proven blocker can filter), not when returning an empty set for mandatory-missing accounts.

#### Scenario: Counter starts at zero
- **WHEN** a new FusionRun is constructed for an operation
- **THEN** `fullScanFallbackCount` SHALL be `0`

#### Scenario: Counter accumulates across multiple accounts
- **GIVEN** two managed accounts each triggering full-scan fallback because candidate blocking was unavailable in the same run
- **WHEN** both are processed through `getCandidates`
- **THEN** `fullScanFallbackCount` SHALL equal `2`

#### Scenario: Undefined getCandidates increments the counter
- **GIVEN** matching configuration whose mandatory rules have no recall-safe blocker (for example only Jaro-Winkler)
- **WHEN** getCandidates is called for an account that has values for those attributes
- **THEN** getCandidates SHALL return undefined
- **AND** `fullScanFallbackCount` SHALL increment by one
