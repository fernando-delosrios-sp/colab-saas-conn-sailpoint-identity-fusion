## MODIFIED Requirements

### Requirement: Correlated identities are hydrated before the managed-account sweep

The connector SHALL hydrate identities correlated to **orphan correlated managed accounts** — managed source accounts that are correlated on the source (`uncorrelated === false`) and remain on the work queue after the refresh phase because they are not linked to any account key on a loaded Fusion account — before the correlated account sweep creates Fusion accounts from them. Hydration SHALL occur only for identities not already present in the run-scoped identity cache after the configured `identityScopeQuery` fetch. The connector SHALL NOT perform this hydration pass for managed accounts already linked to an existing Fusion account or for uncorrelated managed accounts.

For each orphan correlated managed account whose identity is hydrated, the connector SHALL apply the identity layer to the **new** Fusion account created from that managed account during the correlated account sweep, before `getISCAccount` serializes it, so the Fusion display-attribute override can consume the identity alias via `FusionAccount.identityAlias`.

#### Scenario: Orphan correlated managed account with identity outside configured scope

- **WHEN** a managed source account is correlated on the source (`uncorrelated === false`)
- **AND** the account is not linked to any account key on a loaded Fusion account after refresh
- **AND** the account remains on the work queue with a non-empty `identityId`
- **AND** the correlated identity is not in the run-scoped identity cache after the configured `identityScopeQuery` fetch
- **THEN** the connector SHALL hydrate the identity by id before the correlated account sweep
- **AND** it SHALL apply the identity layer to the new Fusion account created from that managed account before `getISCAccount` serializes it

#### Scenario: Correlated managed account already linked to a Fusion account

- **WHEN** a managed source account is correlated on the source
- **AND** the account is linked to an account key on a loaded Fusion account during refresh
- **THEN** the connector SHALL NOT include that account's `identityId` in the orphan hydration pass

#### Scenario: Multiple orphan correlated accounts share the same identity

- **WHEN** two or more orphan correlated managed accounts on the work queue share the same `identityId`
- **THEN** the connector SHALL hydrate the identity once
- **AND** it SHALL apply the identity layer to each new Fusion account created from those managed accounts during the correlated sweep

#### Scenario: Correlated identity is protected

- **WHEN** a hydrated identity is flagged as `protected`
- **THEN** the connector SHALL NOT apply the identity layer to the corresponding new Fusion account

#### Scenario: No orphan correlated managed accounts on the work queue

- **WHEN** no work-queue managed account is correlated on the source and unlinked from loaded Fusion accounts
- **THEN** the connector SHALL NOT perform any additional identity hydration for the correlated orphan pass

#### Scenario: Hydration query length is bounded

- **WHEN** the connector hydrates orphan correlated identities
- **THEN** it SHALL split the identity-id set into chunks of no more than 50 ids per query
- **AND** it SHALL execute the chunked queries in parallel with per-chunk error isolation
