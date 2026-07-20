## MODIFIED Requirements

### Requirement: FusionRun is not a service

FusionRun (`src/model/fusionRun.ts`) SHALL be the centralized state container for a single operation run. It MUST hold all mutable data loaded during the run and serve as the single source of truth that stateless services read from and write to. It SHALL be a domain object with encapsulated collection-management methods and state-integrity validation — it MUST NOT be a service orchestrator.

#### Scenario: FusionRun encapsulates collection mutations
- **WHEN** any external code needs to modify FusionRun's internal collections
- **THEN** it SHALL use domain methods (e.g., registerFusionAccount, addIdentity, markAutoAssigned) rather than directly mutating Maps, Sets, or Arrays
- **AND** FusionRun SHALL own the knowledge of its internal storage topology

#### Scenario: FusionRun may use LogService for validation
- **WHEN** a collection-management method detects a state-integrity violation (e.g., conflicting identity registration)
- **THEN** FusionRun SHALL log a warning via LogService
- **AND** it SHALL NOT trigger side effects in other services or initiate API calls

#### Scenario: FusionRun does not orchestrate services
- **WHEN** a FusionRun method is called
- **THEN** it SHALL NOT call methods on IdentityService, FormService, MatchService, or other services
- **AND** it SHALL NOT modify external system state

## ADDED Requirements

### Requirement: FusionRun encapsulates collection management

FusionRun SHALL expose domain methods for all collection mutations. External code SHALL NOT directly mutate FusionRun's internal Maps, Sets, or Arrays. FusionRun SHALL own the knowledge of its internal storage topology.

#### Scenario: Registering a fusion account
- **WHEN** a processor needs to register a FusionAccount
- **THEN** it SHALL call run.registerFusionAccount(fa) rather than directly setting run.fusionAccountMap or run.fusionIdentityMap
- **AND** FusionRun SHALL determine the correct internal map based on the account's identityId and type

#### Scenario: Removing a fusion account
- **WHEN** a processor needs to remove a FusionAccount
- **THEN** it SHALL call run.removeFusionAccount(fa) rather than directly deleting from internal maps
- **AND** FusionRun SHALL locate and remove the account from whichever internal collection holds it

#### Scenario: Finding a fusion account for an identity
- **WHEN** a processor needs to check if an existing FusionAccount matches a newly-observed identity
- **THEN** it SHALL call run.findFusionAccountForIdentity(identity, sourceNames) rather than iterating internal maps directly
- **AND** FusionRun SHALL search both correlated and uncorrelated accounts internally

### Requirement: FusionRun encapsulates identity cache operations

FusionRun SHALL expose methods for identity cache mutations: addIdentity, removeIdentity, clearIdentities, getIdentity, and hasIdentity. External code SHALL NOT directly mutate the identityMap.

#### Scenario: Adding an identity to the cache
- **WHEN** IdentityService fetches identities
- **THEN** it SHALL call run.addIdentity(id, document) rather than run.identityMap.set(id, document)

#### Scenario: Clearing the identity cache
- **WHEN** the identity cache needs to be reset
- **THEN** the caller SHALL call run.clearIdentities() rather than run.identityMap.clear()

### Requirement: FusionRun encapsulates scoring state

FusionRun SHALL expose methods for scoring state mutations: markAutoAssigned, isAutoAssigned, and resetScoringState. External code SHALL NOT directly mutate autoAssignedIdentityIds or matchScoringMs.

#### Scenario: Recording an auto-assignment
- **WHEN** the match engine auto-assigns an identity
- **THEN** it SHALL call run.markAutoAssigned(identityId) rather than run.autoAssignedIdentityIds.add(identityId)

#### Scenario: Resetting scoring state for a new run
- **WHEN** a new managed account processing phase starts
- **THEN** the orchestrator SHALL call run.resetScoringState() rather than manually clearing autoAssignedIdentityIds and resetting matchScoringMs

### Requirement: FusionRun encapsulates decision and review URL tracking

FusionRun SHALL expose methods for decision and review URL state mutations: addDecision, clearDecisions, addReviewUrlForReviewer, addReviewUrlForCandidate, addPendingCandidateId, getReviewerUrls, and getCandidateUrls.

#### Scenario: Adding a form decision
- **WHEN** FormService processes a form decision
- **THEN** it SHALL call run.addDecision(decision) rather than pushing to run.fusionIdentityDecisions

#### Scenario: Adding a review URL
- **WHEN** FormService tracks a pending review URL
- **THEN** it SHALL call run.addReviewUrlForReviewer(reviewerId, url) rather than the raw get??[],push,set pattern on run.pendingReviewUrlsByReviewerId

### Requirement: FusionRun encapsulates linked account index

FusionRun SHALL expose methods for linked account index state: initLinkedAccountIndex and clearLinkedAccountIndex.

#### Scenario: Initializing the linked account index
- **WHEN** the matching phase builds the correlated account index
- **THEN** it SHALL call run.initLinkedAccountIndex() rather than assigning run.linkedAccountKeyIndex = new Set()

#### Scenario: Cleaning up the linked account index
- **WHEN** the matching phase completes
- **THEN** it SHALL call run.clearLinkedAccountIndex() rather than assigning run.linkedAccountKeyIndex = undefined

## REMOVED Requirements

### Requirement: FusionAccountRepository as separate class

**Reason**: FusionAccountRepository was a partial abstraction that wrapped FusionRun's Maps but was inconsistently used (bypassed by identityProcessor, duplicated by fusionService). Its methods and state are absorbed into FusionRun directly, eliminating an unnecessary indirection layer.

**Migration**: Replace imports of `FusionAccountRepository` with direct calls to FusionRun methods. Repository methods map to FusionRun methods: `setFusionAccount(fa)` → `run.registerFusionAccount(fa)`, `getFusionIdentity(id)` → `run.getFusionIdentity(id)`, etc.
