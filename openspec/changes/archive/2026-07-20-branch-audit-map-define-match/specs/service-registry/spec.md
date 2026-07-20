## ADDED Requirements

### Requirement: ServiceRegistry configures services using state containers

ServiceRegistry SHALL retrieve global environment flags from centralized state containers (e.g. `FusionRun`) when configuring services, rather than querying `process.env` directly.

#### Scenario: Services are configured with central RECORD_MODE flag
- **WHEN** ServiceRegistry instantiates services dependent on record mode
- **THEN** it accesses the `isRecordMode` boolean from the execution context/run instead of `process.env.RECORD_MODE`
