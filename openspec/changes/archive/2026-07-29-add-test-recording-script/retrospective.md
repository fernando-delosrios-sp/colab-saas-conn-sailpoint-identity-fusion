# Retrospective: add-test-recording-script

> Written: 2026-07-29 (after verify passed)
> Commit range: uncommitted (pre-archive worktree)
> Worktree: colab-saas-conn-sailpoint-identity-fusion

---

## 0. Evidence

- **Commit range**: uncommitted implementation (no dedicated commit yet)
- **Diff size**: ~15 new/modified source files (chain verify module, CLI script, tests, finalize fix, docs)
- **Tasks done**: 19/19
- **Active hours**: ~1 session
- **Subagent dispatches**: n/a (direct apply)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: pass (all items valid)
- **Test coverage signal**: vitest 1306 passed, 2 skipped; new `test-recording.script.test.ts` (3 cases)

---

## 1. Wins

- Separated **live replay** (`npm run replay`) from **golden verification** (`npm run test-recording`) — clear operator/AI agent workflows
- `npm test` no longer fails on local `recordings/fernando/` — chain replay uses temp fixtures only
- CJS finalize preserves connector-written `scenario.json` config — fixes silent config clobbering on record exit
- CLI integration tests cover pass, drift, and missing-chain scenarios via spawn

## 2. Misses

- 🟡 **Stale local recordings still fail verification** — `fernando` chain needs re-record after finalize fix; expected but worth documenting in README troubleshooting
- 📌 **Plan specified tsx runner** — Vitest spawn chosen instead (documented in design D2); plan.md not updated

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 2.2 test-recording-runner.ts | Vitest spawn + verifyRecording.cli.test.ts | ReplayAdapter requires `vi.fn()`; tsx runner fails outside Vitest |
| explore.test.ts | Not in plan; refactored to EXPLORE_RECORDING_CHAIN | Fixture chains from CLI tests polluted explore auto-discovery |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (captured in brainstorm.md) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:using-git-worktrees | ✗ |
| superpowers:subagent-driven-development | ✗ |
| (transitive) test-driven-development | partial |
| (transitive) requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✗ (pre-archive) |

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: Subagent-per-task execution from plan.md
  - **Why this cycle**: Single-agent apply in one session; scope was ~15 files with clear task list
  - **How to prevent recurrence**: scope-judgment rule — use subagents when plan has 5+ independent task groups touching unrelated modules

## 5. Surprises

- `vi.mock(ServiceRegistry)` in chain.replay.test broke `createTestRegistry()` with "ServiceRegistry is not a constructor" — removing the mock fixed replay
- `explore.test.ts` auto-scanning `recordings/` caused full-suite failures when CLI tests wrote `vitest-*` fixture dirs

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Chain replay tests must not scan recordings/** → **Promote to project CLAUDE.md** (testing section)
  > **Why**: Local dev artifacts under gitignored `recordings/` caused CI-local test pollution twice in this change
  > **How to apply**: When adding tests that read `recordings/`, use temp fixtures or env-gated chain names only

- [ ] 📌 **Record-chain CJS finalize must merge config** → **One-off** (fixed in finalize-chain-artifacts.cjs)
  > **Why**: record-chain.js exit handler overwrote connector scenario with empty config
  > **How to apply**: Already implemented; re-record chains to regain config
