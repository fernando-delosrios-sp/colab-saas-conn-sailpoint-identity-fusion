## MODIFIED Requirements

### Requirement: MappingService registers the Identities snapshot when the identity bag is present

When identity scope is enabled and `attributeBag.identity` is non-empty, MappingService SHALL register that bag as source `Identities` in `sourceAttributeMap`, include `Identities` in source order if missing, and index it in the per-invocation snapshot-key index under the identity id. Origin and main snapshot resolution SHALL use that index for both managed keys and the identity id. MappingService SHALL NOT use a separate merge algebra for identity-origin Fusion accounts. When identity scope is disabled, MappingService SHALL exclude the identity bag from managed-origin Fusion accounts and remove any stale `Identities` snapshot before mapping. Identity-origin Fusion accounts explicitly created for required support identities, such as global reviewers, SHALL retain their own identity snapshot.

#### Scenario: Disabled identity scope excludes the Identities snapshot

- **GIVEN** `includeIdentities` is `false`
- **AND** a managed-origin Fusion account has a non-empty identity bag
- **AND** managed snapshots do not contain `firstname`, `lastname`, or `department`
- **WHEN** `mapAttributes` runs
- **THEN** the identity bag SHALL NOT contribute mapped or unmapped values
- **AND** `Identities` SHALL NOT remain in `sourceAttributeMap`

#### Scenario: Origin resolves through the index for identity-origin

- **GIVEN** an identity-origin Fusion account
- **AND** a non-empty identity bag
- **AND** `originAccount` equals the identity id
- **WHEN** `mapAttributes` runs
- **THEN** the origin snapshot SHALL be that identity bag
- **AND** Origin account merge SHALL read values from it

#### Scenario: Main account can resolve to the Identities snapshot

- **GIVEN** a Fusion account with a non-empty identity bag
- **AND** `mainAccount` equals the identity id
- **AND** a linked managed account has a different `department`
- **AND** the mapping or unmapped key for `department` uses Main account merge
- **WHEN** `mapAttributes` runs
- **THEN** `department` SHALL come from the identity bag

#### Scenario: Managed-origin Fusion account indexes Identities when the bag is present

- **GIVEN** a managed-origin Fusion account
- **AND** a non-empty identity bag
- **AND** `mainAccount` equals the identity id
- **WHEN** `mapAttributes` resolves the main snapshot
- **THEN** MappingService SHALL find the identity bag in the snapshot-key index
