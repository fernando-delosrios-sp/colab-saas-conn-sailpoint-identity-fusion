## ADDED Requirements

### Requirement: Pending Fusion review forms SHALL deplete the managed-account work queue during Fetch

When `FormService.processFetchedFormData` processes form instances for a Fusion review form that has pending (non-response) instances and `analyzeFormInstances` sets `shouldRemoveAccountFromMap` to true, FormService SHALL remove the referenced managed account from `run.managedAccountsById` before the Match phase runs. Removal SHALL use `run.claimAccount` with the composite managed-account key extracted from form input (normalized via `normalizeCompositeManagedAccountKey`). FormService SHALL perform the claim when the normalized key is present in run inventory (`run.hasManagedAccount`), preferring the work-queue entry for `identityId` when the account is still queued.

#### Scenario: Pending review removes account from work queue
- **GIVEN** a managed account on `run.managedAccountsById` with composite key `sourceId::nativeIdentity`
- **AND** a Fusion review form instance in pending state references that key in form input
- **WHEN** `processFetchedFormData` processes the instance batch
- **THEN** `shouldRemoveAccountFromMap` SHALL be true
- **AND** `run.claimAccount('sourceId::nativeIdentity', identityId)` SHALL be invoked
- **AND** the account SHALL NOT remain on `run.managedAccountsById` when the uncorrelated Match sweep starts

#### Scenario: Normalized form account id matches work queue key
- **GIVEN** form input account id differs from the canonical key only by whitespace or equivalent composite formatting
- **WHEN** `extractAccountInfoOverride` runs with `shouldRemoveAccountFromMap` true
- **THEN** FormService SHALL normalize the id before lookup and claim
- **AND** the account SHALL be removed from the work queue when inventory contains the normalized key

#### Scenario: Inventory retains key after pending-review claim
- **GIVEN** a pending-review claim removed the account from the work queue
- **WHEN** `run.hasManagedAccount(normalizedKey)` is queried later in the same run
- **THEN** it SHALL still return true
- **AND** `run.getManagedAccountInfo(normalizedKey)` SHALL return metadata for reporting and form overrides

### Requirement: Duplicate form-definition create conflicts SHALL recover by reusing existing definitions

When `getOrCreateFormDefinition` attempts to create a form definition and the ISC API responds with a conflict indicating another definition with the same name already exists, FormService SHALL retry lookup by exact name and reuse the existing definition instead of failing the partial-match path.

#### Scenario: Create conflict falls back to existing definition
- **GIVEN** `getFormDefinitionByName` returned no results
- **AND** `createFormDefinition` fails with a duplicate-name conflict for form name `N`
- **WHEN** FormService handles the error in `getOrCreateFormDefinition`
- **THEN** it SHALL invoke `getFormDefinitionByName('N')` again
- **AND** if a definition is found, it SHALL be returned without rethrowing the create error
