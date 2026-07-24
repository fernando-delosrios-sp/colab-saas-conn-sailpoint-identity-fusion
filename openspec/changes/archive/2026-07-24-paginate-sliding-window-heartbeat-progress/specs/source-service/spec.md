## ADDED Requirements

### Requirement: Managed-account parallel fetch SHALL report page-level progress to the operation heartbeat

When fetching managed accounts via parallel offset pagination, `SourceService` SHALL wire pagination `onPageProgress` so that `LogService.setProgress` is invoked after each page completes with unit `fetched`, using the aggregate loaded count across all in-flight managed sources when multiple sources fetch concurrently.

#### Scenario: Aggregate fetch progress advances on each page completion

- **GIVEN** `fetchManagedAccounts` loading two sources concurrently via parallel pagination
- **WHEN** any managed-source page completes
- **THEN** `setProgress` SHALL be called with an updated aggregate loaded count
- **AND** the progress unit SHALL be `fetched`
- **AND** the total SHALL reflect known `X-Total-Count` sums when all active sources have known totals

#### Scenario: Single large source shows incremental heartbeat progress

- **GIVEN** a managed source with more than 1000 accounts fetched via parallel pagination
- **AND** heartbeat interval 10 seconds
- **WHEN** Fetch phase runs long enough for multiple STATUS ticks
- **THEN** pipeline progress delta for unit `fetched` SHALL increase on more than one tick before the source completes
- **AND** increases SHALL correspond to page completions rather than only multi-thousand-account batch jumps
