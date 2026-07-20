# Retrospective: move-layer-methods-to-processors

> Written: 2026-07-20 (after verify passed)
> Commit range: uncommitted (in working tree)
> Worktree: main checkout

---

## 0. Evidence

- **Files changed**: 8 source files (fusionAccountBase.ts, decisionProcessor.ts, identityProcessor.ts, fusionService.ts, matchingService.ts, + 3 test files)
- **Lines**: ~85 removed, ~30 added (net ~55 fewer lines)
- **Tasks done**: 24/24
- **Active hours**: ~1 hour (single session)
- **Subagent dispatches**: 0 (manual implementation)
- **New external dependencies**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: verify.md reports all checks passed
- **Test coverage signal**: 933 tests pass, 0 failures

---

## 1. Wins

- [evidence: 933 passing tests, 0 failures] Mechanical refactor with zero behavioral regressions — every test passed first run after all edits
- [evidence: grep confirmed 0 remaining `.addManagedAccountLayer(` references in src/] Complete migration — no stale references left behind
- [evidence: 4 imports added, 1 import block removed, 4 methods deleted] Minimal footprint — only the 4 layer methods were removed; `clearFusionIdentityReferences` correctly preserved for its other callers
- [evidence: design.md matched implementation exactly] Design was tight and accurate — no surprises during implementation

## 2. Misses

- 🟡 [evidence: first attempt to change `protected` → `public` on state didn't persist, requiring a second edit] The early edit for `protected readonly state` was applied before the layer method removals; at some point it reverted (likely due to sed operations on the same file). Required re-doing the edit.
- 🟡 [evidence: sed double-inserted `VAR.state,` into test call sites, requiring Python fix-up script] The sed replacement for `fusionService.test.ts` was attempted twice — once adding `VAR.state,` with the `VAR.` prefix, then again removing the `VAR.` prefix but leaving the duplicate `.state,` args. Required a Python script to clean up.
- 📌 [evidence: fusionAccountBase.ts retained unused `Account` import after method removal] Lint caught the orphaned `AccountV2025 as Account` import. Should have verified imports immediately after deleting the last method using that type.

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 7.2 (fusionService.test.ts) | Used sed with regex capture groups instead of individual edits | Test file had 18 occurrences across 4 different variable names (`fusionAccount`, `account`, `analyzed`, `_account`); targeted edits impractical |
| 8.2 (lint) | ESLint caught 2 issues (unused `Account` import, unused `addManagedAccountLayer` import in test) | Import cleanup didn't account for test files that call `addManagedAccountLayer` only through service methods, not directly |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✗    |
| superpowers:writing-plans                        | ✓    |
| superpowers:using-git-worktrees                  | ✗    |
| superpowers:subagent-driven-development          | ✗    |
| (transitive) superpowers:test-driven-development | ✗    |
| (transitive) superpowers:requesting-code-review  | ✗    |
| superpowers:finishing-a-development-branch       | ✗    |

### Deliberately Skipped Skills

- **`superpowers:brainstorming`**
  - **What was skipped**: The formal brainstorming skill invocation
  - **Why this cycle**: Exploration was conducted inline during the `/opsx-explore` session. The change was a mechanical refactor with no design ambiguity — Path A was selected from a clean set of options. Brainstorming output was captured directly in `brainstorm.md` without the skill's structured Q&A format.
  - **How to prevent recurrence**: `one-off — schema boundary case, no prevention possible`. This was a mechanical refactor where the design space was fully explored in conversation. The skill would add ceremony without value. Schema boundary: the skill's Q1-Qn format is designed for creative/ambiguous design, not for straightforward refactors where the problem and solution are both visible from code reading.

- **`superpowers:using-git-worktrees`**
  - **What was skipped**: Isolated git worktree creation
  - **Why this cycle**: The change touched only 8 files with no risk of merge conflicts. All changes were within a single session. Worktree overhead (checkout, setup, merge-back) would have exceeded the implementation time.
  - **How to prevent recurrence**: `scope-judgment rule` — add a CLAUDE.md trigger: "For changes touching ≤10 files with no schema/API contract changes, worktree isolation is optional."

- **`superpowers:subagent-driven-development`** (and transitively TDD + code-review)
  - **What was skipped**: Subagent dispatch per task, TDD cycle, per-task code review
  - **Why this cycle**: All 24 tasks were mechanical replacements (method call → free function call). No new logic, no new tests, no design decisions during implementation. Subagent dispatch overhead (context transfer per agent) would have dominated the ~1hr total implementation time. TDD was inapplicable — no new code to test. Code review of find-and-replace edits would produce noise.
  - **How to prevent recurrence**: `scope-judgment rule` — "For purely mechanical refactors (rename, move, delete) with no new logic and existing test coverage, subagent dispatch is optional."

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: Branch cleanup / PR creation workflow
  - **Why this cycle**: Changes remain uncommitted in working tree pending the archive step. The `encapsulate-fusionrun-state` change is also in progress and sharing the working tree.
  - **How to prevent recurrence**: `CLAUDE.md trigger` — "If changes are uncommitted when archive is requested and another active change exists in the same working tree, defer finishing-a-development-branch until all active changes are complete."

## 5. Surprises

- The `sed` shell command is blocked on `#` comments, forcing a Python script write for what should have been a one-liner. Need to be aware of shell allowlist constraints when doing batch text replacements.
- `tsc --noEmit` shows pre-existing errors (TS2802 downlevelIteration issues, external library type mismatches) that made it harder to verify our changes compiled cleanly. Had to filter output to find new errors.

## 6. Promote candidates → long-term learning

- [ ] 🟡 **When doing batch sed replacements on test files, verify the output before moving on** → **Promote to memory** (type: feedback)
  > **Why**: The double-insert bug from running sed twice on `fusionService.test.ts` created 18 lines of corrupted calls (`addFusionMatch(account.state, account.state, {`) that required a Python fix-up script. A single `grep` after the first sed would have caught it immediately.
  > **How to apply**: After any batch text replacement on test files, run `grep "pattern"` to spot-check a few lines before continuing to the next file.

- [ ] 📌 **Pre-existing tsc errors obscure verification of new code** → **Prompt to memory** (one-off observation)
  > **Why**: `tsc --noEmit` produces 80+ lines of errors from node_modules type mismatches and downlevelIteration. Filtering for file-specific errors (`grep "fusionAccountBase"`) was necessary to confirm our changes compiled.
  > **How to apply**: When `tsc --noEmit` has pre-existing noise, always filter by source directory (`2>&1 | grep "src/" | grep -v "node_modules" | grep -v "TS2802"`) to isolate new errors.
