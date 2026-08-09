## MODIFIED Requirements

### Requirement: Correlated entitlement reflects missing-accounts outcome

When a Fusion account is built or rebuilt for output, the connector SHALL evaluate the internal missing-account reference set and SHALL grant the `correlated` action entitlement on the returned Fusion account if and only if no missing managed source accounts remain. When missing accounts remain, the `correlated` action entitlement SHALL NOT appear on the returned account. This is an outcome of the Fusion account build process, not an independently removed entitlement. On provisioning paths (`accountCreate`, `accountUpdate`), a Remove change for `correlate` or `correlated` action tokens SHALL fail the operation with message matching `Correlated entitlement cannot be removed: <value>`; the connector SHALL NOT honor entitlement revocation for derived correlated state.

#### Scenario: Correlated granted when no missing accounts remain

- **GIVEN** a Fusion account whose missing-account reference set is empty after build
- **WHEN** correlation status is updated for output
- **THEN** the returned Fusion account actions SHALL include the `correlated` action entitlement
- **AND** the `Uncorrelated` status entitlement SHALL NOT be present

#### Scenario: Correlated absent when missing accounts remain

- **GIVEN** a Fusion account whose missing-account reference set contains at least one managed account key after build
- **WHEN** correlation status is updated for output
- **THEN** the returned Fusion account actions SHALL NOT include the `correlated` action entitlement
- **AND** the `Uncorrelated` status entitlement SHALL be present

#### Scenario: Correlated Remove rejected on provisioning path

- **GIVEN** a Fusion account whose missing-account reference set is empty
- **WHEN** a Remove change for the `correlated` action entitlement is processed on a provisioning path
- **THEN** the operation SHALL fail with a message matching `Correlated entitlement cannot be removed: correlated`
- **AND** the connector SHALL NOT mutate correlation links or missing-account state
