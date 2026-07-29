# Retrospective: fix-record-mode-storage

> Written: 2026-07-29 (after verify passed)
> Commit range: uncommitted (working tree at HEAD `7c9b96e`)
> Worktree: `/Users/fernando.delosrios/Documents/Development/ISC/connectors/colab-saas-conn-sailpoint-identity-fusion`

---

## 0. Evidence

- **Commit range**: uncommitted working tree on `7c9b96e` (0 commits for this change yet)
- **Diff size**: +605 / -227 lines across 19 files (+ new files under `src/services/recordingService/`, `resolveRecordingConfig.ts`, tests)
- **Tasks done**: 29/29
- **Active hours**: ~1 session
- **Subagent dispatches**: 0 (direct apply in parent session)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none (pre-merge)
- **OpenSpec validate state at archive**: 37/37 pass
- **Test coverage signal**: 1292 vitest tests passed (+5 new recording tests)

Commit chain (chronological):

```
(uncommitted) fix record mode storage — env bridge, RecordingStore, finalize-once lifecycle
```

---

## 1. Wins

- Centralized `resolveRecordingConfig()` eliminated split-brain between `FusionRun.isRecordMode` and `ServiceRegistry` recording wiring — root cause of empty `api-log.ndjson`.
- Pluggable `RecordingStore` / `NdjsonRecordingStore` keeps persistence swappable without touching replay pipeline.
- Finalize-once lifecycle + step reload enables multi-operation chain recording (`testConnection` → `accountList`).
- Verify-driven test backfill closed scenario gaps (safeReadConfig integration, phase hook, aggregation report artifact).

## 2. Misses

- 🟡 SIGINT/SIGTERM finalize handlers intentionally disabled under Vitest — only `finalizeOnce` unit-tested, not signal path.
- 📌 Manual `npm run record` smoke not run in CI (script exit checks added as mitigation).
- 📌 Work remained uncommitted at archive time — commit before PR.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 3.3 exit handlers | Skip registration when `VITEST` set | Prevent unhandled async finalize during test suite |
| 7.2 JSDoc | `ApiLogReader` kept file-private | knip unused-export gate; interface still used internally |

## 4. Skill / workflow compliance

| Skill | Used |
|-------|------|
| superpowers:brainstorming | ✓ (artifact exists) |
| superpowers:writing-plans | ✓ (plan.md) |
| superpowers:using-git-worktrees | ✗ |
| superpowers:subagent-driven-development | ✗ |
| (transitive) test-driven-development | ✓ (tests before/alongside impl) |
| (transitive) requesting-code-review | ✗ |
| superpowers:finishing-a-development-branch | ✗ (pending post-archive) |

### Deliberately Skipped Skills

- **`superpowers:using-git-worktrees`**
  - **What was skipped**: Isolated worktree setup
  - **Why this cycle**: Single active change on existing branch; no concurrent branch work
  - **How to prevent recurrence**: scope-judgment rule — use worktrees when parallel feature branches share the repo

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: Per-task implementer/reviewer subagents
  - **Why this cycle**: Parent agent executed plan directly in one session with verify loop
  - **How to prevent recurrence**: one-off — acceptable for focused bugfix with complete plan artifacts

## 5. Surprises

- Per-operation `finalize()` in `createOperationHandler` was deleting `steps.ndjson` — regressed multi-op chain recording despite prior signal-handler fix.
- `FusionRun` reading `RECORD_MODE` directly while `ServiceRegistry` read `config.recording.mode` was the subtle split-brain bug.
- Archive initially failed on fusion-run delta spec — dropped scenario needed explicit REMOVED block.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **Always wire recording through `resolveRecordingConfig()` — never read RECORD_* env in consumers** → **Promote to memory**
  > **Why**: Split-brain between FusionRun and ServiceRegistry produced connector.log-only recordings
  > **How to apply**: Any new recording flag or mode check — grep for `process.env.RECORD` outside `resolveRecordingConfig.ts`

- [ ] 📌 **Disable process exit handlers under Vitest for recording services** → **Promote to project testing notes**
  > **Why**: `beforeExit` finalize caused unhandled rejections in unrelated tests
  > **How to apply**: Any new global process handler — gate on `process.env.VITEST`

- [ ] 📌 **MODIFIED delta specs must REMOVED dropped scenarios explicitly** → **Promote to OpenSpec workflow**
  > **Why**: Archive blocked until REMOVED block added for retired env-read scenario
  > **How to apply**: When MODIFIED requirement replaces scenarios, add matching REMOVED section before archive
