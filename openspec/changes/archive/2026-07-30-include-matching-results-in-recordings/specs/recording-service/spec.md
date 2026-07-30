## ADDED Requirements

### Requirement: RecordingService SHALL persist matching results in record mode

When record mode is active and an account-list operation completes, RecordingService SHALL write a `reports/matching-results.json` file under the chain recording directory. The file SHALL contain identity matches, deferred matches (with per-attribute scores), analyzed non-matches, failed matching entries, and sweep summary counts when available. All payloads SHALL be JSON-serializable via `sanitizeForJson`.

#### Scenario: Matching results written after account-list in record mode
- **GIVEN** `config.recording.mode` is `'record'` and an account-list operation completes with populated tracker slices
- **WHEN** the account-list epilogue invokes matching-results persistence
- **THEN** `reports/matching-results.json` SHALL exist under the chain recording directory
- **AND** the file SHALL include `deferredMatches`, `nonMatches`, and `sweepSummary` fields

#### Scenario: Matching results omitted when not in record mode
- **GIVEN** `config.recording.mode` is `'off'` or `'replay'`
- **WHEN** an account-list operation completes
- **THEN** RecordingService SHALL NOT write `reports/matching-results.json`

---

### Requirement: Record mode SHALL enable managed-account report capture during account-list

When `config.recording.mode` is `'record'`, FusionService SHALL enable managed-account report data capture during account-list operations so `ManagedAccountAnalysisRecorder` populates tracker slices with score breakdowns.

#### Scenario: Tracker populated during record-mode account-list
- **GIVEN** a persistent account-list operation with `config.recording.mode = 'record'` and deferred matching enabled
- **WHEN** matching completes for managed accounts
- **THEN** `AggregationTracker.deferredMatchReportData` SHALL contain entries with per-attribute scores
- **AND** capture SHALL NOT require `fusionReportOnAggregation` or dry-run operation context

---

### Requirement: Manifest and scenario SHALL reference matching results path

When `reports/matching-results.json` exists at finalize time, `manifest.json` and `scenario.json` SHALL include a `matchingResultsPath` field referencing the file relative to the project root. The path SHALL appear in `manifest.artifactPaths`.

#### Scenario: Manifest declares matching results
- **GIVEN** a finalized recording with `reports/matching-results.json`
- **WHEN** `RecordingService.finalizeOnce()` completes
- **THEN** `manifest.json` SHALL include `matchingResultsPath`
- **AND** `artifactPaths` SHALL include the matching results path

#### Scenario: Scenario references matching results
- **GIVEN** a finalized recording with `reports/matching-results.json`
- **WHEN** `scenario.json` is compiled
- **THEN** `scenario.json` SHALL include `matchingResultsPath` referencing the artifact

---

## MODIFIED Requirements

### Requirement: RecordingService SHALL optionally persist aggregation report locally

When record mode is active and the aggregation report epilogue generates a report, the report payload SHALL be written to `reports/aggregation.json` in the chain recording directory. When matching results are persisted, they SHALL be written to `reports/matching-results.json` as a separate artifact. Email and ISC send behavior SHALL remain unchanged.

#### Scenario: Local aggregation report artifact written
- **GIVEN** a persistent account-list operation in record mode with aggregation report enabled
- **WHEN** the report epilogue generates the aggregation report successfully
- **THEN** the report payload SHALL be written to `reports/aggregation.json`

#### Scenario: Matching results and aggregation report coexist
- **GIVEN** a record-mode account-list operation that writes both artifacts
- **WHEN** finalize completes
- **THEN** both `reports/aggregation.json` and `reports/matching-results.json` MAY exist
- **AND** each SHALL be referenced independently in `manifest.json`
