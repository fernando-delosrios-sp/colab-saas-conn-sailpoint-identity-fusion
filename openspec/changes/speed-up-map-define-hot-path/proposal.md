## Why

Every Fusion account that goes through `AccountAssembly.applyAttributeProcessing` runs **Map** then **Normal Define**. The same recipe runs again for each managed account Match scores (`assembleManagedAccount` in `scoreIdentityCandidates` and `preScoreGate`). On a large aggregation that is thousands of Map/Define cycles, not one.

Work already done (do not redo): Velocity templates are compiled once (`templateCache`); render context is a single null-prototype `Object.assign` (archived `velocity-context-optimization`). What still dominates is per-account allocation and scans: cloning `attributeBag.current` on every `mapAttributes` (even when `needsRefresh` is false), rebuilding mapping target lists, linear snapshot search for origin/main, spreading the current bag into Velocity context, `await` on synchronous Normal definition evaluation, and debug logging that always builds strings (SDK `logger.debug` inside `evaluateVelocityTemplate` plus `JSON.stringify` of attribute values in `processNormalDefinition`).

## What Changes

**MappingService construction-time mapping plan**
- From: `getAttributeMappingTargetNames()` and `new Set([...sourceAttributes, attributeName])` on every account / every attribute
- To: Target name list and `lookupAttributeNames` stored on each `AttributeMappingConfig` when the mapping config Map is first built
- Reason: Config is fixed at construction (`mapping-service` stateless)
- Impact: Same merge results; less per-account allocation

**Per-invocation snapshot-key index**
- From: `findAccountByIdInSourceMap` walks every snapshot for origin, main, and each `mainAccount` rewrite
- To: One `Map` keyed by `getManagedAccountSnapshotKey` and trimmed `_id`, first-hit wins (same order as today’s nested loops)
- Reason: Origin/main merge strategies (`mapping-service`) look up one snapshot repeatedly
- Impact: Same chosen snapshot; O(snapshots) once per `mapAttributes`, not per lookup

**Skip current-bag clone on the no-op Map path**
- From: `{ ...attributeBag.current }` then reassign even when `needsRefresh` is false
- To: If mapping loop is skipped and `history` is empty, do not clone or reassign current; if only history needs writing, set `History` on current in place
- Reason: Clone cost scales with attribute count on every assembled account
- Impact: Same visible attributes when mapping actually runs

**DefinitionService Velocity caller context**
- From: `{ ...fusionAccount.attributeBag.current }` then attach `identity` / `accounts` / `sources` / `account`
- To: A context object whose prototype is `attributeBag.current` (or equivalent: own properties for Velocity specials, current attributes read through the prototype). Sequential definition writes still set both `fusionAccount.attributes[name]` and `context[name]`
- Reason: Shallow-copying current duplicates the whole bag per Define pass
- Impact: Same template outputs as today’s tests; do not treat later mutations of current as a new contract

**Synchronous Normal definition loop**
- From: `processNormalDefinition` is `async` and is `await`ed per definition though it never awaits I/O
- To: Synchronous `processNormalDefinition`; `refreshNormalAttributes` may stay `async` for the existing public signature
- Reason: One microtask per definition per account
- Impact: Same attribute writes and clearing behavior (`definition-service` falsy-clear requirement)

**Hot-path debug**
- From: `evaluateVelocityTemplate` always interpolates expression/result `logger.debug` lines; `processNormalDefinition` always interpolates and may `JSON.stringify` values
- To: No per-render SDK debug in `evaluateVelocityTemplate`; DefinitionService debug that includes attribute values only when `this.log.getLogLevel() === 'debug'`
- Reason: Default log level is `info` (`LogService` constructor) but callers still build the strings
- Impact: Debug aggregations still log when level is debug; production aggregations do not pay for those strings

**Unchanged**
- Merge strategy semantics (first, source, list, concatenate, Main account, Origin account)
- `onlyTargets` selective mapping
- Unique Define, counters, locks
- Null-prototype render context and helper override order
- `AccountAssembly` call order (Map → Normal Define → reverse correlation)

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mapping-service`: Construction-time lookup names; per-invocation snapshot-key index; no clone when mapping is a no-op
- `definition-service`: Caller Velocity context does not shallow-copy current; Normal definition processing is synchronous; `evaluateVelocityTemplate` is not a debug log per render

## Impact

- Code: `src/services/mappingService/mappingService.ts`, `helpers.ts`, `src/services/definitionService/types.ts`, `definitionService.ts`, `formatting.ts`
- Tests: `mapService.test.ts`, `helpers.test.ts`, `defineService.test.ts`, `formatting.test.ts` (and new cases in those files)
- Docs: changelog only unless a reference page claims Map/Define clones or logs every template
- No connector-spec keys, no migration

## Apply status

- **Status**: TODO
- **Depends on**: none
- **Issue**:
