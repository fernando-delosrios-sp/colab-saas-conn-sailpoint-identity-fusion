# test-recording Script Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add `npm run test-recording` for offline chain golden verification, fix `npm test` chain replay failures, and preserve scenario config during CJS finalization.

**Architecture:** Extract shared verification into `chainRecordingVerify.ts`; thin CJS CLI spawns tsx runner; refactor Vitest to use temp fixtures; fix finalize CJS config merge.

**Tech Stack:** TypeScript, Vitest, Node.js 24, tsx (via npx), existing ChainRunner/ReplayAdapter harness

**References:**
- Design: [design.md](./design.md)
- Tasks: [tasks.md](./tasks.md)
- Specs: [specs/testing/spec.md](./specs/testing/spec.md), [specs/recording-service/spec.md](./specs/recording-service/spec.md)

---

## Task 1: chainRecordingVerify module

- [ ] **Step 1:** Create `src/operations/__tests__/chain/harness/chainRecordingVerify.ts` — define `ChainVerifyResult` with `success`, `stepsFailed`, `stepResults`, `drifts[]`
- [ ] **Step 2:** Move `registerAllStepFns()` body from `chain.replay.test.ts` into exported `registerChainStepFns()` (same operation handlers)
- [ ] **Step 3:** Implement `verifyChainRecording(scenarioPath)`:
  ```typescript
  registerChainStepFns()
  const runner = new ChainRunner(scenarioPath)
  const results = await runner.executeAll()
  // for each step with expectedOutput, compareOutputs → collect drifts
  return { success: results.success && drifts.length === 0, ... }
  ```
- [ ] **Step 4:** Export types and functions; no vitest imports in module (runner uses vi from globals when called from tests)

---

## Task 2: Refactor chain.replay.test.ts

- [ ] **Step 1:** Remove `availableRecordings()` and `it.each` over recordings/
- [ ] **Step 2:** In `beforeAll`, create temp dir with minimal scenario (1 step, `testConnection`, `expectedOutput`, `config: { sources: [] }`)
- [ ] **Step 3:** Test `verifyChainRecording(tempScenarioPath)` returns success with zero drifts
- [ ] **Step 4:** Test `compareOutputs` detects drift with inline data (no file I/O)
- [ ] **Step 5:** Test scenario structure validation against temp fixture
- [ ] **Step 6:** `afterAll` cleanup temp dir
- [ ] **Step 7:** Run `npm test -- src/operations/__tests__/chain/chain.replay.test.ts` — confirm pass

---

## Task 3: test-recording CLI

- [ ] **Step 1:** Create `scripts/test-recording.js` mirroring `replay-chain.js`:
  - `listAvailableChains()` — dirs with `scenario.json`
  - `validateChain(chainName)` — exists, has steps
  - Auto-finalize from steps if scenario missing (reuse `finalizeChainArtifacts`)
  - Spawn `npx tsx scripts/test-recording-runner.ts <safeName>`
- [ ] **Step 2:** Create `scripts/test-recording-runner.ts`:
  ```typescript
  import { verifyChainRecording } from '../src/operations/__tests__/chain/harness/chainRecordingVerify'
  import { recordingChainDir } from '../src/data/recordingPaths'
  const chainName = process.argv[2]
  const scenarioPath = path.join(recordingChainDir(chainName), 'scenario.json')
  const result = await verifyChainRecording(scenarioPath)
  // print per-step PASS/FAIL/DRIFT
  process.exit(result.success ? 0 : 1)
  ```
- [ ] **Step 3:** Add script to `package.json`
- [ ] **Step 4:** Smoke test: `npm run test-recording -- fernando` (verify output format even if chain stale)

---

## Task 4: Fix finalize-chain-artifacts.cjs

- [ ] **Step 1:** In `buildScenario()`, before writing config:
  ```javascript
  let config = {}
  const scenarioPath = path.join(dir, 'scenario.json')
  if (fs.existsSync(scenarioPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'))
      if (existing.config && Object.keys(existing.config).length > 0) {
        config = existing.config
      }
    } catch { /* ignore */ }
  }
  ```
- [ ] **Step 2:** Add test in `recordingService.test.ts` or a small script test documenting expected behavior
- [ ] **Step 3:** Verify record-chain exit path no longer clobbers config (manual or unit assertion)

---

## Task 5: Documentation and final verification

- [ ] **Step 1:** Update README Chain recording section:
  - `npm run replay` — live connector debug (unchanged)
  - `npm run test-recording -- <chain>` — offline golden verification
  - `npm test` — harness unit tests only
- [ ] **Step 2:** Run `npm test` — full suite green
- [ ] **Step 3:** Run `npm run lint` on changed files
