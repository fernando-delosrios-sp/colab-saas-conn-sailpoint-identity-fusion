<!--
Raw capture of superpowers:brainstorming output.
-->

# Brainstorm: Auto-merge without reviewers

## Background

Today, `FusionService.validateManagedSourceReviewers()` marks any managed source with zero entries in `run.reviewersBySourceId` as `sourcesWithoutReviewers`. `resolveAccountBeforeScoring` in `preScoreGate.ts` short-circuits those accounts **before** the scoring engine runs — they become authoritative non-matches with no call to `MatchingService.scoreFusionAccount`.

That gate exists because partial matches require review forms, and forms require at least one reviewer. However, **automatic merge** bypasses review forms entirely. Operators who enable **Enable automatic merge** and tune thresholds to accept only high-confidence merges may not want (or need) a manual review workflow — yet they still cannot auto-merge today without configuring global or per-source reviewers.

The user request: when **Enable automatic merge** is on and a managed source has **no reviewers**, run scoring and **only** process automatic-merge outcomes. All other match outcomes (partial match, review-form path, deferred pending without auto-merge resolution) must not create review forms and must fall through to non-match (or existing record/orphan branches).

## Decision Chain

- **Q1:** When does the relaxed gate apply?
  - **A1:** Only when connector config **`fusionEnableAutoMerge`** is true **and** the managed source has zero reviewers at run time. If automatic merge is disabled, behavior stays unchanged (skip scoring → non-match).

- **Q2:** What happens to partial matches (score ≥ manual review threshold, below automatic merge threshold)?
  - **A2:** Treat as **non-match** — no review form, no `formsQueued` event, no `claimAccount` for review. Log at debug/info that manual review was skipped because no reviewers are configured.

- **Q3:** What happens to identity-match resolution when auto-merge attempt fails?
  - **A3:** Same as partial — **non-match**, not `partial-match` resolution. Do not call `handlePartialMatch` / `createFusionForm`.

- **Q4:** What about deferred matching on sources without reviewers?
  - **A4:** Deferred drain still runs when scoring is enqueued. Outcomes that would auto-merge (combined score ≥ `fusionAutoMergeScore`) proceed as today. Outcomes that would defer for manual review or create partial forms become **non-match** instead.

- **Q5:** Should `sourcesWithoutReviewers` still be populated when auto-merge is enabled?
  - **A5:** **No** for scoring skip purposes — do not add the source to `sourcesWithoutReviewers` when `fusionEnableAutoMerge` is true. Keep tracking reviewer absence via `reviewersBySourceId` empty check inside outcome dispatch. Log a **warning** (not error) once per source: auto-merge-only mode active, partial matches will register as non-match.

- **Q6:** Dry-run behavior?
  - **A6:** Same as persistent run — scoring and auto-merge decision simulation run; no review forms created.

- **Q7:** Is this breaking?
  - **A7:** **Yes, behavior change** for deployments that currently rely on "no reviewers → all non-match" while automatic merge is enabled. Those tenants will begin seeing auto-merges after upgrade. Document in changelog and matching/reviewer guides.

## Agreed Approach

**Recommended (Approach A): Conditional pre-score gate + outcome dispatch guard**

1. **`validateManagedSourceReviewers`**: If `fusionEnableAutoMerge` and no reviewers → warn, do **not** add to `sourcesWithoutReviewers`. If `!fusionEnableAutoMerge` and no reviewers → error + add to set (unchanged).
2. **`preScoreGate`**: Unchanged structurally — only sources in `sourcesWithoutReviewers` skip scoring.
3. **`MatchOutcomeDispatcher` / `identityMatchResolution`**: When `reviewersBySourceId` is empty for the source, route partial-match and failed-auto-merge identity-match paths to authoritative non-match instead of `handlePartialMatch`.
4. **Deferred resolution**: Mirror the same guard before deferring or creating forms.

**Alternatives considered:**

| Approach | Pros | Cons |
|---|---|---|
| A. Conditional gate + dispatch guard (chosen) | Minimal surface; reuses existing reviewer map; clear split: gate for "can we score at all?" vs dispatch for "can we review?" | Two places to maintain reviewer checks |
| B. New config flag "auto-merge without reviewers" | Explicit opt-in | YAGNI — tied to existing Enable automatic merge |
| C. Always score, block only form creation | Simple dispatch change only | Wastes scoring when auto-merge off and no reviewers; contradicts current intentional skip |

## Design Trade-offs

- Operators enabling automatic merge without reviewers accept that **borderline matches become non-matches** rather than entering review — by design.
- Scoring cost increases for no-reviewer + auto-merge sources (previously skipped entirely).
- Partial-match counts in sweep results and reports will drop; non-match counts may rise for sources previously short-circuited.
- Global reviewers remain the recommended path when manual review is needed alongside auto-merge.

## Open Questions

None — user request is explicit.

---

## Refinement (2026-08-17): Explicit manual review toggle

During implementation review, the team restored **`fusionEnableManualReview`** as a first-class config toggle (default **true**) so the Match outcome tree matches operator expectations:

| Phase | Rule |
|---|---|
| **Scoring eligibility** | `fusionEnableAutoMerge` **OR** (`fusionEnableManualReview` **AND** reviewers configured) |
| **After scoring** | (1) automatic merge if enabled and threshold met → (2) manual review if toggle on **and** reviewers → (3) non-match |

This supersedes the earlier auto-merge-only special case (`autoMerge && !reviewers → non-match`) with a unified **`sourceManualReviewPathAvailable`** check. Pre-score gate structure (via `sourcesWithoutReviewers`) is unchanged; population logic uses the scoring eligibility formula above.

Brainstorm Q1–Q5 remain valid; Q2/Q3 outcomes now also apply when manual review is **disabled** (even if reviewers exist).
