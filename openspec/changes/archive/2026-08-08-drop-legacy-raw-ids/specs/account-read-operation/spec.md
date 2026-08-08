# account-read-operation Delta Spec

## REMOVED Requirements

### Requirement: Account read optionally triggers cascade aggregation before managed account fetch

#### Scenario: Legacy non-composite managed account keys are skipped with warning

**Reason:** Backwards compatibility for legacy raw managed account IDs is removed. Non-composite values are invalid managed account keys, not a supported alternate format.

**Migration:** Migrate persisted `accounts` and `missing-accounts` attributes to composite keys (`sourceId::nativeIdentity`) before upgrading. Invalid references are dropped with a diagnostic warning.

---

## ADDED Requirements

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
