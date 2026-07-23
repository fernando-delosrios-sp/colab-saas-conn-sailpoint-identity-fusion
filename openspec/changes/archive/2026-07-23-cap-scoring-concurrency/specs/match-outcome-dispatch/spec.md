## ADDED Requirements

### Requirement: Managed-account scoring concurrency is capped independently of batch size

`scoreManagedAccounts` SHALL limit concurrent identity-comparison scoring operations using `scoringMaxConcurrency` from developer settings. The effective concurrency for a batch MUST be `max(1, min(batchSize, scoringMaxConcurrency))`. Scoring MUST NOT use uncapped `Promise.all` over the full batch when the batch size exceeds the configured concurrency limit.

#### Scenario: Default concurrency caps scoring at 12
- **GIVEN** `managedAccountsBatchSize` is 100 and `scoringMaxConcurrency` is unset
- **WHEN** `scoreManagedAccounts` scores a batch of 100 accounts
- **THEN** at most 12 identity-comparison scoring operations SHALL run concurrently at any time
- **AND** all 100 accounts SHALL still be scored before the batch completes

#### Scenario: Explicit concurrency is honored within batch bounds
- **GIVEN** `scoringMaxConcurrency` is 5 and the current batch contains 50 accounts
- **WHEN** identity-phase scoring runs for that batch
- **THEN** at most 5 scoring operations SHALL run concurrently at any time
- **AND** all 50 accounts SHALL be scored

#### Scenario: Concurrency does not exceed batch slice size
- **GIVEN** `scoringMaxConcurrency` is 12 and the current batch contains 3 accounts
- **WHEN** identity-phase scoring runs for that batch
- **THEN** at most 3 scoring operations SHALL run concurrently

---

### Requirement: Deferred-phase scoring uses the same concurrency cap

The deferred-candidate scoring sweep in `scoreManagedAccounts` SHALL use the same effective concurrency limit as the identity-phase scoring sweep for each batch.

#### Scenario: Deferred scoring respects scoringMaxConcurrency
- **GIVEN** pending deferred accounts are scored in a batch larger than `scoringMaxConcurrency`
- **WHEN** deferred-phase scoring runs
- **THEN** at most `scoringMaxConcurrency` deferred scoring operations SHALL run concurrently at any time
- **AND** all pending deferred accounts in the batch SHALL be scored

---

### Requirement: scoringMaxConcurrency developer setting

The connector SHALL expose `scoringMaxConcurrency` as a developer setting with default 12. The resolved value MUST be clamped to the inclusive range 1–50. When the setting is omitted or null, the connector MUST use 12 and MUST NOT fall back to `managedAccountsBatchSize`.

#### Scenario: Default applies when setting omitted
- **GIVEN** developer settings omit `scoringMaxConcurrency`
- **WHEN** configuration is loaded
- **THEN** the effective `scoringMaxConcurrency` SHALL be 12

#### Scenario: Configured value is clamped to safe bounds
- **GIVEN** `scoringMaxConcurrency` is configured as 200
- **WHEN** configuration is resolved for scoring
- **THEN** the effective concurrency limit SHALL be 50

#### Scenario: Setting is surfaced in connector-spec
- **GIVEN** an operator views Developer Settings in connector-spec
- **WHEN** configuring scoring throughput
- **THEN** `scoringMaxConcurrency` SHALL be available as a numeric setting with default 12
