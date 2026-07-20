## Why

The current `map-define-match` codebase contains several maintainability and performance bottlenecks that complicate readability and slow down the matching operations. Specifically, there are mismatched phase numbers in pipeline comments, scattered environment checks, unnecessary delegation wrappers, and unused linear scan logic that introduces O(n) array allocations on hot paths. Cleaning up this technical debt will lead to a more robust, comprehensible, and performant connector.

## What Changes

**Centralize Environment Flags**
- From: Scattered `process.env.RECORD_MODE` checks across multiple files.
- To: A centralized `isRecordMode` boolean initialized once on the `run` model and referenced throughout.
- Reason: Improves testability and avoids repeated env-lookups.
- Impact: Non-breaking internal refactor.

**Remove Dead Code and Bottlenecks**
- From: `hasEquivalentManagedAccountId` bottleneck and set spreading in hot paths.
- To: `hasEquivalentManagedAccountId` deleted entirely, set spreading replaced with O(1) loop lookups.
- Reason: Eliminates unnecessary overhead.
- Impact: Performance improvement, no external behavior change.

**Simplify Service Interactions**
- From: `FusionService` has many single-line wrapper methods delegating to the outcome handler.
- To: Internal callers use the outcome handler directly.
- Reason: Reduces indirection and mental overhead for maintainers.
- Impact: Improved readability.

**Deduplicate Logic and Clean Up Exports**
- From: Duplicated `getManagedAccountSnapshotKey` implementations and unused exports.
- To: Consolidated shared logic and stripped dead exports.
- Reason: Single source of truth.
- Impact: Maintainability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `fusion-run`: Centralize global environment configuration checks (e.g. RECORD_MODE).
- `fusion-service`: Remove redundant delegations, streamline outcome handler usage.
- `matching-service`: Eliminate unneeded overhead during candidate iteration and remove dead match logic.
- `mapping-service`: Share deduplicated identity snapshot utilities.
- `definition-service`: Share deduplicated identity snapshot utilities.
- `service-registry`: Transition environment checks to centralized context properties.
## Impact

The refactor touches internal implementation details exclusively, primarily targeting:
- `corePipeline.ts`, `fusionRun.ts`
- `fusionService.ts`, `matchingService.ts`
- Utility functions and constants.
It yields a cleaner service registry and better performing tight loops in the match operations.
