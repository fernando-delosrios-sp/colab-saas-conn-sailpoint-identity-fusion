## REMOVED Requirements

### Requirement: Account update skips correlation status recompute on correlate Remove

**Reason:** Correlated entitlement is derived from the missing-accounts set, not revocable via entitlement Remove. The skip-recompute behavior allowed correlated to disappear from the response while the Fusion identity remained fully correlated — contradicting the domain model.

**Migration:** Replace with "Account update rejects correlated entitlement Remove" requirement. Remove `shouldSkipCorrelationStatusRecompute()` from account-update pipeline and reject Remove in `correlateAction`.

---

## ADDED Requirements

### Requirement: Account update rejects correlated entitlement Remove

When processing a Remove change for `correlate` or `correlated` action tokens on the account-update operation, the connector SHALL fail the operation. The correlated entitlement is derived from whether all managed source accounts are linked in the Fusion identity; it SHALL NOT be revocable via entitlement removal. Established correlation links SHALL remain unchanged because the operation fails before output is sent.

#### Scenario: Correlated Remove fails with observable message

- **GIVEN** an existing Fusion account with established correlations
- **WHEN** the account-update operation receives a Remove change for the `correlated` action entitlement
- **THEN** the operation SHALL fail with a message matching `Correlated entitlement cannot be removed: correlated`
- **AND** the connector SHALL NOT send an ISC account response
- **AND** established correlation links SHALL remain unchanged

#### Scenario: Correlate token Remove fails with observable message

- **GIVEN** an existing Fusion account
- **WHEN** the account-update operation receives a Remove change for the `correlate` action token
- **THEN** the operation SHALL fail with a message matching `Correlated entitlement cannot be removed: correlate`
- **AND** the connector SHALL NOT send an ISC account response
