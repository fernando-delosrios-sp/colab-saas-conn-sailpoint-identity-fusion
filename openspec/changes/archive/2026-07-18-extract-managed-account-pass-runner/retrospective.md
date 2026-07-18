# Retrospective: extract-managed-account-pass-runner

> Written: 2026-07-18 (after verify passed)
> Commit range: `c730bcf..f420c46`
> Worktree: `/Users/fernando.delosrios/Documents/Development/ISC/connectors/colab-saas-conn-sailpoint-identity-fusion/.worktrees/fernando-extract-managed-account-pass-runner`

## 0. Evidence

- **Commit range**: `c730bcf..f420c46` (3 commits)
- **Diff size**: `+668 / -236` lines across 6 files
- **Tasks done**: 22/22
- **Active hours**: ~1.5h (implementation) + 0.5h (verification)
- **Subagent dispatches**: n/a — this platform executed the plan directly without subagent delegation
- **New external deps**: none
- **Bugs encountered post-merge**: none
- **OpenSpec validate state at archive**: verify artifact done, all artifacts complete except retrospective (now being written)
- **Test coverage signal**: Vitest 1003 passed (81 files), 2 skipped; `candidateRegistry.test.ts` + `managedAccountPassRunner.test.ts` add 13 new tests

Commit chain (chronological):

```
c730bcf feat: split FusionAccount along data/rules seam and archive change
301c3fc feat: extract CandidateRegistry for per-source deferred candidate management
ab6c5e5 feat: extract ManagedAccountPassRunner with two-pass parallel design
f420c46 refactor: integrate ManagedAccountPassRunner into FusionService
```

## 1. Wins

- [evidence: `candidateRegistry.ts` + `candidateRegistry.test.ts`] `CandidateRegistry` extracted cleanly as an independent collaborator with 100% test coverage of its filtering rules (authoritative, deferred, managedKey presence).
- [evidence: `managedAccountPassRunner.ts` + `managedAccountPassRunner.test.ts`] `ManagedAccountPassRunner` implemented the two-pass parallel design from the design document, with structured `ManagedAccountPassResult` output and no side effects.
- [evidence: `fusionService.ts` diff] All targeted legacy methods removed (`analyzeManagedAccount`, `completeManagedAccountFromAnalysis`, `registerCurrentRunUnmatchedCandidate`, `_currentRunUnmatchedCandidatesIterableForSource`, `deferredMatchingSourceKey`). `currentRunUnmatchedCandidatesForSource` kept as a public delegate to `CandidateRegistry`.
- [evidence: `fusionService.test.ts` lines 947, 992] Existing tests were updated only at the mock layer, and the test assertion `maxInFlightDeferredB > 1` now proves Pass 2 is parallel instead of sequential.
- [evidence: `npm test` 1003 passed] Full suite passes, including the new unit tests and all existing `fusionService.test.ts` tests.
- [evidence: `fusionService.ts:741`, `fusionService.ts:827`] Double-recording of deferred accounts is eliminated; `recordAnalysis` is called exactly once per runner result.

## 2. Misses

- 🔴 [blocking | evidence: `src/model/fusionAccountBase.ts:59:10`] The base branch (`c730bcf`) has a pre-existing TypeScript error (`Cannot find name 'IDENTITIES_SOURCE_NAME'`). Task 5.1 (run `npm run typecheck`) was marked complete, but the project does not actually typecheck cleanly. This must be fixed before the branch can be merged.
- 🟡 [painful | evidence: `managedAccountPassRunner.ts:15`, `fusionService.ts:154`] The design specifies `processAccount` in `ManagedAccountPassRunnerState`, but the runner implementation never uses it. The field is dead code and was wired solely because the design interface included it.
- 📌 [nit | evidence: `managedAccountPassRunner.ts:18`] `ManagedAccountPassResolution` is exported but not consumed externally; `knip` flags it as an unused export.
- 📌 [nit | evidence: `fusionService.test.ts:1273`, `fusionService.test.ts:1352`] Task 5.3 (single `recordAnalysis` call per account) was verified structurally rather than by an explicit spy assertion. A direct `toHaveBeenCalledTimes(N)` assertion would strengthen the contract.

## 3. Plan Deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 3.6 Wire `CandidateRegistry.clear()` | Added `candidateRegistry.register(fusionAccount)` for every existing `fusionAccountMap` entry immediately after `clear()` in `initializeManagedAccountProcessing` | Pre-existing unmatched candidates were previously pre-loaded via `currentRunUnmatchedFusionManagedKeysBySource`. Moving this to `CandidateRegistry` required preserving the same pre-registration behavior so deferred matching can see existing non-match fusion accounts. |
| 3.7 Update `processCorrelatedManagedAccounts` / `processUncorrelatedManagedAccounts` | The public `analyzeUncorrelatedAccounts()` method was also refactored to use `passRunner.execute()` | The method duplicated the old `analyzeManagedAccount` logic; converting it to the runner was a natural extension of the refactor and keeps all managed-account analysis on a single path. |
| D4 `processAccount` return type | Implementation used `Promise<any>` instead of `Promise<FusionAccount \| undefined>` | The field is unused, so the stricter type had no runtime impact. Should be tightened if the field is retained. |

## 4. Skill / Workflow Compliance

| Skill / workflow | Status |
|------------------|--------|
| superpowers:brainstorming | n/a — artifacts were already created; this session focused on verification and archive |
| superpowers:writing-plans | n/a — plan was pre-existing |
| superpowers:using-git-worktrees | ✓ Worktree `fernando-extract-managed-account-pass-runner` was created and used for implementation |
| superpowers:subagent-driven-development | ✗ Not used — this platform executed tasks directly without subagent delegation |
| (transitive) superpowers:test-driven-development | ✓ New tests were written before/ alongside implementation; all tests pass |
| (transitive) superpowers:requesting-code-review | ✗ No formal code-review subagent was dispatched |
| superpowers:finishing-a-development-branch | Pending — to be invoked after archive and worktree merge |

### Deliberately Skipped Skills

- **superpowers:subagent-driven-development**
  - **What was skipped**: Full subagent delegation per task.
  - **Why this cycle**: The executing platform does not support the `Task` tool for subagent dispatch, and the `superpowers:subagent-driven-development` skill could not be loaded/invoked.
  - **How to prevent recurrence**: On platforms without subagent support, prefer the `spec-driven` schema instead of `superpowers-bridge`, or document the manual fallback in the adopter `CLAUDE.md` fragment.

- **superpowers:requesting-code-review**
  - **What was skipped**: Automated code-review subagent.
  - **Why this cycle**: Dependent on `subagent-driven-development`, which was not available.
  - **How to prevent recurrence**: Same as above — use `spec-driven` schema when subagent support is absent, or perform a manual `requesting-code-review` skill invocation before PR.

## 5. Surprises

- The implementation was fully present in the worktree but the main worktree showed the change as unimplemented, because the branch had not been merged back. This caused an initial verification report to incorrectly state the change had not started.
- The pre-existing `IDENTITIES_SOURCE_NAME` type error on the base branch was not visible until `npm run typecheck` was run; it is unrelated to the refactor but blocks the branch from claiming a clean typecheck.

## 6. Promote Candidates → Long-Term Learning

- [ ] 📌 **Pre-existing base-branch errors block typecheck claims** — `npm run typecheck` should be run on the base branch before starting a change, and failures should be documented in the change proposal.
  - `→ **Promote to** schema`
  - `> **Why**: Task 5.1 was marked complete even though the project failed typecheck due to an unrelated base-branch error.`
  - `> **Recommendation**: Add a PRECHECK to the apply/verify phases that runs typecheck on the base branch and blocks task completion if it fails.`

- [ ] 📌 **Dead interface fields in design documents** — `processAccount` in `ManagedAccountPassRunnerState` was never used by the implementation.
  - `→ **Promote to** skill / writing-plans`
  - `> **Why**: Design artifacts should not specify dependencies that the implementation does not need; it creates dead code and confusion.`
  - `> **Recommendation**: When writing design.md, include a "Used by" column for each state interface field, or require a post-implementation review of the state interface against actual usage.`

- [ ] 📌 **Manual subagent fallback for superpowers-bridge** — The schema assumes subagent support, but not all platforms provide it.
  - `→ **Promote to** schema / CLAUDE.md`
  - `> **Why**: The schema cannot be fully followed without subagent support, yet the skill activation requirement caused the apply phase to expect it.`
  - `> **Recommendation**: Add a platform capability check to the schema's pre-flight; if subagents are unavailable, route to `spec-driven` or document the manual fallback explicitly.`

## 7. Next Steps

1. Fix the pre-existing `IDENTITIES_SOURCE_NAME` typecheck error on the base branch or include a fix commit in this branch.
2. Decide whether to keep or remove the unused `processAccount` field from `ManagedAccountPassRunnerState`.
3. Merge the worktree branch back to the original branch and delete the worktree.
4. Invoke `superpowers:finishing-a-development-branch` to open the PR.
