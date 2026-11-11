## Context

Identity Fusion provides an **Aggregation batch size** (`accountLimit`) feature per managed source to throttle initial account onboarding across multiple aggregation runs. 
Currently, the connector queries ISC using `sorters = 'id'`, which sorts accounts by arbitrary UUID hex values. When accounts are added or removed during the onboarding lifecycle, accounts can shift across batch boundaries. Furthermore, transient API drops can cause `batchCumulativeCount` to regress, and documentation warns against running the feature with dynamic datasets.

## Goals / Non-Goals

**Goals:**
- Guarantee stable, deterministic account ordering using `created,id` sorting on ISC account fetch queries specifically when batch onboarding mode is active.
- Preserve fast primary-key `id` sorting for standard full aggregations without batching.
- Ensure `batchCumulativeCount` is strictly monotonic so temporary fetch drops cannot roll back onboarding progress.
- Record creation timestamp checkpoints alongside cumulative counts for auditability and prefix drift detection.
- Eliminate documentation warnings claiming dynamic account changes cause skipped accounts.

**Non-Goals:**
- Forcing `created,id` sort overhead on full aggregations where boundary displacement cannot occur.
- Non-cumulative delta fetching: Daily production aggregations must continue to fully reconcile all accounts in ISC.
- Changing the schema or connector attribute storage format in a breaking way (timestamp checkpoint will be an optional companion attribute).

## Decisions

### D1: Conditional Sort Order (`accountLimit != null ? 'created,id' : 'id'`)
- **Choice**: When fetching accounts in `SourceService.fetchAccountsBySourceIdGenerator` and `fetchAccountsBySourceId`, evaluate whether the target source has an `accountLimit` configured:
  - If `accountLimit` is defined (batch mode): use `sorters = 'created,id'`. The immutable `created` timestamp ensures accounts stay in place and new accounts append at the tail, while `id` breaks ties.
  - If `accountLimit` is not defined (full aggregation): use `sorters = 'id'`. This leverages ISC's native primary key index for optimal database performance.
- **Reason**: Full aggregations ingest 100% of accounts into memory; arrival order has zero impact on matching or attribute blending. Forcing `created,id` on millions of accounts when batching is disabled would impose unnecessary database sorting load on ISC.
- **Considered alternatives**:
  - Unconditional `sorters = 'created,id'`: Rejected to avoid unnecessary sort overhead on full runs.
  - Unconditional `sorters = 'id'` (status quo): Rejected because random UUIDs scramble batch boundaries during progressive onboarding.

### D2: Monotonic Cumulative Count Assignment
- **Choice**: Compute `batchCumulativeCount[source.name] = Math.max(batchCumulativeCount[source.name] ?? 0, collectedCount)` in `managedAccountFetcher`.
- **Reason**: If a transient network glitch, rate-limit cutoff, or temporary ISC issue causes a run to collect fewer accounts than a previous run, the recorded progress must never roll backward.
- **Considered alternatives**:
  - Direct assignment (`batchCumulativeCount[source.name] = collectedCount`): Rejected because it allows progress regression on transient drops.

### D3: Companion Creation-Timestamp Checkpoint
- **Choice**: Store `batchWatermarkCreated?: Record<string, string>` alongside `batchCumulativeCount` under connector attributes.
- **Reason**: Recording the `created` ISO timestamp of the newest account collected provides a verification checkpoint to ensure prefix integrity across runs.
- **Considered alternatives**:
  - Relying solely on count: Count alone cannot detect if one account was deleted and another added simultaneously.

## Risks / Trade-offs

- [Risk] An ISC tenant or custom source type might have indexing limitations on `created` sorting -> Mitigation: Only applied to batch-limited sources; regular full aggregations remain on the standard `id` sort.
- [Trade-off] Multi-run onboarding is cumulative $O(N^2)$ across all onboarding runs -> Reason for acceptance: Necessary to adhere to ISC full account reconciliation and avoid premature deletion pruning in Identity Fusion.

## Migration Plan

- Non-breaking update: Deploy connector with conditional `sorters` logic and monotonic assignment.
- Existing persisted `batchCumulativeCount` values remain valid and continue incrementing smoothly.
- Update documentation and ubiquitous language specs.

## Open Questions

None.
