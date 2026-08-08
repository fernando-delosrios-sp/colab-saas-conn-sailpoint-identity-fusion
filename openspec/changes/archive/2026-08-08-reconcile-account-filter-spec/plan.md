# Reconcile Account Filter Spec — Implementation Plan

> **For agentic workers:** Spec-only change — no `src/` edits. Apply deltas, validate, archive.

**Goal:** Align account-list and source-service specs with fetch-time Accounts API filter behavior already implemented in code.

**Architecture:** Filtering contract lives in source-service; account-list Fetch delegates to `SourceService.fetchManagedAccounts`. Spec deltas rewrite misleading scenarios and split API vs JMESPath filter terminology.

**Tech Stack:** OpenSpec deltas, markdown specs, existing Vitest coverage as evidence.

---

## Task 1: Review and apply spec deltas

- [ ] **Step 1:** Read change deltas under `openspec/changes/reconcile-account-filter-spec/specs/`
- [ ] **Step 2:** Run `openspec validate reconcile-account-filter-spec --strict`
- [ ] **Step 3:** Fix any validation errors in delta wording (SHALL/MUST, scenario headers)

## Task 2: Archive merge

- [ ] **Step 1:** Archive change per project OpenSpec workflow
- [ ] **Step 2:** Verify merged `openspec/specs/account-list-operation/spec.md` no longer contains "invoked with filter criteria"
- [ ] **Step 3:** Verify merged `openspec/specs/source-service/spec.md` has separate API and JMESPath scenarios

## Task 3: Evidence check (no new code)

- [ ] **Step 1:** Run `npm test -- src/services/sourceService/__tests__/accountJmespathFilter.test.ts`
- [ ] **Step 2:** Confirm `buildIscAccountsQueryFilter` test covers `accountFilter` append
