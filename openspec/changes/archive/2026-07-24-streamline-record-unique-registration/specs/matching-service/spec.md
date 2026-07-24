## ADDED Requirements

### Requirement: Record-only unique registration bulk pre-pass

When a managed account belongs to a Record-type source with `includeRecordAccountsForMatching` false, FusionService SHALL register its unique attribute values in a bulk **record unique registration** phase before the uncorrelated match sweep. Such accounts SHALL NOT enter Match scoring or full `AccountAssembly.assembleManagedAccount` processing. Registration SHALL use selective attribute mapping (targets coincident with unique definition names) followed by `DefinitionService.registerUniqueAttributes`, then remove the account from the managed-account work queue.

#### Scenario: Match-disabled record account bypasses uncorrelated sweep

- **GIVEN** a Record-type source with `includeRecordAccountsForMatching: false`
- **AND** an uncorrelated managed account from that source with a mappable unique attribute value
- **WHEN** the record unique registration phase runs
- **THEN** the account's unique values SHALL be registered via DefinitionService
- **AND** the account SHALL be removed from `managedAccountsById` before uncorrelated match sweep begins
- **AND** Match scoring SHALL NOT be invoked for that account

#### Scenario: Record with match enabled still uses match sweep

- **GIVEN** a Record-type source with `includeRecordAccountsForMatching: true` (or omitted, default true)
- **WHEN** managed account processing runs
- **THEN** the account SHALL NOT be handled solely by the bulk record unique registration phase
- **AND** existing match sweep behavior SHALL apply

#### Scenario: Form decision record no-match reuses registration helper

- **GIVEN** a finished fusion review decision with `newIdentity: true` on a Record-type source
- **WHEN** DecisionProcessor handles the record no-match outcome
- **THEN** unique attributes SHALL be registered using the same selective map + register helper as the bulk phase
- **AND** no Fusion account SHALL be created

## MODIFIED Requirements

### Requirement: MatchingService dispatches non-match per source type

When no identity candidates meet the threshold, MatchingService SHALL apply source-type-specific policies: authoritative accounts produce new Fusion accounts, record accounts register unique attributes only, orphan accounts may be disabled. Record accounts whose source has `includeRecordAccountsForMatching` false SHALL be registered in the bulk record unique registration phase and SHALL NOT reach this dispatch path during uncorrelated sweep.

#### Scenario: Authoritative non-match creates new Fusion account

- **GIVEN** an authoritative managed account with no matches
- **WHEN** MatchingService handles the outcome
- **THEN** a new Fusion account SHALL be created and registered in FusionRun

#### Scenario: Record non-match registers unique attributes

- **GIVEN** a record-source managed account with no matches and match scoring enabled for that source
- **WHEN** MatchingService handles the outcome
- **THEN** unique attributes SHALL be registered via DefinitionService
- **AND** no Fusion account SHALL be created

#### Scenario: Match-disabled record account already registered in pre-pass

- **GIVEN** a record-source managed account with `includeRecordAccountsForMatching: false`
- **WHEN** the record unique registration phase completes
- **THEN** the account SHALL NOT appear in the uncorrelated match sweep queue
- **AND** unique values SHALL already be present in DefinitionService registries
