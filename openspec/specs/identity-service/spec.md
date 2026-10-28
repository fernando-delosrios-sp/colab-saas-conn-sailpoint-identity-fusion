# identity-service Spec

## Purpose

The identity service (`src/services/identityService.ts`) is the connector's read-side adapter for SailPoint identities. It wraps the SailPoint API client's `AccountsApi` and `Search` resources and exposes identity-document operations used by correlation, change-detection, and the report operation. This spec defines the contract for how the connector searches, reads, and resolves identities on the upstream side.

## Requirements

### Requirement: Identity-origin Fusion accounts become orphan when origin identity leaves scope

A Fusion account created from an ISC identity MUST be considered orphan when it has no contributing accounts and its origin identity is not present in the configured identity scope. A Record-source managed account is enrichment only: it is not a contributing account.

Feature: Identity-origin orphan detection

#### Scenario: Identity-origin account with origin identity in scope and no managed accounts remains active
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is present in the configured identity scope
- **AND** the Fusion account has no managed source accounts
- **WHEN** the aggregation processes the account
- **THEN** the account is not marked `orphan`
- **AND** the account is emitted in the output

#### Scenario: Identity-origin account with origin identity removed from scope becomes orphan
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is not present in the configured identity scope
- **AND** the Fusion account has no managed source accounts
- **WHEN** the aggregation processes the account
- **THEN** the account is marked `orphan`
- **AND** the account retains the `baseline` status

#### Scenario: Identity-origin account with contributing accounts is not orphan even when origin identity is out of scope
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is not present in the configured identity scope
- **AND** the Fusion account still has contributing accounts
- **WHEN** the aggregation processes the account
- **THEN** the account is not marked `orphan`

#### Scenario: Managed-origin account without contributing accounts still becomes orphan
- **GIVEN** a Fusion account was created from a managed source account
- **AND** the account has no contributing accounts left
- **WHEN** the aggregation processes the account
- **THEN** the account is marked `orphan`

#### Scenario: Record-source accounts are not contributing accounts
- **GIVEN** a Fusion account was created from a managed source account
- **AND** the only managed source accounts left on it come from Record sources
- **WHEN** the aggregation processes the account
- **THEN** the account is marked `orphan`
- **AND** `deleteEmpty` removes it from aggregation output when enabled

#### Scenario: Single-account read detects out-of-scope origin identity
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is not present in the configured identity scope
- **AND** the account has no managed source accounts
- **WHEN** an `accountRead` operation rebuilds the account
- **THEN** the account is marked `orphan`
- **AND** the returned ISC account includes the orphan status
- **AND** `deleteEmpty` does not suppress single-account read output (it applies only when aggregation emits accounts)

#### Scenario: deleteEmpty filters identity-origin orphans from aggregation output
- **GIVEN** a Fusion account was created from identity `idn-1`
- **AND** `idn-1` is not present in the configured identity scope
- **AND** the account has no managed source accounts
- **AND** `deleteEmpty` is enabled
- **WHEN** the aggregation emits accounts
- **THEN** the account is not sent to the platform

### Requirement: Identity Fetch SHALL ingest documents without blocking the event loop

When `includeIdentities` is enabled and an identity scope query runs, `IdentityService.fetchIdentities` SHALL register identity documents into FusionRun as search pages arrive (or in chunks of at most 250 documents when a collect-all array is the only available source). After each chunk or page, the service SHALL yield to the event loop (`yieldToEventLoop` / `setImmediate`) so Operation heartbeat and platform keep-alive timers can run. Protected identities SHALL continue to be excluded from the cache and from `identityIdsInScope`.

#### Scenario: Large identity search yields between ingest chunks

- **GIVEN** identity Fetch returns more than 250 in-scope identity documents
- **WHEN** `fetchIdentities` registers them on FusionRun
- **THEN** registration SHALL not run as a single uninterrupted synchronous loop over the full result
- **AND** the event loop SHALL be yielded at least once per 250 documents (or once per search page, whichever is smaller)

#### Scenario: Protected identities remain excluded

- **GIVEN** a search page contains a protected identity and an unprotected identity
- **WHEN** `fetchIdentities` ingests the page
- **THEN** only the unprotected identity SHALL be added to FusionRun
- **AND** only the unprotected identity SHALL be recorded in `identityIdsInScope`

### Requirement: Identity Fetch SHALL report ingested progress on the STATUS line

During identity bulk ingest, `IdentityService` SHALL update the Fetch `identities` population counter as in-scope documents are registered. When the ingest total is known and greater than zero, the service SHALL emit one DETAIL line with `action=ingesting identities` and `count=` before ingest work. Empty identity Fetch SHALL NOT set an `identities` counter. Identity Fetch SHALL NOT call `setProgress` with unit `ingested` as the Fetch pipeline slot.

#### Scenario: STATUS shows ingested progress during identity cache fill

- **GIVEN** identity Fetch is registering 1000 in-scope documents
- **AND** the operation heartbeat is active
- **WHEN** ingest is in progress
- **THEN** the `identities` Fetch population counter SHALL be updated
- **AND** a subsequent STATUS line SHALL include `identities=`
- **AND** the line SHALL NOT use `progress=` with unit `ingested` for that work

#### Scenario: Empty identity Fetch skips ingested progress

- **GIVEN** identity Fetch returns zero in-scope documents
- **WHEN** `fetchIdentities` completes
- **THEN** the service SHALL NOT set an `identities` Fetch population counter

#### Scenario: Skipped identity Fetch omits identities STATUS segment

- **GIVEN** identity Fetch is skipped for the run
- **WHEN** Fetch STATUS ticks fire
- **THEN** STATUS lines SHALL NOT include `identities=`

### Requirement: Identity Document pruning on ingest

IdentityService SHALL prune incoming `IdentityDocument` payloads on page arrival during bulk ingestion and single-identity hydration by filtering `identity.attributes` against the referenced attribute set and filtering `identity.accounts` to only configured Fusion and managed sources.

#### Scenario: Unreferenced identity attributes are dropped on page arrival

- **GIVEN** an incoming page of `IdentityDocument` instances from the Search API
- **AND** a referenced attribute set configured for the aggregation run
- **WHEN** `IdentityService.fetchIdentities` ingests each identity
- **THEN** attributes not present in the referenced attribute set or core identity fields SHALL be pruned from `identity.attributes`
- **AND** core identity fields (`displayName`, `email`, `name`, `id`, `firstname`, `lastname`) SHALL be preserved

#### Scenario: Non-managed linked accounts are excluded from identity document

- **GIVEN** an `IdentityDocument` containing linked accounts across multiple sources
- **WHEN** the identity is ingested by `IdentityService`
- **THEN** accounts belonging to sources other than the Fusion source or configured managed sources SHALL be removed from `identity.accounts`
- **AND** retained accounts SHALL retain only essential fields (`id`, `nativeIdentity`, `name`, `disabled`, `source`)

#### Scenario: On-demand identity hydration applies pruning

- **GIVEN** an identity fetched on-demand via `IdentityService.fetchIdentityById`
- **WHEN** the identity document is received from the API
- **THEN** the same attribute pruning and linked account filtering SHALL be applied before the document is cached or returned
