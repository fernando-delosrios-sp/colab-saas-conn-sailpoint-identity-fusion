## ADDED Requirements

### Requirement: First-time Fusion account factories add new status

`FusionAccount.fromIdentity`, `FusionAccount.fromManagedAccount`, and `FusionAccount.fromFusionDecision` SHALL add the `new` status entitlement. Those constructors create a Fusion account whose origin is not a previous Fusion account. Call sites MUST use `StatusEntitlement.New`. Identity reuse of an existing Fusion account (`findFusionAccountForIdentity`) SHALL NOT add `new` solely because the identity is being processed.

#### Scenario: fromIdentity adds new
- **GIVEN** an `IdentityDocument` with `id: 'id-1'`
- **WHEN** `FusionAccount.fromIdentity(identity)` is called
- **THEN** `statuses` SHALL contain `'new'`
- **AND** `statuses` SHALL contain `'baseline'`

#### Scenario: fromManagedAccount adds new
- **GIVEN** an SDK `Account` with `sourceId: 'src-a'`, `nativeIdentity: 'nat-1'`
- **WHEN** `FusionAccount.fromManagedAccount(account)` is called
- **THEN** `statuses` SHALL contain `'new'`
- **AND** `statuses` SHALL contain `'uncorrelated'`

#### Scenario: fromFusionDecision adds new
- **GIVEN** a `FusionDecision` whose account has `sourceId: 'src-b'`, `nativeIdentity: 'nat-2'`
- **WHEN** `FusionAccount.fromFusionDecision(decision)` is called
- **THEN** `statuses` SHALL contain `'new'`
- **AND** `statuses` SHALL contain `'uncorrelated'`

#### Scenario: Identity reuse does not add new
- **GIVEN** an existing Fusion account already registered for the identity's managed accounts
- **WHEN** `IdentityProcessor` reuses that account for a recreated identity
- **THEN** the processor SHALL NOT add `'new'` solely because of reuse
- **AND** if that account was reconstructed from a previous Fusion account, `'new'` SHALL remain absent

### Requirement: fromFusionAccount removes new status

When a Fusion account is reconstructed from a previous Fusion account via `FusionAccount.fromFusionAccount`, the connector SHALL remove the `new` status entitlement even if the persisted `statuses` attribute still contains it. Reconstruction SHALL NOT add `new`.

#### Scenario: Persisted new is stripped
- **GIVEN** a persisted Fusion account whose `attributes.statuses` contains `'new'`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `statuses` SHALL NOT contain `'new'`

#### Scenario: Reconstruction without new stays without new
- **GIVEN** a persisted Fusion account whose `attributes.statuses` does not contain `'new'`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `statuses` SHALL NOT contain `'new'`

---

## MODIFIED Requirements

_(none)_

---

## REMOVED Requirements

_(none)_
