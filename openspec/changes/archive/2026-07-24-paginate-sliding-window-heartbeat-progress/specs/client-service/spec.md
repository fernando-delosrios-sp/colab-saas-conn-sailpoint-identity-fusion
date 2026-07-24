## ADDED Requirements

### Requirement: Parallel pagination MUST maintain a sliding window of in-flight page requests

When `client.call()` uses `paginate: { mode: 'parallel' }`, the client service SHALL schedule page fetches with a sliding window of up to `windowSize` concurrent in-flight page requests per pagination stream, where `windowSize` is `paginate.batchSize` when set, otherwise the configured `parallelBatchSize`. When any in-flight page completes, the client service SHALL enqueue the next unresolved page offset (if any remain) without waiting for all in-flight pages in the current window to complete. Completed pages SHALL be yielded to the `AsyncGenerator` consumer in ascending offset order. Each page request SHALL inherit the caller's policy (priority, context, abortSignal, noRetry). The global `ApiQueue` SHALL continue to enforce `maxConcurrentRequests` and rate-window limits across all streams.

#### Scenario: Next page starts when a slot frees before the window completes

- **GIVEN** parallel pagination with `windowSize` 10 and multiple remaining page offsets
- **AND** nine of ten in-flight pages complete quickly while one page remains slow
- **WHEN** a concurrency slot becomes available
- **THEN** the client service SHALL schedule the next unresolved page offset without waiting for the slow page's nine fast siblings to have been part of a completed batch barrier
- **AND** total in-flight page requests for the stream SHALL NOT exceed `windowSize`

#### Scenario: Parallel pagination yields pages in ascending offset order

- **GIVEN** parallel pagination where page at offset 500 completes before page at offset 250
- **WHEN** both pages have completed
- **THEN** the generator SHALL yield the offset 250 page before the offset 500 page
- **AND** no caller-visible reordering of account batches by completion time alone SHALL occur

#### Scenario: onPageProgress fires after each page completes

- **GIVEN** a parallel paginated call with `onPageProgress` configured
- **WHEN** each page fetch completes successfully
- **THEN** `onPageProgress` SHALL be invoked with a monotonically non-decreasing loaded item count
- **AND** the callback SHALL NOT be deferred until an entire fixed batch barrier completes

---

### Requirement: parallelBatchSize MUST NOT be capped to maxConcurrentRequests at construction

`ClientService` SHALL store the configured `parallelBatchSize` (default 12) without applying `Math.min(parallelBatchSize, maxConcurrentRequests)`. The connector-spec help text SHALL describe `parallelBatchSize` as the maximum in-flight parallel pages per pagination stream and `maxConcurrentRequests` as the global concurrent HTTP limit enforced by the shared queue.

#### Scenario: parallelBatchSize greater than maxConcurrentRequests is preserved

- **GIVEN** Advanced Connection Settings with `parallelBatchSize` 16 and `maxConcurrentRequests` 10
- **WHEN** `ClientService` is constructed
- **THEN** the effective parallel pagination window size SHALL be 16 (unless overridden by `paginate.batchSize`)
- **AND** the global queue SHALL still enforce at most 10 concurrent in-flight HTTP requests across all callers
