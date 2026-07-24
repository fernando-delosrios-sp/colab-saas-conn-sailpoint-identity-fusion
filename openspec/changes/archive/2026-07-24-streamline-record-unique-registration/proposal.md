## Why

Record-type sources with **Include record accounts in Match** disabled exist only to reserve unique attribute values. Today each of these accounts (several thousand per aggregation) still enters the uncorrelated match sweep and runs full Map, normal Define, and reverse-correlation processing before registering values. Match scoring is skipped, but the surrounding machinery remains—wasting CPU and obscuring operation progress in logs. This change removes that overhead while preserving identical registration semantics.

## What Changes

**Record unique registration path**
- From: Record accounts with match disabled flow through `assembleManagedAccount` (full map/define) and the uncorrelated match sweep before `registerUniqueAttributes`.
- To: A dedicated bulk **record unique registration** phase runs after the correlated sweep, processes eligible accounts with selective map + register only, and removes them from the work queue before match scoring begins.
- Reason: Performance at scale (thousands of accounts); values come only from passthrough or coincident attribute maps, never from calculated defines.
- Impact: Non-breaking for operators; faster aggregations; clearer process-phase logging.

**UniqueRegistrationPlan (config index)**
- From: All attribute maps and normal definitions run for every managed account assembly.
- To: At startup, compute the intersection of unique definition names and attribute map targets; record-only path maps and registers only those names (plus passthrough when source attribute name matches).
- Reason: Avoid O(accounts × all maps × all normal defs) when only a small subset matters.
- Impact: Non-breaking; same registered values when map/passthrough preconditions hold.

**Process phase logging**
- From: Record-only CPU work appears under `uncorrelated-sweep` / `analyzed` progress, conflated with API queue stall detection.
- To: New step `record-unique-registration` with `progress=N/M registered` and optional event summary counter.
- Reason: Operators can see what phase is running and distinguish CPU registration from API queue idle.
- Impact: Log format addition only.

## Capabilities

### New Capabilities

_(none — behavior extends existing matching, definition, and account-list capabilities)_

### Modified Capabilities

- `matching-service`: Record non-match unique registration may occur in a bulk pre-pass before the uncorrelated match sweep; match-disabled record accounts SHALL NOT enter scoring or full assembly.
- `define-service`: Expose registration plan and selective registration entry points; bulk register from managed accounts without full Define evaluation.
- `account-list-operation`: Process phase gains `record-unique-registration` step with progress reporting before `uncorrelated-sweep`.
- `mapping-service`: Support selective map execution limited to registration-plan targets.

## Impact

- **Services:** `FusionService`, `MatchOutcomeDispatcher`, `DefinitionService`, `MappingService`, `AccountAssembly`
- **Operations:** `accountListPhases.ts` process phase ordering
- **Logging:** `LogService` / `OperationRunContext` step and event counters
- **Tests:** Match outcome, fusion service, definition service, account list phase tests
- **Docs:** Source configuration guide (clarify record-only path skips normal Define)
