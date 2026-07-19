# recording-service Spec (Delta)

## MODIFIED Requirements

### Requirement: RecordingService snapshots FusionRun instead of individual services

RecordingService SHALL capture operation state by calling run.snapshot() on the FusionRun instance, replacing the previous pattern of snapshotting SourceService, IdentityService, and FormService internals separately.

#### Scenario: startOperation receives FusionRun
- **WHEN** RecordingService.startOperation is called
- **THEN** it SHALL receive FusionRun as a parameter instead of separate sources, identities, and forms parameters
- **AND** it SHALL call run.snapshot() to capture the initial state

#### Scenario: endOperation snapshots FusionRun
- **WHEN** RecordingService.endOperation is called
- **THEN** it SHALL call run.snapshot() to capture the final state
- **AND** it SHALL NOT access individual service internals
