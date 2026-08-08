# account-read Spec

## Purpose

The account-read operation reads one account by native identity. This spec defines the contract for single account retrieval behavior.
## Requirements
### Requirement: Account read rebuilds Fusion account with attribute operations REFRESH

The account-read operation SHALL load sources and schema, rebuild the target Fusion account with attribute operations REFRESH (remap and redefine attributes without unique reset), and return the current ISC Fusion account representation.

#### Scenario: Successful account read returns refreshed ISC account

- **GIVEN** an existing Fusion account for the requested identity
- **WHEN** the account-read operation is invoked with valid read input
- **THEN** the connector SHALL rebuild the Fusion account with attribute operations REFRESH
- **AND** SHALL return the ISC account via `res.send`

#### Scenario: Missing identity fails with observable message

- **GIVEN** account-read input without an identity value
- **WHEN** the account-read operation is invoked
- **THEN** the operation SHALL fail with message `Account identity is required`

#### Scenario: Fusion account not found fails with observable message

- **GIVEN** read input referencing an identity with no Fusion account
- **WHEN** the account-read operation is invoked
- **THEN** the operation SHALL fail with a message matching `Fusion account not found for identity: <identity>`

### Requirement: Account read accepts only composite managed account keys for fetch

When rebuilding a Fusion account, the account-read operation SHALL resolve managed account references for fetch using only valid composite managed account keys (`sourceId::nativeIdentity`). Values that fail composite key validation SHALL NOT be fetched and SHALL NOT be passed through as lookup keys.

#### Scenario: Invalid managed account key is skipped with diagnostic warning

- **GIVEN** a Fusion account whose `accounts` or `missing-accounts` collection contains a value that is not a valid composite managed account key
- **WHEN** the account-read operation rebuilds the Fusion account
- **THEN** the connector SHALL log a warning identifying the invalid key and expected format
- **AND** SHALL skip fetching that reference
- **AND** SHALL NOT fail the overall read operation

#### Scenario: Composite keys are fetched normally

- **GIVEN** a Fusion account referencing managed accounts with composite keys `src-a::user-1`
- **WHEN** the account-read operation rebuilds the Fusion account
- **THEN** the connector SHALL fetch each referenced managed account by source ID and native identity
- **AND** SHALL complete the rebuild successfully

### Requirement: Account read optionally triggers cascade aggregation before managed account fetch

When `cascadeAggregationEnabled` is true in processing control settings, the account-read operation SHALL trigger managed-source aggregation for each source referenced by the Fusion account's managed account keys before fetching managed accounts. Per-source cascade failures SHALL be logged and SHALL NOT fail the overall read operation.

#### Scenario: Cascade aggregation runs when enabled

- **GIVEN** `cascadeAggregationEnabled` is true
- **AND** an existing Fusion account linked to managed accounts on source `src-a`
- **WHEN** the account-read operation is invoked
- **THEN** the connector SHALL attempt aggregation for `src-a` before fetching managed accounts
- **AND** SHALL continue the rebuild even if cascade aggregation for a source fails

#### Scenario: Cascade skipped when disabled

- **GIVEN** `cascadeAggregationEnabled` is false or unset
- **WHEN** the account-read operation is invoked
- **THEN** the connector SHALL NOT trigger cascade aggregation before managed account fetch


