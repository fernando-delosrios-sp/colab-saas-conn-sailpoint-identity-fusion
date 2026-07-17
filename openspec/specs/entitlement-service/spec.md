# entitlement-service Spec

## Purpose

The entitlement service (`src/services/entitlementService.ts`) models the lifecycle of an entitlement on a managed account: provisioning, deprovisioning, and the request/response transitions for create, enable, disable, update, and delete. It reads the canonical `Status` enum (`src/model/status.ts`) and the action set (`src/model/action.ts`) so the connector's behavior is consistent across operations. This spec defines the state machine that the operations layer drives when handling entitlement-mutating requests.

## Requirements



### Requirement: StatusEntitlement enum exists

The connector MUST export a TypeScript `enum` named `StatusEntitlement` from `src/model/statusEntitlement.ts`. The enum MUST be string-valued, and the runtime value of each member MUST equal the `id` of the corresponding entry in the connector's status entitlement list.

#### Scenario: Every member is a string with the expected value
- **WHEN** a developer inspects `StatusEntitlement.Baseline`
- **THEN** its value is the string `"baseline"`
- **AND** the same is true for every other member of the enum

#### Scenario: The enum contains the eleven current statuses
- **WHEN** a developer iterates the enum members
- **THEN** it contains exactly: `Authorized`, `Auto`, `Baseline`, `Manual`, `Orphan`, `NonMatched`, `Reviewer`, `Requested`, `Uncorrelated`, `ActiveReviews`, `Candidate`

### Requirement: Statuses data file is derived from the enum

`src/data/status.ts` MUST construct the `statuses` array using `StatusEntitlement` members for each `id` field. No string literal that names a status entitlement MAY appear as an `id` in `statuses`; the only source of those strings MUST be the enum.

#### Scenario: A new status is added in one place
- **WHEN** a developer adds a new member to `StatusEntitlement`
- **THEN** TypeScript reports a compile error in `src/data/status.ts` for any missing entry (or the new entry is obviously absent on review)
- **AND** the unit test for the contract fails until `data/status.ts` is updated to reference the new member

### Requirement: Internal call sites use the enum

Every internal call site that adds, removes, or tests a status entitlement on a `FusionAccount` (production code, not test fixtures simulating persisted data) MUST pass a `StatusEntitlement` member instead of a raw string literal.

#### Scenario: Production code references the enum
- **WHEN** the connector adds the `baseline` status to an account
- **THEN** the call is `fusionAccount.addStatus(StatusEntitlement.Baseline)`
- **AND** the same pattern is used for `Orphan`, `Uncorrelated`, `Reviewer`, `ActiveReviews`, `NonMatched`, `Manual`, `Auto`, `Authorized`, `Candidate`, and `Requested` at every site that currently uses a raw string

#### Scenario: Test fixtures simulating persisted data still use string literals
- **WHEN** a unit test constructs a persisted fusion account with a `statuses` array read from storage
- **THEN** the array may still be a `string[]` literal (e.g. `['baseline']`) because the test is simulating deserialized data, not invoking the production code path

### Requirement: Public FusionAccount API stays string-typed

`FusionAccount.addStatus`, `FusionAccount.removeStatus`, and `FusionAccount.hasStatus` MUST continue to accept and return `string` (not the enum). The serialized `statuses` attribute on the fusion account MUST remain a `string[]` whose values match the enum members verbatim.

#### Scenario: A persisted statuses array from an older connector round-trips
- **WHEN** a fusion account is restored from persistence with `statuses: ['baseline', 'reviewer']`
- **THEN** `hasStatus('baseline')` returns `true`
- **AND** the serialized form of the account is unchanged

### Requirement: Enum and data file cannot drift

A unit test in `src/model/__tests__/statusEntitlement.test.ts` MUST assert the contract between `StatusEntitlement` and the exported `statuses` array:

- Every enum member's string value MUST appear as an `id` in `statuses`.
- Every `id` in `statuses` MUST equal exactly one enum member's string value.
- The enum MUST have exactly eleven members (the current count).

#### Scenario: An enum member is added without updating the data file
- **WHEN** a developer adds a new `StatusEntitlement` member but forgets to add an entry in `data/status.ts`
- **THEN** the contract test fails with a clear message

#### Scenario: A status is removed from the data file but not the enum
- **WHEN** a developer removes an entry from `data/status.ts` but leaves the matching `StatusEntitlement` member
- **THEN** the contract test fails
