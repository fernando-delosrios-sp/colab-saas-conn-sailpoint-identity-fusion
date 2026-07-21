## ADDED Requirements

### Requirement: FusionRun exposes managed account processing verbs

FusionRun SHALL expose domain verbs for managed account processing state mutations required by the Match step: `queueDisableOperation(account)`, `removeMatchAccount(id)`, and `claimAccount(key, identityId)`. External code SHALL NOT directly mutate internal queues or work queues.

#### Scenario: Match module queues a disable operation
- **WHEN** `MatchOutcomeDispatcher` determines that an orphan managed account should be disabled
- **THEN** it SHALL call `run.queueDisableOperation(account)` rather than mutating a service-local queue

#### Scenario: Match module removes a managed account from the work queue
- **WHEN** `MatchOutcomeDispatcher` determines that a managed account no longer needs matching
- **THEN** it SHALL call `run.removeMatchAccount(id)` rather than directly deleting from `run.managedAccountsById`

---

### Requirement: FusionRun exposes analysis recording verbs

FusionRun SHALL expose domain verbs that hide the internal `analysisRecorder` from callers: `trackFailed(fusionAccount, message)` and any other recorder operations needed by the Match step. External code SHALL NOT directly reference `run.analysisRecorder`.

#### Scenario: Match module records a failed form
- **WHEN** `MatchOutcomeDispatcher` fails to create a review form
- **THEN** it SHALL call `run.trackFailed(fusionAccount, message)` rather than `run.analysisRecorder!.trackFailed(...)`

#### Scenario: No non-null assertions on recorder
- **WHEN** code reviews inspect Match-step code
- **THEN** there SHALL be no `run.analysisRecorder!` references

---

### Requirement: FusionRun is the only owner of managed source inventory maps

FusionRun SHALL be the single source of truth for source inventory maps such as `sourcesByName` and managed account indexes. Other services SHALL NOT maintain parallel copies of these maps that must be hand-synchronized.

#### Scenario: Matching reads source info from FusionRun
- **WHEN** `MatchOutcomeDispatcher` looks up source information for an account
- **THEN** it SHALL read from `run.sourcesByName` and not from a `SourceService`-local copy

#### Scenario: SourceService populates FusionRun
- **WHEN** `SourceService` loads managed source accounts and source metadata
- **THEN** it SHALL write the source metadata into `run.sourcesByName` rather than storing it internally
