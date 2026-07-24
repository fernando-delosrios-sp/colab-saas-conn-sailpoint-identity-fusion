# Hydrate Correlated Orphan Identities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hydrate out-of-scope identities only for correlated orphan managed accounts and apply the identity layer when the correlated sweep creates new Fusion accounts, so the display-attribute override writes the identity alias.

**Architecture:** Remove fetch-phase hydration. Narrow the helper to collect `identityId`s from queue entries with `uncorrelated === false` after refresh. Run hydration in processPhase before the correlated sweep. Apply `addIdentityLayer` in the MatchOutcomeDispatcher correlated orphan branch after `assembleManagedAccount`.

**Tech Stack:** TypeScript, Vitest, existing `IdentityService.hydrateMissingIdentitiesById`

## Global Constraints

- Node.js 24 (`.nvmrc`)
- No new configuration surface
- Reuse `hydrateMissingIdentitiesById` (50-id chunks)
- Ubiquitous language: **identity alias** = SDK top-level `displayName`

---

## Task 1: Narrow hydration helper

**Files:**
- Modify: `src/operations/helpers/accountListPhases.ts`
- Test: `src/operations/helpers/__tests__/hydrateCorrelatedManagedAccountIdentities.test.ts`

- [ ] **Step 1:** Write failing test — helper skips managed account with `uncorrelated: true` (no `identityId` in hydrate call)
- [ ] **Step 2:** Write failing test — helper skips managed account with `uncorrelated: undefined`
- [ ] **Step 3:** Run `npx vitest run src/operations/helpers/__tests__/hydrateCorrelatedManagedAccountIdentities.test.ts` — expect failures
- [ ] **Step 4:** Update helper collection loop:

```typescript
for (const managed of deps.managedAccounts) {
    if ((managed as Account).uncorrelated !== false) continue
    const id = managed.identityId
    if (id) distinctIds.add(id)
}
```

- [ ] **Step 5:** Remove apply loop and `applied` from return type; return `{ hydrated: number }` only
- [ ] **Step 6:** Update existing tests that assert `applied` or apply behavior on helper
- [ ] **Step 7:** Run tests — expect pass
- [ ] **Step 8:** Commit: `fix(pipeline): narrow correlated identity hydration to orphans`

---

## Task 2: Remove fetch-phase call

**Files:**
- Modify: `src/operations/helpers/accountListPhases.ts`

- [ ] **Step 1:** Delete hydration block from `fetchPhase` (lines ~199–209)
- [ ] **Step 2:** Confirm fetch phase log/count output unchanged aside from hydration message
- [ ] **Step 3:** Commit: `refactor(pipeline): remove fetch-phase identity hydration`

---

## Task 3: Add process-phase hydration before correlated sweep

**Files:**
- Modify: `src/operations/helpers/accountListPhases.ts`

- [ ] **Step 1:** In `processPhase`, after `await fusion.initializeManagedAccountProcessing()` and before `log.stepStart('correlated-sweep')`, add:

```typescript
log.stepStart('orphan-identity-hydration')
const hydrationResult = await hydrateCorrelatedManagedAccountIdentities({
    managedAccounts: sources.run.managedAccountsById.values(),
    managedAccountsByKey: sources.run.managedAccountsById,
    hydrateMissingIdentitiesById: (ids) => identities.hydrateMissingIdentitiesById(ids),
})
log.info(`Hydrated ${hydrationResult.hydrated} orphan correlated identity/identities`)
log.stepEnd('orphan-identity-hydration', { hydrated: hydrationResult.hydrated })
```

- [ ] **Step 2:** Slim helper deps type — remove unused `fusionAccounts`, `getIdentity` if no longer needed
- [ ] **Step 3:** Commit: `feat(pipeline): hydrate orphan correlated identities before sweep`

---

## Task 4: Apply identity layer in correlated orphan branch

**Files:**
- Modify: `src/services/matchingService/matchOutcomeDispatcher.ts`
- Test: `src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`

- [ ] **Step 1:** Write failing test — correlated orphan (`uncorrelated: false`, not linked) with identity in run cache gets `identityInfo.displayName` after dispatch
- [ ] **Step 2:** Run failing test
- [ ] **Step 3:** In orphan branch (~line 341), after `const fusionAccount = await accountAssembly.assembleManagedAccount(account)`:

```typescript
const identityId = account.identityId
if (identityId) {
    const identity = this.deps.identities.getIdentityById(identityId)
    if (identity && !identity.protected) {
        fusionAccount.addIdentityLayer(identity)
    }
}
```

- [ ] **Step 4:** Run tests — expect pass
- [ ] **Step 5:** Commit: `feat(match): apply identity layer for correlated orphan accounts`

---

## Task 5: End-to-end alias assertion

**Files:**
- Modify: `src/operations/helpers/__tests__/hydrateCorrelatedManagedAccountIdentities.test.ts`

- [ ] **Step 1:** Update e2e test to simulate post-refresh queue (only orphan on queue) + dispatcher path or document combined test in dispatcher suite
- [ ] **Step 2:** Assert `identityAlias === 'Alice Anderson'` on orphan-derived account after layer applied
- [ ] **Step 3:** Run affected test files
- [ ] **Step 4:** Commit: `test: orphan correlated identity alias coverage`

---

## Task 6: Verify

- [ ] **Step 1:** Run `npm run lint`
- [ ] **Step 2:** Run `npx vitest run src/operations/helpers/__tests__/hydrateCorrelatedManagedAccountIdentities.test.ts src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`
- [ ] **Step 3:** Mark tasks.md checkboxes complete
