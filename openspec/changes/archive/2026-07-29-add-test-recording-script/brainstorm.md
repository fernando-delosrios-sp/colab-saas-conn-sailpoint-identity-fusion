# Brainstorm: add-test-recording-script

## Context

Record/replay has two distinct workflows that are easy to conflate:

1. **`npm run replay`** — live connector with ISC API served from `api-log.ndjson`; operator or AI agent triggers operations manually for debugging.
2. **Chain replay verification** — auto-run recorded steps, compare outputs against goldens, fail on drift (functional regression test).

Currently `chain.replay.test.ts` auto-discovers any `recordings/*/scenario.json` and runs full replay during `npm test`. This fails when a developer has a local recording (e.g. `fernando`) with incomplete artifacts. Two root causes were identified:

- `finalize-chain-artifacts.cjs` hardcodes `config: {}`, overwriting the connector's `RecordingService.buildScenario()` output that includes full `FusionConfig`.
- Vitest scans gitignored local recordings, making CI/dev `npm test` depend on machine-local state.

## Decision chain

**Q1: Should `npm run replay` change?**
- **Decision:** No. Keep as-is for AI agents and interactive debugging.
- **Reason:** User explicitly wants replay unchanged.

**Q2: Where should manual recording verification live?**
- **Decision:** New `npm run test-recording -- <chainName>` CLI, outside the Vitest suite.
- **Alternatives considered:**
  - Run vitest with env var — awkward UX, still couples to test file.
  - Duplicate logic in CJS only — diverges from harness.
- **Chosen:** Shared TS module + thin CLI scripts (mirrors `record-chain.js` / `replay-chain.js` pattern).

**Q3: What should `npm test` do for chain replay?**
- **Decision:** Test harness mechanics only, using a minimal temp fixture — never scan `recordings/`.
- **Reason:** Local recordings are dev artifacts; regression gate is opt-in via `test-recording`.

**Q4: Script name?**
- **Decision:** `test-recording` (user choice over `verify-recording` / `verify-chain`).

**Q5: Fix config clobbering?**
- **Decision:** Yes — `finalize-chain-artifacts.cjs` must preserve existing scenario `config` when re-finalizing.
- **Reason:** Without this, re-recorded chains lack sources/config needed for replay verification.

## Design trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Shared verify module lives under `__tests__/chain/harness/` | Acceptable — imported by CLI via tsx and by unit tests |
| `test-recording` uses `npx tsx` (not a devDependency) | Matches ad-hoc script pattern; no package.json dep needed |
| Existing local recordings may still fail until re-recorded | Expected — script surfaces drift; not a blocker for `npm test` fix |
| ReplayAdapter still manual mocks (not ReplayApiAdapter) | Out of scope — verify uses existing harness |

## Agreed approach

1. Extract `chainRecordingVerify.ts` with `verifyChainRecording()`.
2. Add `scripts/test-recording.js` + `scripts/test-recording-runner.ts`.
3. Refactor `chain.replay.test.ts` to fixture-based tests.
4. Fix finalize CJS to preserve config.
5. Document in README.
