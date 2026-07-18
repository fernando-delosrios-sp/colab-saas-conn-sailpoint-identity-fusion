# fusion-service Spec (Delta)

## ADDED Requirements

### Requirement: FusionService SHALL own a CandidateRegistry collaborator
The `FusionService` constructor MUST instantiate a `CandidateRegistry` with the fusion account map, sources-by-name map, and log. The registry SHALL be the single source of truth for per-source unmatched candidate registration and query during the two-pass managed account analysis lifecycle.

#### Scenario: Registry is wired in constructor
- **WHEN** `FusionService` is constructed
- **THEN** a `CandidateRegistry` instance is created with `fusionAccountMap`, `sourcesByName`, and `log`
- **AND** the instance is assigned to `this.candidateRegistry`

### Requirement: CandidateRegistry SHALL register accounts keyed by source
The `CandidateRegistry.register` method MUST add the given `FusionAccount`'s managed key to the candidate set for that account's source. Only accounts from authoritative sources with deferred matching enabled SHALL be registered.

#### Scenario: Deferred-enabled authoritative account is registered
- **WHEN** `register` is called with a `FusionAccount` whose source is authoritative and deferred-matching-enabled
- **THEN** the account's managed key is added to the candidate set for that source

#### Scenario: Non-authoritative account is not registered
- **WHEN** `register` is called with a `FusionAccount` whose source type is `Record`
- **THEN** the account is NOT added to any candidate set

#### Scenario: Account with no managed key is not registered
- **WHEN** `register` is called with a `FusionAccount` whose `managedKey` is undefined
- **THEN** the account is NOT added to any candidate set

### Requirement: CandidateRegistry SHALL query candidates per source
The `CandidateRegistry.queryForSource` method MUST return an `Iterable<FusionAccount>` containing only candidates registered for the given source name.

#### Scenario: Candidates are returned for the requested source
- **WHEN** `queryForSource` is called with source name `"Source A"`
- **THEN** only candidates registered with source key `"Source A"` are yielded

#### Scenario: No candidates returns empty iterable
- **WHEN** `queryForSource` is called with a source name that has no registered candidates
- **THEN** an empty iterable is returned (no errors)

### Requirement: CandidateRegistry SHALL be clearable for initialization
The `CandidateRegistry.clear` method MUST reset all registered candidates. FusionService MUST call `clear` during `initializeManagedAccountProcessing`.

#### Scenario: Clear is called during initialization
- **WHEN** `initializeManagedAccountProcessing` runs
- **THEN** `candidateRegistry.clear()` is called, resetting all candidate sets

### Requirement: FusionService SHALL own a ManagedAccountPassRunner collaborator
The `FusionService` constructor MUST instantiate a `ManagedAccountPassRunner` with a dependency-inverted state interface. The runner SHALL NOT reference `FusionService` directly.

#### Scenario: Runner is wired in constructor
- **WHEN** `FusionService` is constructed
- **THEN** a `ManagedAccountPassRunner` instance is created with a `ManagedAccountPassRunnerState` containing `config`, `log`, `managedAccountAnalyzer`, `candidateRegistry`, and `processAccount`
- **AND** the runner has no direct reference to `FusionService`

### Requirement: ManagedAccountPassRunner SHALL execute two-pass analysis
The runner's `execute` method MUST: (Pass 1) run identity-phase analysis on all accounts in parallel batches, classify results as identity-match, deferred-pending, or non-match, and register deferred-pending candidates; (Pass 2) run deferred-phase analysis on all pending accounts in parallel batches, classifying results as deferred-match or non-match.

#### Scenario: Identity match produces identity-match result
- **WHEN** Pass 1 identity scoring produces `hasIdentityBackedMatches: true`
- **THEN** the runner emits a result with resolution `identity-match`

#### Scenario: Deferred-enabled unmatched account is queued for Pass 2
- **WHEN** an account from a deferred-matching-enabled authoritative source has no identity match after Pass 1
- **THEN** the account is registered as a candidate via `candidateRegistry.register`
- **AND** the account is queued for Pass 2

#### Scenario: Non-deferred unmatched account produces non-match
- **WHEN** an account from a source WITHOUT deferred matching has no identity match after Pass 1
- **THEN** the result has resolution `non-match`

#### Scenario: Peer match in Pass 2 produces deferred-match result
- **WHEN** Pass 2 deferred scoring produces a peer match with candidate type `NewUnmatched`
- **THEN** the result has resolution `deferred-match`

#### Scenario: No peer match in Pass 2 produces non-match result
- **WHEN** Pass 2 deferred scoring produces no match
- **THEN** the result has resolution `non-match`

#### Scenario: Pass 2 runs in parallel batches
- **WHEN** Pass 2 has 50 pending accounts and batch size is 10
- **THEN** deferred scoring runs in 5 parallel batches of 10
- **AND** each account scores against per-source candidates registered during Pass 1

### Requirement: ManagedAccountPassRunner SHALL return structured results without side effects
The `execute` method MUST NOT call `recordAnalysis` or any dispatch handler. It MUST return an array of `ManagedAccountPassResult` objects, each containing the `ManagedAccountAnalysisContext` and a `resolution` string.

#### Scenario: Runner returns clean results
- **WHEN** `execute` completes
- **THEN** an array of `ManagedAccountPassResult` objects is returned
- **AND** no calls to `recordAnalysis`, `handleIdentityBackedMatch`, `handleDeferredMatch`, or `handleNonMatch` are made

### Requirement: ManagedAccountPassRunner SHALL report progress during execution
The runner MUST log progress at intervals matching current behavior (first account, every log-every-N accounts, final account) including processed count and elapsed time.

#### Scenario: Progress is logged at intervals
- **WHEN** `execute` processes 100 accounts with log-every 20
- **THEN** progress is logged at accounts 1, 20, 40, 60, 80, 100

### Requirement: FusionService SHALL delegate uncorrelated pass to the runner
`runUncorrelatedManagedAccountPass` MUST call `runner.execute()`, iterate results, call `recordAnalysis` once per result, and dispatch to the appropriate handler via a flat switch on resolution.

#### Scenario: Runner is called with queued accounts
- **WHEN** `runUncorrelatedManagedAccountPass` is called
- **THEN** `passRunner.execute` is invoked with queued accounts, batch size, and start time

#### Scenario: Each result is recorded and dispatched
- **WHEN** the runner returns results
- **THEN** `recordAnalysis` is called once for each result
- **AND** `identity-match` dispatches to `handleIdentityBackedMatch`
- **AND** `deferred-match` dispatches to `handleDeferredMatch`
- **AND** `non-match` dispatches to `handleNonMatch`

### Requirement: FusionService SHALL use runner for single-account analysis in processManagedAccount
`processManagedAccount` for uncorrelated accounts MUST call the runner with a single-account batch. The `analyzeManagedAccount` method SHALL be removed. The `completeManagedAccountFromAnalysis` method SHALL be removed.

#### Scenario: Uncorrelated account processed via runner
- **WHEN** `processManagedAccount` receives an uncorrelated account (`uncorrelated === true`)
- **THEN** `passRunner.execute` is called with `[account]` and batch size 1
- **AND** the returned result is dispatched via `handleIdentityBackedMatch`, `handleDeferredMatch`, or `handleNonMatch`

### Requirement: FusionService SHALL call recordAnalysis exactly once per account
`recordAnalysis` SHALL be called exactly once for each account's analysis, after the runner returns. No account SHALL be recorded more than once during the managed account processing pass.

#### Scenario: Record is called once per result
- **WHEN** the runner returns N results
- **THEN** `analysisRecorder.recordAnalysis` is called exactly N times
- **AND** no account's analysis is recorded more than once
