## Context

Identity Fusion NG computes a **weighted combined match score** by blending per-rule similarity scores. Each rule's minimum similarity (`fusionScore`) doubles as its blend weight. Today, every evaluated (non-skipped) rule contributes to the blend, even when its raw score is below its own minimum. This can pull the combined score down with weak signals.

A related toggle already exists: **Skip match if missing** removes a rule from the combined score when either side has no value. This change introduces the analogous **Skip match if threshold not met** toggle, which removes a rule when its computed similarity is below its configured minimum.

The change is localized to the scoring pipeline and configuration model; no external APIs or data stores are involved.

## Goals / Non-Goals

**Goals:**
- Add a per-rule `skipMatchIfThresholdNotMet` toggle to the matching configuration.
- When enabled, exclude below-threshold non-mandatory rules from the weighted combined score.
- Preserve existing behavior for all current configurations (toggle defaults to disabled).
- Keep mandatory rules unaffected by the toggle.
- Update the UI schema, model, scoring engine, tests, and documentation consistently.

**Non-Goals:**
- Changing how `Skip match if missing` behaves.
- Introducing automatic assignment based on per-rule thresholds.
- Adding new matching algorithms.
- Altering the weighted-mean formula itself; only the set of contributing rules changes.

## Decisions

### 1. Default the new toggle to disabled
- **Rationale:** Enabling this behavior by default would change combined scores for existing customers and could silently alter match results. Defaulting to `false` makes the feature opt-in and backward-compatible.
- **Alternative considered:** Default to enabled to match `Skip match if missing`. Rejected because `Skip match if missing` was present from the initial matching implementation, whereas this is a later behavioral addition.

### 2. Apply the skip after scoring, before contributing to the blend
- **Rationale:** The rule must be scored to know whether it is below threshold. After scoring, if `skipMatchIfThresholdNotMet` is enabled and `!scoreReport.isMatch`, the rule is replaced by a skipped `ScoreReport` (score 0, `skipped: true`) exactly like `Skip match if missing` does.
- **Implementation point:** This logic lives in `ScoringService.compareFusionAccounts`, immediately after the `scoreReport` is produced and before it is pushed to `scores` or added to `weightedSum` / `weightTotal`.

### 3. Exclude mandatory rules from threshold skipping
- **Rationale:** Mandatory rules are explicitly intended to gate matches. Allowing them to be skipped would contradict their purpose and be inconsistent with `Skip match if missing`, which also ignores mandatory rules.
- **Implementation point:** The skip check is guarded by `!matching.mandatory`.

### 4. Reuse the existing skipped-report mechanism
- **Rationale:** The `ScoreReport` type already supports `skipped`, the UI/form/report code already renders skipped rows, and exact-match detection already filters skipped rules. Reusing this mechanism minimizes new code paths.
- **Implementation point:** A skipped report for threshold-not-met uses the comment `"Rule skipped (score below threshold)"`.

### 5. Add the field to `MatchingConfig` and surface it in `connector-spec.json`
- **Rationale:** The connector-spec UI schema is the source of truth for administrator-facing configuration. Adding the field there makes it configurable and documents it in-app.
- **Implementation point:** Place the new toggle immediately after `skipMatchIfMissing` in the Fusion attribute match rule form, with conditional visibility so it is only relevant when a threshold exists.

## Risks / Trade-offs

| Risk | Mitigation |
| --- | --- |
| Administrators misunderstand the toggle and enable it on mandatory rules expecting them to be skipped. | The UI help text explicitly states that mandatory rules are always evaluated. The implementation guards against skipping mandatory rules. |
| Skipping rules changes the denominator of the weighted mean, which can raise the combined score compared with keeping weak rules in the blend. | Document that enabling the toggle can increase the combined score and advise testing with `custom:dryrun` before production. |
| The early-exit optimization (`maxAchievableCombinedScore`) assumes future rules may contribute full weight; skipping reduces actual achievable score, so the early-exit remains a safe upper bound but may be slightly less aggressive. | No functional impact; performance difference is negligible unless many rules are skipped. |
| Existing tests that assert on exact score arrays may need updates if they rely on threshold-failing rules being present. | New tests will cover the toggle; existing tests are unaffected because the default is disabled. |

## Migration Plan

No migration is required. Existing configurations continue to behave identically because the new toggle defaults to `false`. Administrators who want the new behavior must open **Attribute Matching Settings → Matching Settings**, expand each relevant Fusion attribute match, and enable **Skip match if threshold not met**.

## Open Questions

None at this time.
