# fusionService Spec

## Purpose

The fusion service (`src/services/fusionService/`) is the orchestrator for the Fusion account model: it builds `FusionAccount` instances from managed sources and identity data, blends new managed accounts into existing Fusion accounts, and produces the `FusionReportAccount` / `FusionReportBlend` report records used by the connector's account and report operations. This spec defines the contract for how a managed account becomes a Fusion account, the blending semantics, and the report-side vocabulary that downstream operations consume.

## Requirements



### Requirement: Account Blending Terminology
The system SHALL use the term "blending" to refer to the process of merging a managed account into a Fusion account.

#### Scenario: Blended managed account history log
- **WHEN** a managed account is absorbed into a Fusion account
- **THEN** the Fusion account history SHALL log "Blended managed account [Account Name] ([Source Name])"

### Requirement: Report Tracking of Account Blends
The system SHALL track blending events during processing to populate the aggregation report payload.

#### Scenario: Recording a blending event
- **WHEN** a managed account is successfully set/absorbed into a Fusion account
- **AND** history recording is not skipped for that account key
- **THEN** the system SHALL record a blending event containing the target Fusion account name, link, and the blended account's name and source

### Requirement: missing-accounts attribute MUST restore uncorrelated account references

When a Fusion account is reconstructed from persisted platform attributes, the `missing-accounts` collection MUST be restored into the internal missing-account reference set. It MUST NOT be loaded from the correlated `accounts` collection.

#### Scenario: persisted missing-accounts are restored as missing references
- **GIVEN** a persisted Fusion account with `missing-accounts: ["src-a::user-1"]` and `accounts: ["src-a::user-2"]`
- **WHEN** the account is initialized via `FusionAccount.fromFusionAccount`
- **THEN** the missing-account reference set contains `"src-a::user-1"`
- **AND** the missing-account reference set does not contain `"src-a::user-2"`

#### Scenario: correlated accounts are not restored as missing references
- **GIVEN** a persisted Fusion account with `accounts: ["src-a::user-2"]` and no `missing-accounts` attribute
- **WHEN** the account is initialized via `FusionAccount.fromFusionAccount`
- **THEN** the missing-account reference set is empty
- **AND** the previous correlated account reference set contains `"src-a::user-2"`

### Requirement: Factory methods initialize core state consistently

Each static factory method MUST produce a `FusionAccount` whose core scalar fields (`type`, `nativeIdentity`, `name`, `sourceName`, `disabled`, `needsRefresh`, `identityInfo`, `iscAccountId`, `modified`) are set from the provided input.

Feature: Fusion account construction
Rule: `FusionAccount` factory methods initialize core scalar state from their inputs.

#### Scenario: fromIdentity initializes identity-origin core state
- **GIVEN** an `IdentityDocument` with `id: 'id-1'`, `name: 'Jane Doe'`, `disabled: false`
- **WHEN** `FusionAccount.fromIdentity(identity)` is called
- **THEN** the resulting account has `type` of `'identity'`
- **AND** `nativeIdentity` is `'id-1'`
- **AND** `name` is `'Jane Doe'`
- **AND** `sourceName` is `'Identities'`
- **AND** `disabled` is `false`

#### Scenario: fromManagedAccount initializes managed-origin core state
- **GIVEN** an SDK `Account` with `sourceId: 'src-a'`, `nativeIdentity: 'nat-1'`, `sourceName: 'Source A'`, `id: 'isc-1'`
- **WHEN** `FusionAccount.fromManagedAccount(account)` is called
- **THEN** the resulting account has `type` of `'managed'`
- **AND** `nativeIdentity` is `'src-a::nat-1'`
- **AND** `sourceName` is `'Source A'`
- **AND** `iscAccountId` is `'isc-1'`

### Requirement: fromFusionAccount restores persisted collection state

`FusionAccount.fromFusionAccount` MUST restore the internal collection sets (`_missingAccountIds`, `_reviews`, `_statuses`, `_actions`, `previousAccountIds`) and history from the persisted account attributes.

Feature: Fusion account construction
Rule: `fromFusionAccount` reconstructs internal collection and history state from persisted attributes.

#### Scenario: persisted accounts restore the previous account reference set
- **GIVEN** a persisted fusion account whose `attributes.accounts` contains `'src-a::correlated-1'`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `previousAccountIds` contains `'src-a::correlated-1'`

#### Scenario: persisted history restores the internal history trail
- **GIVEN** a persisted fusion account whose `attributes.history` contains `['[2026-01-01] event']`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `history` contains `'[2026-01-01] event'`

### Requirement: Identity-origin accounts carry baseline status

Accounts created from an identity OR reconstructed from a persisted identity-origin record MUST have the `baseline` status and the `Identities` source.

Feature: Fusion account construction
Rule: Identity-origin fusion accounts always carry the `baseline` status marker and `Identities` source.

#### Scenario: fromIdentity sets baseline status
- **GIVEN** an `IdentityDocument` with `id: 'id-1'`
- **WHEN** `FusionAccount.fromIdentity(identity)` is called
- **THEN** `statuses` contains `'baseline'`
- **AND** `sources` contains `'Identities'`

#### Scenario: fromFusionAccount re-asserts missing baseline for identity-origin records
- **GIVEN** a persisted identity-origin fusion account with `attributes.originSource: 'Identities'` and empty `attributes.statuses`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `statuses` contains `'baseline'`
- **AND** `sources` contains `'Identities'`

### Requirement: Managed-origin creation paths set uncorrelated state

Accounts created from an uncorrelated managed account or a fusion decision MUST be marked as uncorrelated and track the managed account key as missing.

Feature: Fusion account construction
Rule: Managed-origin creation paths initialize uncorrelated state.

#### Scenario: fromManagedAccount marks the account uncorrelated
- **GIVEN** an SDK `Account` with `sourceId: 'src-a'`, `nativeIdentity: 'nat-1'`
- **WHEN** `FusionAccount.fromManagedAccount(account)` is called
- **THEN** `statuses` contains `'uncorrelated'`
- **AND** `missingAccountIds` contains `'src-a::nat-1'`
- **AND** `needsReset` is `true`

#### Scenario: fromFusionDecision marks the account uncorrelated
- **GIVEN** a `FusionDecision` whose account has `sourceId: 'src-b'`, `nativeIdentity: 'nat-2'`
- **WHEN** `FusionAccount.fromFusionDecision(decision)` is called
- **THEN** `statuses` contains `'uncorrelated'`
- **AND** `missingAccountIds` contains `'src-b::nat-2'`

### Requirement: fromFusionAccount restores identity linkage from persisted attributes

When the SDK `Account` does not expose `identityId` directly, `fromFusionAccount` MUST recover it from `attributes.identityId` and fold it into the account's `IdentityInfo`.

Feature: Fusion account construction
Rule: Persisted `identityId` attribute restores the account's identity linkage.

#### Scenario: identityId attribute restores identity linkage
- **GIVEN** a persisted fusion account with no top-level `identityId` and `attributes.identityId: 'identity-1'`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `identityId` is `'identity-1'`
- **AND** `identityIdAttribute` is `'identity-1'`

#### Scenario: whitespace-only identityId attribute is ignored
- **GIVEN** a persisted fusion account with `attributes.identityId: '   '`
- **WHEN** `FusionAccount.fromFusionAccount(account)` is called
- **THEN** `identityId` is undefined
