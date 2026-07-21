## Why

The current architecture mitigates Out-of-Memory (OOM) risks during aggregation by eagerly streaming and clearing accounts that don't require unique attributes before generating unique attributes for the rest. While effective, this creates a bifurcated pipeline (some accounts output in Phase 5, the rest in Phase 6). This change unifies the output stream to ensure maximum pipeline elegance while preserving the critical OOM protection mechanism. A unified JIT (Just-In-Time) generation approach guarantees every account follows an identical output path.

## What Changes

**Output Stream Unification**
- From: `uniqueAttributesPhase` eagerly streams eligible accounts to the platform via `streamAndClearEligibleAccounts`, then processes unique attributes for the leftovers.
- To: `uniqueAttributesPhase` is removed entirely. The output phase streams all accounts and evaluates unique attributes Just-In-Time exactly before serialization.
- Reason: Simplifies pipeline sequence and establishes true uniform streaming.
- Impact: Non-breaking internal architectural refactor. Memory utilization remains equally protected.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `fusion-service`: Output streaming architecture is unified and unique attribute generation becomes a JIT process during serialization, eliminating the early-send `streamAndClearEligibleAccounts` method.

## Impact

- `src/operations/helpers/corePipeline.ts`: The pipeline logic is simplified (removal of Phase 5).
- `src/services/fusionService/fusionService.ts`: `streamAndClearEligibleAccounts` is removed. Output generation (`listISCAccounts` / `forEachISCAccount` / `getISCAccount`) must ensure counters are only advanced in aggregation contexts (preventing dry-run counter burn).
- Minimal external impact, purely internal refactor. Test suites involving pipeline order will need updating.
