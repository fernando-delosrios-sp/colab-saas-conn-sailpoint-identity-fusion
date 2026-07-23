# Cap Scoring Concurrency Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cap managed-account identity and deferred scoring concurrency at a configurable limit (default 12) instead of uncapped batch-size parallelism.

**Architecture:** Add `scoringMaxConcurrency` to developer settings, expose via `getScoringMaxConcurrency()` in `collections.ts`, and replace bare `Promise.all` in `scoreManagedAccounts` with existing `promiseAllBatched`. Batch grouping via `managedAccountsBatchSize` stays unchanged.

**Tech Stack:** TypeScript, Node.js, Vitest, connector-spec.json

**Change artifacts:** `openspec/changes/cap-scoring-concurrency/` (proposal, design, specs, tasks)

---

## Task 1: Developer settings and config model

**Files:**
- Modify: `src/data/config/settings/developerSettings.ts`
- Modify: `src/model/config.ts`
- Modify: `connector-spec.json`
- Test: `src/data/config/settings/__tests__/developerSettings.test.ts`

- [ ] **Step 1:** Add to `connectorSpecInitialValues`:
  ```ts
  scoringMaxConcurrency: 12,
  ```
- [ ] **Step 2:** Add to `runtimeDefaults`:
  ```ts
  scoringMaxConcurrency: connectorSpecInitialValues.scoringMaxConcurrency,
  ```
- [ ] **Step 3:** In `readSettings`, return:
  ```ts
  scoringMaxConcurrency: (raw.scoringMaxConcurrency as number | undefined) ?? runtimeDefaults.scoringMaxConcurrency,
  ```
- [ ] **Step 4:** Add `scoringMaxConcurrency?: number` to `DeveloperSettingsSection` in `config.ts`
- [ ] **Step 5:** Add test: defaults to 12 when omitted; returns configured value when set
- [ ] **Step 6:** Add to `connector-spec.json` under developer settings:
  ```json
  "scoringMaxConcurrency": {
    "type": "number",
    "title": "Scoring concurrency limit",
    "description": "Maximum concurrent identity-comparison scoring operations during managed-account analysis. Default 12. Higher values increase CPU/memory.",
    "default": 12
  }
  ```
- [ ] **Step 7:** Run `npm run typecheck`

---

## Task 2: getScoringMaxConcurrency helper

**Files:**
- Modify: `src/services/fusionService/collections.ts`
- Test: `src/services/fusionService/__tests__/collections.test.ts`

- [ ] **Step 1:** Write failing tests:
  - undefined config → 12
  - config value 5 → 5
  - config value 0 → 1
  - config value 200 → 50
- [ ] **Step 2:** Run targeted test — verify FAIL
- [ ] **Step 3:** Implement:
  ```ts
  export function getScoringMaxConcurrency(config: FusionConfig): number {
      return Math.max(1, Math.min(config.scoringMaxConcurrency ?? runtimeDefaults.scoringMaxConcurrency, 50))
  }
  ```
- [ ] **Step 4:** Run tests — verify PASS
- [ ] **Step 5:** Run `npm run typecheck`

---

## Task 3: Apply promiseAllBatched in scoreManagedAccounts

**Files:**
- Modify: `src/services/matchingService/matchOutcomeDispatcher.ts`

- [ ] **Step 1:** Add imports:
  ```ts
  import { promiseAllBatched, getScoringMaxConcurrency } from '../fusionService/collections'
  ```
- [ ] **Step 2:** After destructuring deps, add:
  ```ts
  const scoringConcurrency = Math.max(1, Math.min(batchSize, getScoringMaxConcurrency(config)))
  ```
- [ ] **Step 3:** Replace identity loop (~line 144):
  ```ts
  const identityResults = await promiseAllBatched(
      batch,
      (account) => scoreIdentityCandidates(account),
      scoringConcurrency
  )
  ```
- [ ] **Step 4:** Replace deferred loop (~lines 162–171) with `promiseAllBatched` preserving resolution logic inside callback
- [ ] **Step 5:** Run `npm run typecheck`

---

## Task 4: Match outcome dispatcher test

**Files:**
- Modify or create: `src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`

- [ ] **Step 1:** Add test with mocked deps: 50 accounts, `batchSize=50`, `scoringMaxConcurrency=5` — assert all accounts processed and sweep completes
- [ ] **Step 2:** Run `npm test -- src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`
- [ ] **Step 3:** Run full `npm test`

---

## Task 5: Final verification

- [ ] **Step 1:** Run `npm run lint`
- [ ] **Step 2:** Confirm no bare `Promise.all` in `scoreManagedAccounts` scoring loops (grep)
- [ ] **Step 3:** Confirm `connector-spec.json` field present with default 12

---

## Reference: Current vs target

| Aspect | Current | Target |
|--------|---------|--------|
| Effective scoring concurrency | `managedAccountsBatchSize` (100) | `scoringMaxConcurrency` (12) |
| Identity scoring | `Promise.all(batch.map(...))` | `promiseAllBatched(..., scoringConcurrency)` |
| Deferred scoring | `Promise.all(batch.map(...))` | `promiseAllBatched(..., scoringConcurrency)` |
| Fusion phases | capped at 12 | unchanged |

## Out of scope

- `data/config/internal/`, `clientService.ts`, `queue.ts`
- Advisor plan 002 (cheap non-match path)
- Changing `managedAccountsBatchSize` default
