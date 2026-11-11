## Scope

Harden the managed source batch aggregation feature (`accountLimit` / **Aggregation batch size**) by sorting fetched accounts by creation order (`created,id`) when batch mode is active (and retaining fast primary-key `id` sorting for full aggregations), enforcing monotonic cumulative count tracking, persisting a creation-timestamp checkpoint, guarding against premature deletion pruning during active onboarding, and removing the inaccurate documentation warning regarding skipped accounts on dynamic datasets.

## Language

**Progressive Onboarding Ramp** (`promote`):
A configuration mechanism (`accountLimit`) that incrementally expands the cumulative ingestion window across multiple aggregation runs to onboard large managed sources without spiking memory or exceeding ISC execution timeouts.
_Avoid_: chunked aggregation, delta batching, partitioned aggregation.

**Monotonic Cumulative Count** (`promote`):
A guarantee that the high-water mark of ingested accounts (`batchCumulativeCount`) never regresses between runs due to transient fetch omissions, network timeouts, or upstream account deletions.
_Avoid_: offset drift, shrinking watermark.

**Creation Sort Order** (`draft`):
The deterministic sorting criteria (`created,id`) applied to ISC `v3/accounts` queries during batch onboarding mode, ensuring existing account offsets are preserved and newly created accounts append exclusively at the tail.
_Avoid_: arbitrary id sorting, random UUID ordering.

## Decisions

- **Context**: The current implementation always sorts by `sorters = 'id'`. Because ISC account IDs are random UUIDs, newly added accounts land randomly throughout the dataset, taking slots from batches and shifting boundaries. When an account disappears, `batchCumulativeCount` can shrink if fewer accounts are returned. Full aggregations without batching do not have boundary displacement concerns and benefit from primary-key index speed.
- **Decision 1: Conditional sort order (`accountLimit != null ? 'created,id' : 'id'`)**: When a source has an active `accountLimit` (batch onboarding mode), use `sorters = 'created,id'`. The immutable `created` timestamp ensures accounts stay in place and new accounts append at the tail, while `id` breaks ties. When no batching is configured, retain `sorters = 'id'` for maximum database index performance and efficiency during regular full aggregations.
- **Decision 2: Enforce high-water mark monotonicity**: In `managedAccountFetcher`, compute `batchCumulativeCount[source.name] = Math.max(previous, collectedCount)` to prevent transient drops from rolling back progress.
- **Decision 3: Persist `batchWatermarkTimestamp`**: Store the ISO timestamp of the newest account in the current cumulative batch for audit and integrity verification.
- **Decision 4: Protect against premature deletion pruning**: In `fusionLayers.ts` / `accountAssembly.ts`, ensure accounts from a batch-limited source currently undergoing onboarding are not pruned when an earlier account temporarily fails to return.
- **Decision 5: Reframe documentation**: Remove the warning that "accounts added or removed between runs shift the offset, causing skips". Reframe the feature as an onboarding ramp that safely supports dynamic datasets.

## Open questions

None. The cumulative mechanism design, conditional sorting, and ISC API capabilities are fully verified.

## Scenarios discussed

- **Scenario 1 (New account added during onboarding)**: A new account is created in the target source while batch onboarding is at run 2 of 5. It receives a timestamp newer than all existing accounts, placing it at the tail without displacing existing accounts.
- **Scenario 2 (Account modified during onboarding)**: An account in the first batch has an attribute changed. Its `created` timestamp is immutable; on subsequent runs, it is re-fetched at offset 0 and updated with no boundary shifts.
- **Scenario 3 (Account deleted during onboarding)**: An account in batch 1 is removed from the target source before batch 2. The cumulative fetch window expands to fetch the target limit, pulling the next chronological account into the batch. Monotonicity prevents the high-water count from shrinking.
- **Scenario 4 (Full aggregation without batching)**: A source without `accountLimit` uses `sorters = 'id'` for fast, unencumbered primary key indexing across standard runs.
- **Scenario 5 (Transient API omission during fetch)**: A network error or ISC API hiccup causes a run to collect fewer accounts. Monotonicity ensures `batchCumulativeCount` does not decrease.
