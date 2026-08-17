## Context

Managed account Match processing validates scoring eligibility before the scoring engine runs. Sources without a viable Match path are recorded in `FusionRun.sourcesWithoutReviewers`, and `preScoreGate` bypasses scoring for every account from those sources.

Operators need two independent toggles:
- **`fusionEnableAutoMerge`** — high-confidence merges without review forms
- **`fusionEnableManualReview`** — borderline matches enter review when reviewers exist

Previously manual review was implicit (always on via score threshold only), and no-reviewer sources skipped all scoring even when automatic merge was enabled.

## Goals / Non-Goals

**Goals:**
- Restore **`fusionEnableManualReview`** (default **true** for backward compatibility).
- Score when **`fusionEnableAutoMerge`** OR (**`fusionEnableManualReview`** AND reviewers configured).
- After scoring, evaluate outcomes in order: automatic merge → manual review (when path available) → non-match.
- Centralize eligibility in `reviewerAvailability` helpers (`sourceShouldEnterMatchScoring`, `sourceManualReviewPathAvailable`).
- Update tests, operator docs, connector spec, and changelog.

**Non-Goals:**
- Changing scoring algorithms or threshold math (`fusionAutoMergeScore` remains strictly greater than `fusionManualReviewScore`).
- Creating synthetic reviewers.
- Changing record/orphan/correlated-managed-account branches.

## Decisions

### D1: Explicit manual review toggle with default true
- **Choice**: Add `fusionEnableManualReview` to Matching Settings; default `true` so existing deployments behave unchanged.
- **Reason**: Matches operator mental model; separates “run Match scoring” from “offer review forms”.

### D2: Scoring eligibility formula
- **Choice**: `sourceShouldEnterMatchScoring = autoMergeOn || (manualReviewOn && hasReviewers)`.
- **Reason**: No scoring when neither outcome path is viable; auto-merge-only deployments score without reviewers.

### D3: Post-score outcome tree
- **Choice**: After `tryAutoMergeFromMatches`, if `sourceManualReviewPathAvailable` → partial/defer; else → authoritative non-match.
- **Reason**: Single decision point replaces auto-merge-only special cases.

### D4: Pre-score gate unchanged structurally
- **Choice**: Keep `sourcesWithoutReviewers` membership as the scoring gate; populate it from D2 in `validateManagedSourceReviewers`.
- **Reason**: Minimal change to `preScoreGate`.

### D5: Logging
- **Choice**: ERROR when scoring not configured; WARN when auto-merge runs without reviewers (manual path unavailable).

## Risks / Trade-offs

- [Risk] Operators disable manual review expecting reviewers to still catch borderline cases → Mitigation: docs table; default manual review on.
- [Risk] Breaking change for auto-merge + no reviewers tenants (from prior skip-scoring behavior) → Changelog note retained.

## Migration Plan

1. Deploy connector; existing configs without `fusionEnableManualReview` default to **true**.
2. No ISC migration required for typical deployments.
3. Auto-merge-only: enable automatic merge; optional disable manual review; reviewers not required.

## Open Questions

None.
