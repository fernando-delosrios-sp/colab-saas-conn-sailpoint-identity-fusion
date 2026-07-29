## ADDED Requirements

### Requirement: ReplayApiAdapter SHALL load api-log via ApiLogReader

The client service SHALL expose an `ApiLogReader` interface for loading recorded API entries. `loadApiLog` SHALL support loading from a file path (existing behavior) and from a `RecordingStore` or manifest-declared store type. Replay setup SHALL use the manifest store type when present.

#### Scenario: loadApiLog reads NDJSON file path
- **WHEN** `loadApiLog` is called with a path to a valid `api-log.ndjson` file
- **THEN** it SHALL return an array of `ApiLogEntry` objects parsed from NDJSON lines

#### Scenario: Replay uses manifest-declared store
- **GIVEN** a chain directory with `manifest.json` declaring `store: 'ndjson'` and a non-empty `api-log.ndjson`
- **WHEN** replay mode loads the chain recording
- **THEN** all api-log entries SHALL be available to `ReplayApiAdapter`
