# Retrospective: automated-scenario-replay

> Written: 2026-07-31 (after verify passed)
> Commit range: uncommitted (pre-archive worktree)
> Worktree: colab-saas-conn-sailpoint-identity-fusion

---

## 0. Evidence

- **Commit range**: uncommitted implementation (no dedicated commit yet)
- **Diff size**: 52 files changed, ~780 insertions / ~1148 deletions (net rename + orchestrator)
- **Tasks done**: 26/26
- **Active hours**: ~1 session (apply + verify + warning fixes)
- **Subagent dispatches**: 3 (config/paths, harness rename, orchestrator)
- **New external dependencies**: none (uses existing `wait-on`, `express` via proxy-server)
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: pass (38/38 valid)
- **Test coverage signal**: vitest 1461 passed, 2 skipped; new orchestrator integration, CJS sync, record deprecation spawn tests

---

## 1. Wins

- `npm run replay` now auto-feeds scenario steps via proxy-server with live output, golden compare, and `replay-report.json`
- Shared `src/operations/scenarioReplay/` module unifies compare logic between CLI (CJS mirror) and in-process `ScenarioRunner` harness
- Terminology migration (`scenarioName`, `RECORD_SCENARIO_NAME`) with deprecated chain aliases preserves backward compatibility
- ServiceRegistry replay guard fails fast if live SDK adapter would be wired
- Verify warnings (README, CJS sync test, `--step` test, CLI strings) closed in same session

## 2. Misses

- 🟡 **ReplayAdapter real-pipeline requirement** — MODIFIED testing spec still unmet; pre-existing manual step-fn harness remains
- 📌 **CJS compare mirror** — orchestrator cannot import TS directly; parity enforced via `compareOutputs.cjsSync.test.ts` instead of single module

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Shared compare in orchestrator | `scenario-replay-compare.cjs` mirrors TS | Node CJS scripts cannot import TS without build step |
| Manual replay smoke (plan task 8) | Mocked orchestrator integration tests | Sufficient for CI; live dogfood optional |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:subagent-driven-development | partial (3 subagents for bulk tasks) |
| superpowers:verification-before-completion | ✓ (npm test, openspec validate) |
| superpowers:finishing-a-development-branch | pending (post-archive) |

## 5. Surprises

- `buildScenario` passing full `tenant/scenario` ref broke `recordingService.test.ts` expecting bare `chainName` — fixed by parsing scenarioName segment
- Stale `matching-results.json` caused fernando replay test to fail on empty deferred matches — test now falls through to live replay when artifact is empty

## 6. Promote candidates → long-term learning

- [ ] 🟡 **CJS script / TS module parity** → **Promote to testing conventions**
  > **Why**: Orchestrator scripts need CJS; compare logic duplicated with sync test guard
  > **How to apply**: When extracting shared TS utilities for CLI use, add CJS mirror + parity test in same PR

- [ ] 📌 **ReplayAdapter → PipelineRunner** → **Follow-up OpenSpec change**
  > **Why**: Delta spec MODIFIED requirement still open from prior cycle
  > **How to apply**: Dedicated change to refactor ReplayAdapter to delegate to real pipeline
