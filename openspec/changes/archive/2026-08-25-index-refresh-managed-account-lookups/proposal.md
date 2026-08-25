## Why

Refresh phase re-blends managed source accounts onto persisted Fusion rows by walking the **entire** managed-account work queue for every Fusion account that carries `previousAccountIds` or `missingAccountIds`. At scale (tens of thousands of managed accounts × thousands of Fusion rows), this dominates CPU and explains throughput far below API rate limits. Targeted key lookups reduce work to O(keys per fusion account) without changing blending semantics.

## What Changes

**`processPreviousRunMatchedAccounts` lookup strategy**
- From: Full scan `queue.entries()` with membership filter on previous/missing sets
- To: Iterate union of `previousAccountIds` ∪ `missingAccountIds`; `queue.get(id)` for each key
- Reason: Same outcomes when keys are composite managed account keys; eliminates O(queue) per fusion row
- Impact: Large Refresh throughput improvement when queue is large and fusion rows carry historical keys

**Queue scan metric (when instrumentation present)**
- From: `onQueueScan` reports full queue size per fusion account
- To: Reports count of keys examined (union size), not queue.size
- Reason: Accurate before/after signal for this optimization

**Unchanged**
- `processIdentityMatchedAccounts` (identity index path)
- `processDeclaredAccountIds` (declared ID list — separate optimization for snapshot scan)
- Claim/prune/missing-account preservation logic
- Fusion parallel batch cap (12)

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `fusion-service`: Managed-account layer blending uses targeted queue lookups for previous/missing keys

## Impact

- **Code:** `src/model/fusionLayers.ts`, tests under `src/model/__tests__/` or `fusionService` integration tests
- **Behavior:** Same blended accounts and queue claims; different iteration order (key-driven vs queue-driven) — order must not affect final account sets
- **Risk:** MED — incorrect key normalization could miss re-blends

## Apply status

- **Status**: APPLIED
- **Depends on**: instrument-account-list-refresh
- **Issue**:
