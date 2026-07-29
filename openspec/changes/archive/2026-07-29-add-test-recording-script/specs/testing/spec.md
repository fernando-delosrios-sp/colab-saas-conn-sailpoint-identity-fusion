## ADDED Requirements

### Requirement: Chain recording verification CLI SHALL run offline golden replay

The project MUST provide an npm script `test-recording` that verifies a named chain recording offline without running the full Vitest suite. The script SHALL accept a chain name argument, validate required artifacts exist under `recordings/{chainName}/`, auto-execute all steps in `scenario.json`, compare outputs against recorded goldens, print per-step drift details, and exit with a non-zero status when any step fails or drift is detected.

#### Scenario: Verify named recording succeeds
- **GIVEN** a chain directory `recordings/my-chain/` with valid `scenario.json` and matching goldens
- **WHEN** a developer runs `npm run test-recording -- my-chain`
- **THEN** all steps execute automatically
- **AND** the command exits with code 0
- **AND** output includes a per-step pass summary

#### Scenario: Verify named recording reports drift
- **GIVEN** a chain directory with `scenario.json` where replay outputs differ from `expectedOutput`
- **WHEN** a developer runs `npm run test-recording -- my-chain`
- **THEN** drift lines are printed for affected steps
- **AND** the command exits with a non-zero status

#### Scenario: Verify missing chain fails clearly
- **GIVEN** no directory `recordings/unknown-chain/`
- **WHEN** a developer runs `npm run test-recording -- unknown-chain`
- **THEN** the command prints an error indicating the chain was not found
- **AND** exits with a non-zero status

---

## MODIFIED Requirements

### Requirement: ReplayAdapter SHALL delegate to the real pipeline

The `ReplayAdapter` MUST execute operations through the real `ServiceRegistry` and `PipelineRunner` instead of re-implementing pipeline phase logic. The adapter SHALL configure `ReplayApiAdapter` with prerecorded API responses and capture `res.send()` outputs for comparison against recorded goldens.

Chain replay Vitest tests MUST NOT auto-discover or replay artifacts from the local `recordings/` directory. Tests SHALL validate harness mechanics (ChainRunner, compareOutputs, scenario structure) using self-contained fixtures that do not depend on developer-local recording artifacts.

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

#### Scenario: Chain replay tests do not scan local recordings
- **GIVEN** a developer has local artifacts under `recordings/` that are incomplete or stale
- **WHEN** `npm test` runs the chain replay test file
- **THEN** tests pass without reading from `recordings/`
- **AND** harness behavior is validated against a minimal temp fixture
