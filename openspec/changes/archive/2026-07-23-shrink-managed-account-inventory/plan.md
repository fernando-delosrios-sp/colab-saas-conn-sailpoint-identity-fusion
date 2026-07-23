# Shrink Managed Account Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `managedAccountsAllById` with a lightweight `managedAccountInventory` on FusionRun, migrating all consumers to typed accessors while preserving form, report, and fusion-layer behavior.

**Architecture:** Single write path in `setManagedAccount` populates work queue + inventory. Consumers use `hasManagedAccount` / `getManagedAccountInfo`. Fusion layers use inventory keys/metadata — never the depleted work queue. Snapshot stores inventory records, not full Account objects.

**Tech Stack:** TypeScript, Vitest, FusionRun domain model, SourceService / FormService / ReportService / AccountAssembly

## Global Constraints

- No operator-facing behavior change
- No `as any` at inventory fallback boundaries
- Fusion prune/preserve MUST NOT use `managedAccountsById` after other identities may have claimed keys
- Run `npm run typecheck`, `npm test`, `npm run lint` before claiming done

---

## Task 1: FusionRun inventory foundation

**Files:** `src/model/fusionRun.ts`

- [ ] **Step 1:** Write failing test in `src/model/__tests__/fusionRun.test.ts` — after `setManagedAccount` + `claimAccount`, `hasManagedAccount(key)` is true and `managedAccountsById.has(key)` is false
- [ ] **Step 2:** Run test file; confirm failure
- [ ] **Step 3:** Add `ManagedAccountInfo` type and `managedAccountInventory` map; implement `toManagedAccountInfo`, update `setManagedAccount`, add `hasManagedAccount`, `getManagedAccountInfo`
- [ ] **Step 4:** Run test; confirm pass
- [ ] **Step 5:** Add JSDoc block documenting work queue vs inventory on FusionRun class

---

## Task 2: Snapshot/restore and remove AllById field

**Files:** `src/model/fusionRun.ts`, `src/services/sourceService/sourceService.ts`

- [ ] **Step 1:** Update `RunStateSnapshot` — replace `managedAccountsAllById` with `managedAccountInventory`
- [ ] **Step 2:** Update `snapshot()` and `restore()` to read/write inventory map
- [ ] **Step 3:** Delete `managedAccountsAllById` field from FusionRun
- [ ] **Step 4:** Remove duplicate `.managedAccountsAllById.set()` calls in `sourceService.ts` fetch paths
- [ ] **Step 5:** Implement `clearManagedAccountState()`; wire `clearManagedAccounts()` to it
- [ ] **Step 6:** Fix compile errors in snapshot tests / ReplayAdapter referencing old field

---

## Task 3: Form and report consumer migration

**Files:** `src/services/formService/formService.ts`, `src/services/reportService.ts`, `src/services/sourceService/sourceService.ts`

- [ ] **Step 1:** Update `managedAccountExists` → `run.hasManagedAccount`
- [ ] **Step 2:** Refactor `extractAccountInfoOverride`: queue `Account` for claim path; inventory `ManagedAccountInfo` for metadata return — typed, no cast
- [ ] **Step 3:** Update `reportService` `resolveAccountName` / `resolveAccountUrl` helpers
- [ ] **Step 4:** Update `resolveIscAccountIdForManagedKey` inventory fallback
- [ ] **Step 5:** Update related tests in `formService.test.ts`, `reportService.test.ts`
- [ ] **Step 6:** Remove obsolete snapshot comments in formService

---

## Task 4: Fusion layer simplification

**Files:** `src/model/fusionLayers.ts`, `src/model/fusionAccount.ts`, `src/services/accountAssembly/accountAssembly.ts`, `src/model/__tests__/fusionAccount.test.ts`

- [ ] **Step 1:** Change `_pruneDeletedManagedAccounts(inventoryKeys: ReadonlySet<string>)`
- [ ] **Step 2:** Change `_preserveMissingAccountContext(inventory: ReadonlyMap<string, ManagedAccountInfo>)` — read `sourceName` / `nativeIdentity` from info records
- [ ] **Step 3:** In `addManagedAccountLayer`, pass `workQueue` inventory via `new Set(workQueue.managedAccountInventory.keys())` or package-private accessor
- [ ] **Step 4:** Remove `allAccountsById` parameter from fusionAccount and accountAssembly signatures + call sites
- [ ] **Step 5:** Update fusionAccount tests that pass `allAccountsById` mock map

---

## Task 5: Test harness cleanup and verification

**Files:** `src/services/fusionService/__tests__/fusionService.test.ts`, `src/operations/__tests__/chain/harness/ReplayAdapter.ts`, other grep hits

- [ ] **Step 1:** Grep `managedAccountsAllById` — update each test/mock to populate `managedAccountInventory` or call `setManagedAccount`
- [ ] **Step 2:** Run `npm run typecheck`
- [ ] **Step 3:** Run `npm test`
- [ ] **Step 4:** Run `npm run lint`
- [ ] **Step 5:** Confirm grep shows zero non-test production references

---

## Task 6: Documentation

**Files:** `CHANGELOG.md`

- [ ] **Step 1:** Add internal improvement note: reduced peak RSS by replacing full Account snapshot with lightweight inventory
