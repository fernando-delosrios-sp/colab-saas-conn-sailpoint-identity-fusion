## MODIFIED Requirements

### Requirement: ReplayAdapter SHALL delegate to the real pipeline

The `ReplayAdapter` MUST execute operations through the real `ServiceRegistry` and `PipelineRunner` instead of re-implementing pipeline phase logic. The adapter SHALL configure `ReplayApiAdapter` with prerecorded API responses and capture `res.send()` outputs for comparison against recorded goldens.

#### Scenario: ReplayAdapter uses real pipeline
- **WHEN** `buildReplayContext` constructs a replay context for a step
- **THEN** it instantiates a `ServiceRegistry` via `createTestRegistry()`
- **AND** it configures `ReplayApiAdapter` with api-log entries loaded from the scenario's recorded data
- **AND** it delegates to `PipelineRunner.run()` to execute the operation
- **AND** it captures `res.send()` calls instead of manually simulating pipeline phases

#### Scenario: ReplayAdapter does not duplicate pipeline logic
- **WHEN** the real pipeline phase order changes in `corePipeline.ts`
- **THEN** replay tests continue to pass without coordinated edits to `ReplayAdapter`
- **AND** `ReplayAdapter` contains no code that re-implements phase ordering, Map/Define evaluation, or service wiring
