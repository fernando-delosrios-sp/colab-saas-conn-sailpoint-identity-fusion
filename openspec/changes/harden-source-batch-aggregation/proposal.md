## Why

Managed source batch aggregation (`accountLimit`) currently sorts accounts by random UUID (`sorters = 'id'`). This causes newly created accounts to insert arbitrarily before the cumulative boundary, displacing older accounts across batch windows. Furthermore, transient API drops can roll back the saved `batchCumulativeCount`, and documentation incorrectly warns that dynamic datasets cause accounts to be skipped. Hardening this feature with conditional `created,id` sorting for batch mode (retaining fast `id` sorting for full aggregations), monotonic count persistence, and watermark checkpoints stabilizes progressive onboarding on active datasets.

## What Changes

**Managed Source Account Sorting**
- From: `sorters = 'id'` for all fetches regardless of mode.
- To: Conditional `sorters = sourceInfo.config?.accountLimit != null ? 'created,id' : 'id'`.
- Reason: During batch onboarding, newly created accounts must append to the tail rather than inserting into previously fetched prefixes and displacing accounts across batch boundaries. During regular full aggregations without batching, `sorters = 'id'` is retained for optimal primary-key database index performance in ISC.
- Impact: Non-breaking internal query optimization.

**Cumulative High-Water Mark Monotonicity**
- From: Direct assignment `batchCumulativeCount[source.name] = collectedCount`.
- To: Monotonic update `batchCumulativeCount[source.name] = Math.max(previous, collectedCount)`.
- Reason: Transient API drops or upstream deletions must not cause the recorded onboarding progress to roll backward.
- Impact: Non-breaking reliability safeguard.

**Watermark Timestamp Checkpoint**
- From: Only integer account count persisted in `batchCumulativeCount`.
- To: Persist latest seen `created` timestamp alongside the count.
- Reason: Enables verification of prefix integrity and detection of upstream missing accounts.
- Impact: Non-breaking state persistence addition.

**Documentation and Warning Removal**
- From: Warning stating the feature is only for static datasets and that additions/deletions will cause skipped accounts.
- To: Reframe as a Progressive Onboarding Ramp that safely handles dynamic datasets.
- Reason: With conditional `created,id` sorting and monotonic cumulative expansion, accounts are not skipped.
- Impact: Clarifies documentation and user guidance.

## Capabilities

### Modified Capabilities
- `source-service`: Conditional `created,id` sorting when `accountLimit` is configured, monotonic high-water mark tracking, and creation timestamp checkpointing.
- `ubiquitous-language`: Update definition of **Aggregation batch size** to remove the static-dataset limitation and describe it as a Progressive Onboarding Ramp.

## Impact

- `src/services/sourceService/sourceService.ts`: Update `sorters` parameter in `fetchAccountsBySourceIdGenerator` and `fetchAccountsBySourceId` to evaluate `accountLimit`.
- `src/services/sourceService/managedAccountFetcher.ts`: Ensure monotonic update of `batchCumulativeCount` and record creation timestamp checkpoint.
- Unit tests in `src/services/sourceService/__tests__/`: Verify `sorters: 'created,id'` when `accountLimit` is present, and `sorters: 'id'` when absent.
- Documentation in `docs/` and `openspec/specs/`: Remove the warning about skipped accounts on dynamic datasets.
