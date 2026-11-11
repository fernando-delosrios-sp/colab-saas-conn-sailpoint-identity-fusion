## ADDED Requirements

### Requirement: Canonical definition of Progressive Onboarding Ramp and Monotonic Cumulative Count

The ubiquitous language SHALL define **Progressive Onboarding Ramp** and **Monotonic Cumulative Count** as canonical domain terms.

#### Scenario: Progressive Onboarding Ramp definition
- **WHEN** documentation or code refers to the throttling of managed source ingestion across multiple runs
- **THEN** it SHALL use the term **Progressive Onboarding Ramp** (or **Aggregation batch size**)
- **AND** it SHALL describe it as an incremental expansion of the cumulative ingestion window rather than chunked delta batching

#### Scenario: Monotonic Cumulative Count definition
- **WHEN** documentation or code refers to `batchCumulativeCount` persistence
- **THEN** it SHALL guarantee that the recorded count is monotonically non-decreasing across runs
