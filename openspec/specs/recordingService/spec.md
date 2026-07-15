# recordingService Spec

## Purpose

The recording service (`src/services/recordingService.ts`) is the test-side replay fixture system. It captures chain executions to disk as JSON files and rehydrates them for deterministic replay, so the test suite can assert on a recorded real run without re-hitting the upstream. This spec defines the contract for the on-disk record format, the lookup keys (chain name + scenario), and the playback guarantees the test framework depends on.

## Requirements

### Requirement: Recorded chain executions MUST be replayable as deterministic test fixtures

The recording service MUST capture chain executions to disk as JSON files and rehydrate them for replay. The on-disk format MUST be keyed by `(chain name, scenario)` and MUST be stable across runs so a recorded fixture continues to assert the same behavior as long as the connector code matches the recorded shape.

#### Scenario: A recorded fixture replays deterministically

- **GIVEN** a JSON fixture recorded for `(chain: 'linkAccount', scenario: 'happy-path')`
- **WHEN** the test suite replays the fixture
- **THEN** every chain step is invoked with the recorded inputs
- **AND** the recorded outputs are returned to the test code, bypassing the live upstream
- **AND** the replay completes in O(recorded-step-count) without network I/O
