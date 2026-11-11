## ADDED Requirements

### Requirement: Managed source account fetch SHALL conditionally sort accounts by created time when batch aggregation is configured

When fetching accounts from a managed source via ISC `listAccounts`, `SourceService` SHALL determine `sorters` based on whether the source has `accountLimit` configured:
- When `accountLimit` is defined (batch mode): `sorters = 'created,id'`.
- When `accountLimit` is undefined or not finite (full aggregation mode): `sorters = 'id'`.

#### Scenario: Accounts generator requests created,id sort order when accountLimit is configured
- **GIVEN** a managed source with an `accountLimit` configured
- **WHEN** `fetchAccountsBySourceIdGenerator` is called
- **THEN** the request parameters passed to `AccountsApiListAccountsRequest` SHALL specify `sorters = 'created,id'`

#### Scenario: Accounts generator requests id sort order when accountLimit is not configured
- **GIVEN** a managed source without an `accountLimit` configured
- **WHEN** `fetchAccountsBySourceIdGenerator` is called
- **THEN** the request parameters passed to `AccountsApiListAccountsRequest` SHALL specify `sorters = 'id'`

#### Scenario: Non-generator account fetch requests created,id sort order when accountLimit is configured
- **GIVEN** a managed source with an `accountLimit` configured
- **WHEN** `fetchAccountsBySourceId` is called
- **THEN** the request parameters passed to `AccountsApiListAccountsRequest` SHALL specify `sorters = 'created,id'`

#### Scenario: Non-generator account fetch requests id sort order when accountLimit is not configured
- **GIVEN** a managed source without an `accountLimit` configured
- **WHEN** `fetchAccountsBySourceId` is called
- **THEN** the request parameters passed to `AccountsApiListAccountsRequest` SHALL specify `sorters = 'id'`

### Requirement: Batch aggregation cumulative count SHALL be monotonically non-decreasing

When a managed source has an `accountLimit` configured, `batchCumulativeCount` for that source SHALL be updated monotonically after fetch completion such that it never decreases below its previously persisted value.

#### Scenario: Run collects fewer accounts than previously recorded high-water mark
- **GIVEN** a managed source with an `accountLimit` and an existing `batchCumulativeCount` of 100
- **WHEN** an aggregation run completes collecting only 80 accounts due to an upstream change or transient omission
- **THEN** `batchCumulativeCount` for that source SHALL remain 100
- **AND** the effective limit on the subsequent run SHALL be at least 100 plus `accountLimit`

#### Scenario: Run collects more accounts than previously recorded high-water mark
- **GIVEN** a managed source with an `accountLimit` and an existing `batchCumulativeCount` of 100
- **WHEN** an aggregation run completes collecting 150 accounts
- **THEN** `batchCumulativeCount` for that source SHALL be updated to 150

### Requirement: Batch aggregation SHALL persist creation watermark timestamp

When an aggregation run completes for a source with `accountLimit`, the connector SHALL record the latest account creation timestamp (`created`) observed in that run's collected accounts.

#### Scenario: Creation watermark timestamp is persisted
- **GIVEN** a managed source with `accountLimit` that successfully collects accounts
- **WHEN** the batch cumulative state is saved during the Output phase
- **THEN** `batchWatermarkTimestamp` for that source SHALL store the ISO creation timestamp of the newest collected account
