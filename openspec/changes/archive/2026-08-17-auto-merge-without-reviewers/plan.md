# Auto-merge Without Reviewers — Implementation Plan

> **Status:** Complete — see `tasks.md` for checkbox tracking. This plan documents the implemented approach.

**Goal:** Restore explicit **Enable manual review** and score when automatic merge **or** (manual review with reviewers) is configured. After scoring, evaluate outcomes in order: automatic merge → manual review → non-match.

**Architecture:** Centralize eligibility in `reviewerAvailability.ts` (`sourceShouldEnterMatchScoring`, `sourceManualReviewPathAvailable`). Populate `sourcesWithoutReviewers` from the scoring formula in `validateManagedSourceReviewers`. Post-score tree in `identityMatchResolution` and `deferredMatchResolution`.

**Tech Stack:** TypeScript, Vitest, existing matching-service and fusion-service modules.

## Global Constraints

- **`fusionEnableManualReview`** defaults to **true** (backward compatible).
- Scoring eligibility: `fusionEnableAutoMerge || (fusionEnableManualReview && hasReviewers)`.
- Post-score: auto merge threshold → manual review path (toggle + reviewers) → authoritative non-match.
- Canonical test commands:
  - `npm test -- src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts`
  - `npm test -- src/services/matchingService/__tests__/reviewerAvailability.test.ts`
  - `npm test -- src/data/config/settings/__tests__/matchingSettings.test.ts`
  - `npm test -- src/services/fusionService/__tests__/fusionService.aggregation.test.ts -t "automatic merge|non-scorable|global reviewer|Match scoring|manual review"`
- Spec deltas: `openspec/changes/auto-merge-without-reviewers/specs/`

---

## Task 1: Configuration — Enable manual review toggle

**Files:** `connector-spec.json`, `matchingSettings.ts`, `model/config.ts`, `matchingSettings.test.ts`

- [x] Add `fusionEnableManualReview` toggle (default true) and wire through config read
- [x] Add default/normalization test

---

## Task 2: Eligibility helpers

**Files:** `src/services/matchingService/reviewerAvailability.ts`, `reviewerAvailability.test.ts`

- [x] Implement `sourceHasReviewers`, `sourceShouldEnterMatchScoring`, `sourceManualReviewPathAvailable`
- [x] Unit-test all combinations (auto on/off, manual on/off, reviewers present/absent)

---

## Task 3: FusionService — scoring eligibility validation

**Files:** `fusionService.ts`, `fusionService.aggregation.test.ts`

- [x] Update `validateManagedSourceReviewers` to use `sourceShouldEnterMatchScoring`
- [x] ERROR when scoring not configured; WARN when auto-merge runs without reviewers
- [x] Tests for all four eligibility scenarios

---

## Task 4: Post-score outcome tree

**Files:** `identityMatchResolution.ts`, `deferredMatchResolution.ts`, `matchOutcomeDispatcher.ts`, `matchOutcomeDispatcher.test.ts`

- [x] Identity path: auto merge → `sourceManualReviewPathAvailable` → partial, else non-match
- [x] Deferred path: same guard via `sourceManualReviewPathAvailable`
- [x] Tests: manual review on/off, with/without reviewers, auto-merge regression, deferred non-match

---

## Task 5: Documentation and changelog

**Files:** `docs/operations/account-list.md`, `docs/use-guides/configuration/matching-identities.md`, `docs/use-guides/configuration/source-types.md`, `CHANGELOG.md`

- [x] Dual-toggle model in operator docs and flowchart
- [x] CHANGELOG: breaking auto-merge note + new manual review toggle

---

## Spec scenario coverage map

| Scenario | Implementation / test |
|---|---|
| Manual review enabled without reviewers, auto merge disabled skips scoring | `fusionService.aggregation.test.ts` |
| Automatic merge enabled without reviewers allows scoring | `fusionService.aggregation.test.ts` |
| Manual review enabled with reviewers allows scoring | `fusionService.aggregation.test.ts` (global owner reviewer tests) |
| Both toggles disabled skips scoring | `fusionService.aggregation.test.ts` |
| No-reviewer source with auto merge enabled is scored | `matchOutcomeDispatcher.test.ts` |
| Manual review enabled without reviewers, auto merge disabled skips scoring (dispatch) | `matchOutcomeDispatcher.test.ts` |
| Partial match without manual review path → non-match | `matchOutcomeDispatcher.test.ts` |
| Partial match with manual review path → review form | `matchOutcomeDispatcher.test.ts` |
| Automatic merge without reviewers still merges | `matchOutcomeDispatcher.test.ts` |
| Deferred outcome without manual review path → non-match | `matchOutcomeDispatcher.test.ts` |

**Commit suggestion:** `feat(matching): add manual review toggle and dual-path Match scoring`
