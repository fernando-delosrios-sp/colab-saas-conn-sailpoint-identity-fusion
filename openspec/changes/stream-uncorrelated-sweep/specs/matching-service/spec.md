## ADDED Requirements

### Requirement: MatchOutcomeDispatcher SHALL support chunked progress windows in runMatchSweep

`MatchOutcomeDispatcher.runMatchSweep()` SHALL accept optional `progressOffset` (default `0`) and `progressTotal` (default `accounts.length`) in `MatchSweepOptions`, initialize progress at `progressOffset / progressTotal` at sweep start, and report `progressOffset + processedCount` to `log.setProgress()` across pre-score, dispatch, and deferred drain phases.

#### Scenario: Chunked runMatchSweep reports offset progress within the overall sweep total
- **GIVEN** a `MatchOutcomeDispatcher` running `runMatchSweep(chunk, batchSize, { progressOffset: 10, progressTotal: 25 })` on a chunk of `5` accounts
- **WHEN** the chunk initializes and processes its accounts
- **THEN** `log.setProgress` SHALL report progress anchored at offset `10` with total `25` and unit `'analyzed'`
- **AND** final progress for the chunk SHALL reach `15 / 25`
