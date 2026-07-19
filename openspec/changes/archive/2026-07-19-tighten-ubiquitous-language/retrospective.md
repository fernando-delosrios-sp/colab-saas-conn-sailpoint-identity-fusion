# Retrospective: tighten-ubiquitous-language

**Change:** tighten-ubiquitous-language
**Schema:** superpowers-bridge
**Date:** 2026-07-19

---

## §0 Evidence

- **Commits:** 28
- **Files changed:** 69
- **Diff size:** +796 / -587
- **Tasks done:** 32/32 (100%)
- **Active hours:** ~12 hours (2026-07-18 18:44 to 2026-07-19 18:10)
- **Subagent dispatch count:** ~35 (implementers + reviewers + fixers)
- **New external dependencies:** 0
- **Post-merge bugs:** 0
- **OpenSpec validate state:** 33/33 items passed
- **Test coverage signal:** 1003 tests passed, 2 skipped
- **Commit chain:**
  - b73cff3 docs(spec): expand ubiquitous-language spec with canonical terms
  - 514d570 docs(spec): fix retired term and markdown formatting in ubiquitous-language spec
  - fe59ddd docs(glossary): align glossary with ubiquitous-language spec
  - c05bc1c docs(agents): add ubiquitous-language instruction for AI agents
  - c72e61e refactor(fusion): rename ManagedAccountPassRunner to ManagedAccountMatchingRunner
  - 433e181 refactor(fusion): rename analyzer methods to scoreIdentityCandidates and scoreDeferredCandidates
  - b160228 refactor(fusion): rename phaseAResults to identityResults in managedAccountMatchingRunner
  - 8661806 refactor(fusion): rename candidate type new-unmatched to deferred
  - 3179acb test(formService): fix typo in deferred candidates test name
  - 3afa57f refactor(fusion): rename correlated pre-pass to correlated account sweep
  - 7fee298 docs(ubiquitous-language): define correlated account sweep
  - c2b6c9f docs(code): update comments and log messages to use canonical terms
  - 91f5045 docs(code): fix review issues and align retired terms with ubiquitous language spec
  - be4e3ac docs(code): fix remaining Task 8 review non-canonical terms
  - 6ef07c1 docs: replace non-canonical 'identity-backed' terminology with canonical terms
  - 50f8dc5 fix: rename remaining hasIdentityBackedMatches to hasIdentityCandidateMatches in recording-service spec
  - 82f9cae docs(code): fix remaining retired traversal and account terminology in Task 8 final review
  - af68ea9 docs(code): fix remaining Task 8 retired terminology in identifiers, specs, docs, and tests
  - ad58c1c Task 8: Replace remaining 'unmatched' terminology with canonical terms
  - f105a6b refactor(fusion): canonicalize Task 8 identifier names
  - b2309ab fix(terminology): align remaining non-canonical terms in Task 8 review
  - 71ca591 chore: finalize ubiquitous-language alignment
  - d15c593 refactor(terminology): restore run/operation distinction for per-run identifiers and comments
  - 2cd8b52 fix(ubiquitous-language): align operation/run, non-matched, and retired terms
  - dc20a16 fix(recording): align recording/replay on sweep field and update terminology
  - b51bca0 fix: address minor review issues - indentation, docs terminology, ubiquitous language spec
  - 803cf6c fix(report-service): add required Purpose and Requirements sections
  - 53ed13f refactor(recording): remove backward-compatible pass alias from sweep field

---

## §1 Wins

**Subagent-driven development worked well.** The per-task implementer + reviewer pattern caught issues early (e.g., retired terms in spec definitions, grammatical errors, operation/run over-corrections). The final whole-branch review caught the recording/replay sweep field mismatch.

**Spec-first approach paid off.** Writing the master spec first gave a clear reference for all code renames and doc updates. The retired-terms table became a literal checklist for the codebase sweep.

**TDD/test discipline held.** Every symbol rename was accompanied by test updates; `npm test` remained green after each commit.

**Worktree isolation protected the main checkout.** All implementation happened in `.worktrees/tighten-ubiquitous-language`, allowing safe experimentation and review-package generation.

---

## §2 Misses

### 🟡 Painful

**Operation/run terminology was initially over-corrected.** Several per-run identifiers (`currentRunMatchScoringMs`, `clearCurrentRunState`) were renamed to `currentOperation...` before the user clarified that *run* is a valid instance term. Required a dedicated fix commit (d15c593).

**Task 8 scope expanded significantly.** The "comments and log messages" task became a broad retired-term hunt across ~49 files, including code identifiers, OpenSpec specs, and user-facing docs. Multiple review rounds were needed to reach consistency.

**Recording/replay sweep field mismatch.** The test framework was renamed to `sweep` while `recordingService.ts` still emitted `pass`. Caught late by the final whole-branch review (dc20a16).

### 📌 Nit

**Report-service spec had a pre-existing structural issue.** Missing `## Purpose`/`## Requirements` and leftover delta headers caused `openspec validate` to fail during verification (803cf6c).

**Final commit accidentally staged planning artifacts.** `6cc0180` initially included the entire `openspec/changes/tighten-ubiquitous-language/` directory; had to reset and recommit as `71ca591`.

---

## §3 Plan Deviations

**Task 8 grew beyond comments/logs.** The plan said "Update comments and log messages," but implementation revealed retired terms in identifiers (`hasIdentityBackedMatches`, `finalizeAuthoritativeUnmatched`), specs (`openspec/specs/fusion-service/spec.md`), and test fixtures. Deviated to clean all of them.

**Dead code removed.** `markAsOrphan`, `setBaseline`, and some unused exports were removed to keep `npm run lint` green. Not in the original plan, but justified by the lint gate.

**User correction added scope.** The operation/run distinction correction after Task 8 required spec/glossary updates plus code identifier renames.

---

## §4 Skill / Workflow Compliance

| Skill | Used | Notes |
|---|---|---|
| `superpowers:using-git-worktrees` | ✓ | Worktree created at `.worktrees/tighten-ubiquitous-language`. |
| `superpowers:subagent-driven-development` | ✓ | Fresh implementer + reviewer per task; final whole-branch review. |
| `superpowers:test-driven-development` | ✓ | Subagents ran tests before commits; `npm test` remained green. |
| `superpowers:requesting-code-review` | ✓ | Final whole-branch review dispatched. |
| `superpowers:finishing-a-development-branch` | ✓ | Worktree merged, branch deleted. |
| `openspec-verify-change` | ✗ (fallback) | Skill not available; ran checks manually and wrote `verify.md`. |
| `changelog-generator` | ✓ | Added entry to `CHANGELOG.md` under 2.2.0. |
| `openspec-git-discipline` | Partial | Commits follow conventional style, but no explicit git-discipline skill was invoked. |

### Deliberately Skipped Skills

- **`openspec-verify-change`**: Not available in the skill list. Fallback: ran `openspec validate --all --json`, `tasks.md` checkbox check, delta spec comparison, and front-door leak detection manually. To prevent recurrence, add `openspec-verify-change` to the project skills or document the manual fallback in `CLAUDE.md`.

---

## §5 Surprises

**"Unmatched" as a descriptive adjective was widespread.** The retired term `new-unmatched` was easy to target, but generic "unmatched" in comments, docs, and test fixtures required many rounds to align to `non-matched`.

**Generic English "pass" usages persisted.** Terms like "single pass," "cleanup pass," and "auto-repair pass" are not the retired matching-traversal term, but reviewers flagged them as potential inconsistency. We kept them where they clearly meant iteration, not matching sweep.

**Recording service had a hidden wire-format dependency.** The replay framework's `sweep` rename broke the recording emission format, showing that test infrastructure can have production-like wire contracts.

---

## §6 Promote Candidates

- [ ] 🔴 **Add a retired-term lint gate.** Several review rounds were spent catching stragglers. A CI script or pre-commit hook that greps `src/`, `docs/`, `README.md`, and `connector-spec.json` for the retired-terms table would prevent reintroduction.
  - **Why:** Manual search is error-prone and expensive; the final review still found missed terms.
  - **How to apply:** Add to the `npm run lint` pipeline or as a standalone script in `.agents/scripts/`.

- [ ] 🟡 **Document the operation/run distinction in `CLAUDE.md` or agent memory.** The initial over-correction happened because the distinction was not explicit at apply-start.
  - **Why:** Future agents may repeat the same over-correction.
  - **How to apply:** When touching identifiers containing `Run` or `Operation`, consult `openspec/specs/ubiquitous-language/spec.md` §Operation/Operation run.

- [ ] 🟡 **Add a recording/replay round-trip test.** The sweep/pass mismatch was only caught by human review.
  - **Why:** Prevents silent corruption of recorded scenarios on future terminology changes.
  - **How to apply:** Add a test that records a multi-sweep scenario and replays it, asserting `sweep` values are preserved.

- [ ] 📌 **Tighten Task 8 scope in future plans.** The task description "Update comments and log messages" under-estimated the cross-cutting nature of retired-term cleanup.
  - **Why:** Better scope definition prevents scope creep and review churn.
  - **How to apply:** Split into "retired identifiers" and "retired prose" tasks, or explicitly enumerate the retired terms to search.

---

## Forward Pointers

- None at write-time.
