## MODIFIED Requirements

### Requirement: Correlated entitlement and correlate action are defined as a pair

The ubiquitous language SHALL define **correlated entitlement** (outcome: all managed source accounts correlated with the Fusion identity) and **correlate action** (enforcement: direct PATCH of missing managed accounts when the platform assigns correlated entitlement to an account that lacks it) as linked terms. Documentation and specs SHALL use **correlated entitlement**, not informal synonyms such as "derived correlated". The correlated entitlement SHALL NOT be revocable via entitlement Remove on provisioning paths; Remove for `correlate` or `correlated` tokens SHALL fail the operation.

#### Scenario: Spec references correlated outcome

- **GIVEN** a specification describes when the `correlated` action entitlement appears on a Fusion account
- **WHEN** the spec is reviewed against this ubiquitous-language spec
- **THEN** it SHALL use the term **correlated entitlement**
- **AND** SHALL state that presence means all managed source accounts are correlated with the Fusion identity

#### Scenario: Spec references correlate enforcement on assignment

- **GIVEN** a specification describes platform assignment of the correlated entitlement on account create or update
- **WHEN** the spec is reviewed against this ubiquitous-language spec
- **THEN** it SHALL use the term **correlate action**
- **AND** SHALL describe direct PATCH of missing managed source accounts as the enforcement mechanism

#### Scenario: Correlated entitlement Remove is invalid on provisioning paths

- **GIVEN** documentation or specs describe account-update or account-create action handling
- **WHEN** a Remove change targets `correlate` or `correlated`
- **THEN** the spec SHALL state that the operation fails because correlated entitlement is derived, not revocable
