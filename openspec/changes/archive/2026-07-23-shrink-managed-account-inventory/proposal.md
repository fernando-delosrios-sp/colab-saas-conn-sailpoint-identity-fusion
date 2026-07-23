## Why

Identity Fusion keeps two parallel maps of managed source accounts for each aggregation run: `managedAccountsById` (a mutable work queue depleted during matching and form processing) and `managedAccountsAllById` (a full snapshot of every `Account` object until output phase). Both maps hold identical references, so peak RSS retains all managed account payloads long after the work queue is empty. Replacing the full snapshot with a lightweight run inventory cuts memory without changing operator-facing behavior, while consolidating access behind typed FusionRun methods improves code readability.

## What Changes

**Managed account inventory model**
- From: `managedAccountsAllById: Map<string, Account>` duplicated on every `setManagedAccount` write
- To: `managedAccountInventory: Map<string, ManagedAccountInfo>` populated once in `setManagedAccount`, with `hasManagedAccount()` / `getManagedAccountInfo()` accessors
- Reason: Retain key presence and display metadata after work-queue depletion without holding full Account objects
- Impact: Non-breaking; same existence checks and form/report field resolution

**Single write path**
- From: `sourceService` calls `setManagedAccount` and separately `managedAccountsAllById.set`
- To: Inventory populated only inside `setManagedAccount`
- Reason: Eliminate dual-write confusion and missed sync bugs
- Impact: Non-breaking

**Fusion layer inventory access**
- From: `addManagedAccountLayer(workQueue, allAccountsById, …)` threads full Account map through accountAssembly → fusionAccount → fusionLayers
- To: Fusion layers call FusionRun inventory accessors; `allAccountsById` parameter removed
- Reason: Simpler signatures; fusion prune/preserve MUST use full run inventory, not the depleted work queue
- Impact: Non-breaking when inventory replaces snapshot semantics correctly

**Consumer migration**
- From: formService, reportService, and `resolveIscAccountIdForManagedKey` read `managedAccountsAllById`
- To: Same services use `hasManagedAccount` / `getManagedAccountInfo`
- Reason: One vocabulary for post-queue lookups
- Impact: Non-breaking

**Snapshot/restore**
- From: Snapshot serializes `managedAccountsAllById` as full Account records
- To: Snapshot serializes `managedAccountInventory` as `ManagedAccountInfo` records
- Reason: Smaller snapshots aligned with runtime memory model
- Impact: Non-breaking for recording replay paths that restore inventory metadata

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `fusion-run`: Replace `managedAccountsAllById` with lightweight inventory, accessor methods, and updated snapshot/restore fields
- `source-service`: Write managed accounts through `setManagedAccount` only; remove direct `managedAccountsAllById` writes; resolve ISC account IDs via inventory accessors

## Impact

- **Code:** `src/model/fusionRun.ts`, `src/model/fusionLayers.ts`, `src/model/fusionAccount.ts`, `src/services/sourceService/sourceService.ts`, `src/services/formService/formService.ts`, `src/services/reportService.ts`, `src/services/accountAssembly/accountAssembly.ts`
- **Tests:** `fusionRun.test.ts`, `formService.test.ts`, `accountAssembly.test.ts`, `fusionAccount.test.ts`, `reportService.test.ts`, fusion service and replay harness mocks
- **Operations:** Lower peak RSS during matching + form + output phases; no config changes
- **Dependencies:** None
