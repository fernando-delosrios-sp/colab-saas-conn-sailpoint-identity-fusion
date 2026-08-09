## REMOVED Requirements

### Requirement: FusionAccountState SHALL own all mutable data fields

**Reason:** `FusionAccountState` was deleted in the Jul 22 collaborator collapse. Mutable account data is owned by `FusionAccount` (identity/bag) and collaborator objects with private fields.

**Migration:** Use collaborator architecture requirements in this delta. Do not reintroduce `FusionAccountState`.

### Requirement: FusionAccountState SHALL serialize collections to the attribute bag

**Reason:** Serialization lives on `FusionCollections.syncToBag`, invoked via `FusionAccount.syncCollectionAttributesToBag`, not on a State type.

**Migration:** See ADDED requirement for current-bag collection sync.

### Requirement: Rule modules SHALL operate on FusionAccountState as functions

**Reason:** Rule modules under `fusionAccountRules/` were deleted; behavior is methods on collaborators.

**Migration:** Call collaborator methods (`collections`, `correlation`, `layers`) instead of free functions on State.

### Requirement: FusionAccount facade SHALL delegate all operations to state and rules

**Reason:** Thin State/rules facade was reversed; flat 1:1 wrappers are being removed in favor of direct collaborator access.

**Migration:** See ADDED requirements for collaborator public API.

---

## ADDED Requirements

### Requirement: FusionAccount SHALL expose collaborator sub-objects

`FusionAccount` MUST expose three readonly collaborator instances: `collections` (`FusionCollections`), `correlation` (`FusionCorrelation`), and `layers` (`FusionLayers`). `FusionAccount` MUST own core identity fields and the attribute bag. Collaborators MUST own the mutable slices described in ubiquitous language for each collaborator. `FusionAccountState` and `fusionAccountRules/*` MUST NOT exist.

#### Scenario: Collaborators are present on a new FusionAccount

- **GIVEN** a configured `FusionAccount`
- **WHEN** an account is constructed via a factory method
- **THEN** `account.collections`, `account.correlation`, and `account.layers` are defined
- **AND** each is an instance of the corresponding collaborator type

### Requirement: Callers SHALL use the collaborator API for account mutations

Production and test callers outside `FusionAccount` itself MUST mutate statuses, actions, reviews, account-id sets, history, matches, and correlation promises through `fusionAccount.collections` or `fusionAccount.correlation`. `FusionAccount` MUST NOT expose flat 1:1 pass-through mutators for those concerns (for example `addStatus` that only forwards to `collections.statuses.add`). Layer enrichment that must bind the attribute bag and identity fields MAY remain as orchestration methods on `FusionAccount` (for example `addIdentityLayer`, `addManagedAccountLayer`) that delegate to `FusionLayers`.

#### Scenario: Status mutation goes through collections

- **GIVEN** a `FusionAccount` instance
- **WHEN** a caller adds a status entitlement
- **THEN** the caller invokes a method on `fusionAccount.collections` (or a nested collection API it exposes)
- **AND** `FusionAccount` does not provide a flat `addStatus` pass-through

#### Scenario: Identity layer enrichment uses FusionAccount orchestration

- **GIVEN** a `FusionAccount` instance and an `IdentityDocument`
- **WHEN** a caller applies the identity layer
- **THEN** the caller invokes `fusionAccount.addIdentityLayer(identity)` (or an equivalent orchestration API on `FusionAccount`)
- **AND** that method delegates to `FusionLayers.addIdentityLayer` with the account's attribute bag and identity bindings

### Requirement: Collaborators SHALL encapsulate their mutable state

`FusionCollections`, `FusionCorrelation`, and `FusionLayers` MUST keep collection and flag state private (or otherwise not publicly mutable sets). Factory and hydrate paths on `FusionAccount` MUST use documented collaborator construction or hydrate methods. Call sites MUST NOT use `_internal_*` accessors to mutate collaborator state from `FusionAccount` factories or from external callers.

#### Scenario: Factory hydration does not use _internal_ mutators

- **GIVEN** a persisted ISC account used with `FusionAccount.fromFusionAccount`
- **WHEN** collection attributes are restored
- **THEN** restoration goes through public or package-documented hydrate APIs on `FusionCollections` / `FusionLayers`
- **AND** the factory path does not call `_internal_*` setters on the collaborator

### Requirement: Collection sync writes the current attribute bag

`FusionAccount.syncCollectionAttributesToBag()` MUST copy `accounts`, `missing-accounts`, `statuses`, `actions`, `reviews`, and `sources` (and other collection mirrors owned by `FusionCollections`) into `attributeBag.current` via `FusionCollections.syncToBag`. The method MUST NOT be required to mirror those collection arrays into `attributeBag.previous`.

#### Scenario: Sync updates current bag

- **GIVEN** a Fusion account with non-empty status and account-id collections
- **WHEN** `syncCollectionAttributesToBag()` is called
- **THEN** `attributeBag.current` contains array representations of those collections
- **AND** the contract does not require those same collection mirrors to be written into `attributeBag.previous`
