# Align Match Merge Terminology — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Replace assign/link/automatic-assignment vocabulary with **merge** across spec, config, code, UI strings, reports, and logs — breaking change, no aliases.

**Architecture:** Mechanical rename in layers: ubiquitous language + config keys first, then domain model (`FusionDecision`, `FusionRun`), then services (forms, matching, fusion, correlation), then reports/email, then docs/tests. Config read migrates old keys once via `migrateConfigKey`. Status wire values `authorized`/`auto` unchanged.

**Tech Stack:** TypeScript, Vitest, connector-spec.json, OpenSpec deltas in `openspec/changes/align-match-merge-terminology/`

**Reference:** `design.md`, `tasks.md`, delta specs under `specs/`

---

## Task 1: Config keys and FusionConfig

- [ ] **Step 1:** In `connector-spec.json`, rename `fusionEnableAutoAssignment` → `fusionEnableAutoMerge`, `fusionAutoAssignmentScore` → `fusionAutoMergeScore`; update labels/help to "automatic merge"
- [ ] **Step 2:** In `matchingSettings.ts`, rename fields, validation error strings, add `migrateConfigKey(raw, 'fusionEnableAutoAssignment', 'fusionEnableAutoMerge')` and same for score key; chain `fusionMergingExactMatch` → `fusionEnableAutoMerge`
- [ ] **Step 3:** Update `FusionConfig` in `config.ts` and connector initial values
- [ ] **Step 4:** Fix `matchingSettings.test.ts`; run `npm test -- src/data/config/settings/__tests__/matchingSettings.test.ts`

## Task 2: Domain model rename

- [ ] **Step 1:** `form.ts`: `automaticAssignment` → `automaticMerge`
- [ ] **Step 2:** `fusionRun.ts`: rename set/get/snapshot fields (`autoMergedIdentityIds`, `markAutoMerged`, `autoMergedIds`); update `fusionRun.test.ts`
- [ ] **Step 3:** `fusionCollections.ts`: history strings — `Auto-merged …`, `Merged record … by …`, `Merged … by …` (replace Auto-assigned / Set as authorized)
- [ ] **Step 4:** `operationRunContext.ts` + `operationHeartbeat.ts`: `autoMerged` event/counter; update tests

## Task 3: Form and matching services

- [ ] **Step 1:** `formService.ts`: `fusionMergeDecisionMap`, `getFusionMergeDecision`
- [ ] **Step 2:** `formBuilder.ts` + `helpers.ts`: merge copy; `System (automatic merge)` submitter; `automaticMerge: true`
- [ ] **Step 3:** `matchOutcomeDispatcher.ts` + `matchingService.ts`: use `fusionEnableAutoMerge`, `fusionAutoMergeScore`, `recordEvent('autoMerged')`
- [ ] **Step 4:** Run `npm test -- src/services/matchingService`

## Task 4: Fusion and correlation

- [ ] **Step 1:** Rename `authorizedLinkDecision` → `mergeDecision` in `fusionService.ts`, `decisionProcessor.ts`, `correlationManager.ts`
- [ ] **Step 2:** `fusionService/types.ts`: `merge-existing-identity`, `automaticMerge`
- [ ] **Step 3:** `fusionReportBuilder.ts` + `fusionService.ts` report state keys
- [ ] **Step 4:** Run `npm test -- src/services/fusionService`

## Task 5: Reports and email

- [ ] **Step 1:** `reportService.ts`: map to `merge-existing-identity`, `automaticMerge`
- [ ] **Step 2:** `emailService/helpers.ts`: template variables `automaticMerge`, `isAutoMerge`
- [ ] **Step 3:** Update `reportService.test.ts`, `fusionReportBuilder.test.ts`, golden chain artifacts
- [ ] **Step 4:** Run affected test files

## Task 6: Documentation and final verification

- [ ] **Step 1:** Sync `docs/concepts/glossary.md` with delta spec
- [ ] **Step 2:** Update match guides, README, account-list docs
- [ ] **Step 3:** CHANGELOG breaking-change note
- [ ] **Step 4:** `rg` audit for retired terms in `src/` and `docs/`
- [ ] **Step 5:** `npm test` && `npm run lint`
