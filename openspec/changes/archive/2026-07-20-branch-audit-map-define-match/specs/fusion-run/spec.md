## ADDED Requirements

### Requirement: FusionRun holds operation execution mode state

FusionRun SHALL contain boolean properties denoting the global execution mode of the run, specifically whether the run is executing in record mode (`isRecordMode`). This centralizes process environment variable access.

#### Scenario: FusionRun evaluates environment variables on initialization
- **WHEN** `FusionRun` is constructed
- **THEN** it reads `process.env.RECORD_MODE` exactly once and stores it in `isRecordMode`
