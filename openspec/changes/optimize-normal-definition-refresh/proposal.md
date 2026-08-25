## Why

Tenant configs with many Normal definitions (~17 of 22 with **Refresh on each aggregation?** enabled) pay full Define cost on **every** persisted Fusion account every aggregation, even when `needsRefresh` is false and individual definitions have `refresh: false`. Additionally, each Velocity evaluation clones the entire caller context (~22 copies/account). This aligns poorly with documented refresh semantics and amplifies Refresh CPU time beyond what expressions alone require.

## What Changes

**Per-definition refresh gate**
- From: `processNormalDefinition` never reads `definition.refresh`; all non-static definitions evaluate whenever account enters Define
- To: Skip evaluation when `!definition.refresh && !definition.static && !fusionAccount.needsRefresh && !fusionAccount.needsReset && !forceAttributeRefresh && hasExistingValue`
- Reason: Matches defining-attributes guide table
- Impact: Accounts unchanged since last run skip refresh=No definitions

**Account-level force gate**
- From: `anyNormalDefinitionRefresh` in `forceRefresh` forces Define for every account when any definition has refresh=true
- To: Remove `anyNormalDefinitionRefresh` from account-level gate; enter `refreshNormalAttributes` when `needsRefresh || forceAttributeRefresh || needsReset`; per-definition loop applies refresh rules
- Reason: Stale accounts should not run refresh=No definitions; refresh=Yes definitions still run every aggregation
- Impact: **Behavior change** for tenants relying on global re-evaluation — aligns with docs

**Render context reuse**
- From: `copyVelocityCallerContext(context)` on every `evaluateVelocityTemplate` call
- To: Build one null-prototype render context per account refresh pass; update own properties after each definition write; helpers merged once
- Reason: Removes O(definitions × attributes) copying
- Impact: Same template outputs; must preserve helper override and `$constructor` safety

**Datefns format regex cache**
- From: `buildFormatRegex` creates new RegExp per parse call
- To: Module-level cache keyed by format string
- Impact: Small win for date-heavy configs (4+ Datefns defs)

**Unchanged**
- Static definition skip for existing fusion rows
- Immutable identity/display attributes for existing rows
- Falsy-clear behavior
- Unique Define (Output JIT)
- Prototype-based `buildVelocityContext` (already landed in speed-up-map-define-hot-path)

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `definition-service`: Per-definition refresh flag honored; render context reuse during Normal Define refresh pass

## Impact

- **Code:** `definitionService.ts`, `formatting.ts`, `contextHelpers/dateUtils.ts`, tests in `defineService.test.ts`, `formatting.test.ts`
- **Docs:** Optional one-line note in defining-attributes if behavior now matches guide (may be no doc change)
- **Migration:** None — config semantics match published guide; operators with refresh=No defs should see faster Refresh

## Apply status

- **Status**: APPLIED
- **Depends on**: instrument-account-list-refresh
- **Issue**:
