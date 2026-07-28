# Verification Report

**Change**: `deferred-sequential-drain`
**Verified at**: 2026-07-28 14:30
**Verifier**: apply agent (opsx-verify)

---

## 1. Structural Validation (`openspec validate --all --json`)

- [x] All items have `"valid": true`

**Result**:

```text
Totals: 37 passed, 0 failed (37 items)
```

If there are failed items, list their id + issues:

| Item | Type | Issues |
|---|---|---|
| — | — | — |

---

## 2. Task Completion (`tasks.md`)

- [ ] All `- [ ]` have changed to `- [x]`

**Uncompleted tasks** (if any):

| Task | Reason for not completing | Blocks archive? |
|---|---|---|
| 4.2 Re-run local dry-run scenario (36 accounts, two passes) | Manual operator scenario; requires local dataset and two-pass dry-run | No — automated tests cover clique and two-run semantics |

---

## 3. Delta Spec Sync State

| Capability | Sync State | Notes |
|---|---|---|
| `matching-service` | ✗ To be synced | MODIFIED: deferred matching, two-sweep runner, CandidateRegistry |
| `matching-service/match-outcome-dispatch` | ✗ To be synced | MODIFIED: four outcomes, deferred drain concurrency |
| `ubiquitous-language` | ✗ To be synced | ADDED: Deferred drain, Anchor deferred candidate |

---

## 4. Design / Specs Coherence Spot Check

| Spot Check Item | design description | specs correspondence | Gap |
|---|---|---|---|
| D1 Sequential drain per source | Replace frozen parallel Pass 2 | `runDeferredDrain`, `scoreIdentityPhase` in match-outcome-dispatch spec | None |
| D2 Materialize matched pending | All matched pending on deferred match | `materializeMatchedPendingCandidates` | No dedicated test (see §7) |
| D3 Persisted never re-materialized | Skip persisted/finalized in materialization | Tier guard in `materializeMatchedPendingCandidates:717-718` | None |
| D4 originAccount keying | Registry keys prefer originAccount | `candidateRegistry.candidateKey` | Covered in `candidateRegistry.test.ts` |
| D5 Parallelism split | Identity parallel, drain sequential | Spec + `maxDeferredConcurrent <= 1` test | Cross-source parallel not implemented (spec MAY, not MUST) |

**Drift warnings** (non-blocking):

- None (task 1.2 naming resolved via `registerAnchorDeferredCandidate` alias on `FusionRun`).

---

## 5. Implementation Signal

- [ ] No unstaged files in the Worktree
- [ ] All relevant commits have been pushed

**Commit range** (if known): uncommitted working tree (no feature commits on branch yet)

**Implementation evidence** (key files):

- `src/services/matchingService/matchOutcomeDispatcher.ts` — `scoreIdentityPhase`, `runDeferredDrain` (parallel across sources), `runDeferredDrainForSource` (sequential within source), `materializeMatchedPendingCandidates`
- `src/services/matchingService/candidateRegistry.ts` — persisted/finalized/pending tiers, originAccount keying
- `src/model/fusionRun.ts` — `registerAnchorDeferredCandidate` alias
- `src/services/fusionService/fusionService.ts:1267-1272` — seeds `fusionAccountMap` + `allFusionIdentities`

**Tests**: `npm test` — 1219 passed, 2 skipped.

---

## 6. Front-Door Routing Leak Detector (warning, non-blocking)

- [x] No files

**Leak list** (if any):

| File | Is content captured in change? | Recommended Action |
|---|---|---|
| — | — | — |

---

## 7. Deferred Manual Dogfood vs Automated Test Equivalence

plan.md has no `[~]` rows. Task 4.2 is unchecked manual verification:

| Deferred dogfood (tasks §4.2) | Equivalent automated test | Coverage assessment | True gap? |
|---|---|---|---|
| 36-account two-pass dry-run | `deferredEndToEnd.test.ts` — clique (3→1+2), persisted anchor + peer cluster | Sequential drain, anchor materialization, persisted seed | ❌ Equivalently covered for core assertions; 36-account scale not reproduced |

| Spec scenario | Automated test | Covered? |
|---|---|---|
| Clique → 1 non-match + (N−1) deferred | `deferredEndToEnd` clique test | ✓ |
| Persisted anchor + peer cluster | `deferredEndToEnd` two-run test | ✓ |
| Same-sweep pair (anchor then defer) | `matchOutcomeDispatcher.test.ts` | ✓ |
| Deferred match materializes pending B | `matchOutcomeDispatcher` materializes pending peer test | ✓ |
| Cross-source parallel drain | `matchOutcomeDispatcher` parallel-across-sources test | ✓ |

---

## Overall Decision

- [ ] ✅ PASS — Can proceed to finishing-a-development-branch and archive
- [x] ⚠️ PASS WITH WARNINGS — Can proceed to next steps but please note: task 4.2 manual dry-run deferred (automated coverage in place); delta specs not yet synced (expected pre-archive); working tree uncommitted
- [ ] ❌ FAIL — Return to fix the failed artifact and then re-run verify

**Next Step**:

1. Commit implementation changes.
2. Optionally run task 4.2 manual dry-run or mark `[~]` deferred with documented equivalence (already in §7).
3. Proceed to `/opsx:archive` to sync delta specs and move change folder.
