# Account List Phase Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add STEP (and optional METRIC) boundaries for `initializeManagedAccountProcessing` and `clearManagedAccounts` so Process and Output phase wall time is fully attributable in logs.

**Architecture:** Instrumentation lives exclusively in `accountListPhases.ts` phase helpers, matching existing `log.stepStart` / `log.stepEnd` / `log.track` patterns. No service-layer changes. Spec delta updates `account-list-operation` pipeline logging requirement.

**Tech Stack:** TypeScript, Vitest, LogService STEP/METRIC line kinds

## Global Constraints

- Non-breaking, logging-only change — zero behavioral change to aggregation pipeline
- Step names: `managed-account-init`, `clear-managed-accounts` (kebab-case)
- `clear-managed-accounts` STEP emitted only when `clearManagedAccounts()` runs (non-record mode)
- Run `npm run lint` before commit

---

## Task 1: Process phase — managed-account-init STEP

**Files:**
- Modify: `src/operations/helpers/accountListPhases.ts` (~L239)

- [ ] **Step 1:** Open `processPhase` and locate the bare `await fusion.initializeManagedAccountProcessing()` call (between identity cache handling and `orphan-identity-hydration`)

- [ ] **Step 2:** Replace with wrapped call following the `record-unique-registration` pattern:

```typescript
log.stepStart('managed-account-init')
const initOp = log.track('FusionService.initializeManagedAccountProcessing')
await fusion.initializeManagedAccountProcessing()
initOp.done()
log.stepEnd('managed-account-init', { remaining: sources.run.managedAccountsById.size })
```

- [ ] **Step 3:** Run `npm test` and `npm run lint`

---

## Task 2: Output phase — clear-managed-accounts STEP

**Files:**
- Modify: `src/operations/helpers/accountListPhases.ts` (~L288-292)

- [ ] **Step 1:** Inside `outputPhase`, in the `if (!sources.run.isRecordMode)` branch where `sources.clearManagedAccounts()` is called, wrap the call:

```typescript
if (!sources.run.isRecordMode) {
    log.stepStart('clear-managed-accounts')
    const clearOp = log.track('outputPhase.clearManagedAccounts')
    sources.clearManagedAccounts()
    clearOp.done()
    log.stepEnd('clear-managed-accounts')
} else {
    log.info('Managed accounts cache retained for recording')
}
```

- [ ] **Step 2:** Confirm record-mode path unchanged (no STEP emitted)

- [ ] **Step 3:** Run `npm test` and `npm run lint`

---

## Task 3: Verification

**Files:**
- Reference: `openspec/changes/account-list-phase-instrumentation/specs/account-list-operation/spec.md`

- [ ] **Step 1:** Run full test suite: `npm test`

- [ ] **Step 2:** Run linter: `npm run lint`

- [ ] **Step 3:** Manual smoke — run accountList via `npm run dev` (no debugger attached) against tenant dataset; grep log for:
  - `STEP managed-account-init START` before `orphan-identity-hydration`
  - `STEP clear-managed-accounts START` before `form-cleanup`
  - Compare Process phase timer vs sum of logged steps (gap should shrink vs debugger-attached profile)

---

## References

- Design: `openspec/changes/account-list-phase-instrumentation/design.md`
- Spec delta: `openspec/changes/account-list-phase-instrumentation/specs/account-list-operation/spec.md`
- Bottleneck analysis: Process phase ~133s gap, Output phase ~22s possible gap
