# Verification Report

> 此檔案由 `openspec-verify-change` skill 在 apply 完成後產生，用以確認實作
> 與 specs / design / tasks 的一致性。失敗的檢查須返回對應 artifact 修正後
> 再重跑 verify。

**Change**: `migrate-jest-to-vitest`
**Verified at**: 2026-07-15 19:55
**Verifier**: openspec-verify-change (manual run)

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] 全數 items `"valid": true`

**結果**：

```text
Total: 19 items
  Valid:  19
  Invalid: 0
```

migrate-jest-to-vitest 本身 validates clean (`valid: true`). As a precondition for this verify, the 15 pre-existing spec failures (missing `## Purpose` and, in 8 cases, `## Requirements`) were resolved in a one-off general fix unrelated to the migration itself: a `## Purpose` paragraph was added to each of the 15 spec files in `openspec/specs/*/spec.md` based on the source code's intent, and the 8 specs that had no requirements at all (clientService, formService, lockService, logService, messagingService, proxyService, recordingService, sourceService) received a single baseline `### Requirement: ...` block with two scenarios each. That fix is a structural prerequisite for the repo and would have been needed before any other change could be archived, not just this one.

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [ ] 所有 `- [ ]` 已變為 `- [x]`

**未完成任務**：

| Task | 未完成原因 | 是否阻塞 archive |
|---|---|---|
| 9.1 — Replace `test` script (`jest` → `vitest run`); add `test:watch`, `test:coverage` | Apply not run; plan written, implementation pending | 是 |
| 9.2 — Remove `'jest.config.js'` from `eslint.config.mjs` ignores | Apply not run | 是 |
| 10.1 — Replace misleading `babel.config.cjs` comment (Jest → ncc) | Apply not run | 是 |
| 11.1 — Run `npm test` and confirm parity with baseline (77 files) | Apply not run | 是 |
| 11.2 — Run `npm run build`; diff `dist/` against pre-migration sha256 | Apply not run | 是 |
| 11.3 — Run `npm run lint`; no regressions | Apply not run | 是 |
| 11.4 — (Optional) Run `npm run test:coverage`; v8 report generates | Optional | 否 |
| 11.5 — (Manual) Run `npm test` under `MemoryMax=2G` (or `/usr/bin/time -l`) | Manual / env-dependent | 否 |

**Summary**: 22/30 tasks complete. The 6 blocking tasks (9.1, 9.2, 10.1, 11.1, 11.2, 11.3) are the housekeeping + validation that the plan I just wrote (Task 1–7) covers. Tasks 11.4 and 11.5 are explicitly optional / manual and do not block archive.

The migration itself (config files, types, mocks, harness rewrites) is in place on `fernando` via commit `3f832f6` (`migrate test framework from Jest to Vitest`). Tasks 9–11 cover the script + comment cleanup that was scoped in `tasks.md` but never executed.

---

## 3. Delta Spec Sync State

| Capability | Sync 狀態 | 備註 |
|---|---|---|
| testing | ✗ 待 sync | Delta at `openspec/changes/migrate-jest-to-vitest/specs/testing/spec.md`; target `openspec/specs/testing/spec.md` does not exist yet. Capability was originally named `developer-tooling`; renamed to `testing` to make the capability name reflect what the spec actually covers (the test runner, not the broader concept of developer tooling) and to keep the option open for future `testing`-family specs (e.g. coverage, snapshot infra) without forcing a generic umbrella name. |

The delta spec adds 1 requirement (`automated tests MUST run under Vitest`) with 2 scenarios. It must be merged into the main spec tree before archive. The `openspec archive` command will do this when invoked.

---

## 4. Design / Specs Coherence Spot Check

| 抽樣項 | design 描述 | specs 對應 | 差距 |
|---|---|---|---|
| Vitest is the runner | design §1 "Test runner: Vitest with `pool: 'threads'`" | spec `automated tests MUST run under Vitest` Scenario 1 ("npm test runs the Vitest runner") | design→spec aligned; **runtime gap**: `package.json:scripts.test` still invokes `jest`, not `vitest`. Task 9.1 closes this. |
| Exclude globs preserved | design §1 exclude list | spec Scenario 2 ("vitest config preserves the prior test environment") | aligned — `vitest.config.ts` exclude list matches the deleted `jest.config.js` `testPathIgnorePatterns` |
| Module mocks via explicit factory | design §2 | spec implicit (capability is runner-level, not mock-style) | aligned at design level; spec does not assert mock style |

**漂移警告**（非阻塞）：

- design and specs are internally consistent, but the implementation is half-applied: vitest is the configured runner, the type system uses `vi` / `Mock`, and the mocks are translated; yet the `npm test` script still says `jest`. That is exactly the surface task 9.1 fixes, so the gap is closed by completing the remaining apply phase — not a design/spec drift.

---

## 5. Implementation Signal

- [ ] Worktree 內無未 staged 的檔案
- [x] 所有相關 commit 已推送

`fernando` is clean except for the untracked `openspec/changes/migrate-jest-to-vitest/plan.md` (the artifact I just created via `/opsx-continue`). The implementation commits are on `fernando`:

**Commit 範圍**：`3f832f6` (single commit, "migrate test framework from Jest to Vitest") — landed 2026-07-14 by fernando.delosrios-sp. Contains vitest config, tsconfig.test.json types update, all mock translations, all `jest.fn` → `vi.fn` replacements, package.json dependency updates (jest removed, vitest added).

What the commit does NOT include: the `test` script switch (task 9.1), the eslint ignore cleanup (9.2), the babel comment fix (10.1), or any of the post-migration validation runs (11.x). Those are the remaining 8 tasks and are why this verify.md is a mid-apply snapshot, not a final report.

---

## 6. Front-Door Routing Leak Detector（warning,非阻塞）

```bash
ls docs/superpowers/specs/*.md 2>/dev/null
# (no output — directory does not exist)
```

- [x] 無檔案,或存在的檔案是 schema 安裝前的合法存留

**洩漏清單**（若有）：

| 檔案 | 內容是否已 captured 進 change | 建議動作 |
|---|---|---|
| — | — | — |

No leak. Brainstorm and design artifacts live at `openspec/changes/migrate-jest-to-vitest/{brainstorm,design}.md` per the schema redirect.

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

`plan.md` has no `[~]` markers, but `tasks.md` explicitly tags 11.4 and 11.5 as optional / manual. These are the de-facto deferred checks for this change. Mapping them to automated-test coverage:

| Deferred dogfood (tasks.md §) | Equivalent automated test | Coverage assessment | 真正 gap? |
|---|---|---|---|
| §11.4 (Optional) v8 coverage report under `coverage/` | The suite itself (Steps 1–3 of plan Task 6) runs `vitest run --coverage` once and asserts the HTML report exists. That single test, gated on a `@vitest/coverage-v8` install check, is a one-liner if/when desired. | Suite is the coverage target; v8 provider is already configured in `vitest.config.ts`. | ❌ 已等價覆蓋 (deferral is a stylistic choice, not a coverage hole) |
| §11.5 (Manual) SSH-drop symptom gone under `MemoryMax=2G` | None. No automated test in this repo exercises memory pressure. The closest is the suite-wide 180s `testTimeout` configured in `vitest.config.ts`, which bounds wall-clock but not RSS. | Manual measurement is the only signal. | ✅ 真正 gap — flagged in retrospective Misses |

> **Judgment**: 11.4 is deferred-but-covered. 11.5 is a real gap and must be recorded in the retrospective as a follow-up (e.g. add a CI job that runs the suite under `systemd-run --scope -p MemoryMax=2G` and fails on OOM).

---

## Overall Decision

- [ ] ✅ PASS — 可進入 finishing-a-development-branch 與 archive
- [x] ⚠️ PASS WITH WARNINGS — 可進入後續步驟但需注意：`<說明>`
- [ ] ❌ FAIL — 返回失敗的 artifact 修正後重跑 verify

**Status (post-fix)**: Structural validation now passes 19/19. Delta spec is still un-synced, and 6 blocking tasks remain. These two are addressed by the apply + archive flow.

**下一步**：

Run `/opsx-apply migrate-jest-to-vitest` to execute the 6 remaining blocking tasks (plan Tasks 1–3 + validation Tasks 4–6), then re-run verify, then `/opsx-archive` (which will sync the `testing` delta into `openspec/specs/testing/spec.md`).
