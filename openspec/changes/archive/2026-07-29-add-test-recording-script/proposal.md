## Why

Chain replay verification and live replay serve different purposes, but the codebase conflates them. `chain.replay.test.ts` auto-discovers local `recordings/*/scenario.json` during `npm test`, causing failures when developers have incomplete dev recordings (currently 2/1301 tests fail). Additionally, `finalize-chain-artifacts.cjs` overwrites `scenario.json` with empty `config`, breaking replay fidelity. Developers and AI agents need a dedicated offline command to verify a named recording with clear drift output, while `npm test` must remain independent of local recording artifacts.

## What Changes

**Chain replay test isolation**
- From: `chain.replay.test.ts` scans `recordings/` and replays every discovered scenario during `npm test`.
- To: Tests validate harness mechanics using a minimal temp fixture only; no scan of `recordings/`.
- Reason: Local recordings are gitignored dev artifacts, not CI inputs.
- Impact: Non-breaking for CI; `npm test` passes without local recordings.

**New manual verification CLI**
- From: Full chain verification only available via Vitest auto-discovery.
- To: `npm run test-recording -- <chainName>` runs offline verification with per-step drift reporting and non-zero exit on failure.
- Reason: Explicit opt-in regression check for developers and AI agents.
- Impact: New npm script; `npm run replay` unchanged.

**Scenario finalization config preservation**
- From: `finalize-chain-artifacts.cjs` always writes `config: {}`.
- To: Preserve existing non-empty `config` from connector-finalized `scenario.json` when re-finalizing.
- Reason: Connector writes full `FusionConfig`; CJS overwrite destroys sources needed for replay.
- Impact: Non-breaking; improves future recordings.

## Capabilities

### New Capabilities

_(none — changes fit existing specs)_

### Modified Capabilities

- `testing`: Chain replay tests SHALL NOT depend on local `recordings/` artifacts; new requirement for standalone recording verification CLI contract.
- `recording-service`: Scenario finalization from CJS scripts SHALL preserve connector-written config when re-finalizing.

## Impact

- **New files:** `src/operations/__tests__/chain/harness/chainRecordingVerify.ts`, `scripts/test-recording.js`, `scripts/test-recording-runner.ts`
- **Modified:** `chain.replay.test.ts`, `scripts/finalize-chain-artifacts.cjs`, `package.json`, `README.md`
- **Unchanged:** `npm run replay`, `ReplayApiAdapter`, `record-chain.js` connector spawn behavior
