## ADDED Requirements

### Requirement: Correlated entitlement reflects missing-accounts outcome

When a Fusion account is built or rebuilt for output, the connector SHALL evaluate the internal missing-account reference set and SHALL grant the `correlated` action entitlement on the returned Fusion account if and only if no missing managed source accounts remain. When missing accounts remain, the `correlated` action entitlement SHALL NOT appear on the returned account. This is an outcome of the Fusion account build process, not an independently removed entitlement.

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

### Requirement: Correlate action assignment triggers direct PATCH for missing accounts on provisioning paths

When the platform assigns the `correlate` or `correlated` action entitlement (Add) on a provisioning path (`accountCreate` or `accountUpdate`), the connector SHALL attempt direct identity correlation (ISC PATCH) for missing managed source accounts on that Fusion account. On this path the connector SHALL NOT apply reverse-correlation attribute writes; reverse correlation remains an aggregation/link flow concern.

#### Scenario: Correlate Add attempts PATCH when missing accounts exist

- **GIVEN** a Fusion account with a non-empty missing-account reference set
- **AND** the Fusion account has a resolvable platform identity id
- **WHEN** the correlate action entitlement is assigned (Add) on a provisioning path
- **THEN** the connector SHALL invoke direct identity correlation for eligible missing managed account keys
- **AND** SHALL update missing-account and correlated action state on the returned Fusion account based on the outcome

#### Scenario: Correlate Add is a no-op when no missing accounts exist

- **GIVEN** a Fusion account whose missing-account reference set is empty
- **WHEN** the correlate action entitlement is assigned (Add) on a provisioning path
- **THEN** the connector SHALL NOT invoke direct identity correlation
- **AND** the returned Fusion account SHALL reflect the correlated entitlement outcome per the missing-accounts evaluation requirement

### Requirement: Reverse-correlation attributes are managed on every Fusion account build

For each configured managed source with `correlationMode: reverse` and a defined `correlationAttribute`, the connector SHALL manage reverse-correlation attribute values on affected Fusion accounts whenever those accounts are built or rebuilt for output (including account-list, account-read, account-update, and other operations returning an ISC Fusion account). Rebuild steps that remap or redefine attributes SHALL NOT permanently clobber reverse-correlation attribute values that were established for the Fusion account; values SHALL be preserved or recomputed according to the active correlation outcome before output.

#### Scenario: Reverse-correlation attribute present on output when correlation applies

- **GIVEN** a managed source configured with `correlationMode: reverse` and `correlationAttribute: revAttr`
- **AND** a Fusion account with a missing managed account from that source eligible for reverse correlation
- **WHEN** the Fusion account is built for output
- **THEN** the returned ISC account attributes SHALL include `revAttr` with the reverse-correlation value for that source when the build path sets it
- **AND** the attribute SHALL remain consistent with the Fusion account correlation outcome

#### Scenario: Account update rebuild preserves reverse-correlation snapshot

- **GIVEN** reverse-correlation sources are configured
- **AND** a Fusion account already has reverse-correlation attribute values on the fusion source row
- **WHEN** the account-update operation rebuilds the Fusion account before processing action changes
- **THEN** the connector SHALL capture reverse-correlation attribute values before rebuild
- **AND** SHALL restore those values after action processing and before generating the ISC account output

