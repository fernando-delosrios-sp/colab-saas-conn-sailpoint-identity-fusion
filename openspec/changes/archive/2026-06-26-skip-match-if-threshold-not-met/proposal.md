## Why

Identity Fusion NG currently includes every evaluated (non-skipped) rule in the weighted combined match score, even when the rule's raw similarity is below its per-rule minimum. This can dilute the combined score with weak signals and make threshold tuning harder for administrators. A matching rule option that removes a non-passing rule from the final score—similar to how **Skip match if missing** removes rules with missing values—gives administrators finer control over which attributes influence the match decision.

## What Changes

- Add a new per-rule toggle in **Attribute Matching Settings → Matching Settings** labeled **Skip match if threshold not met**.
- When enabled for a rule, if the rule's computed similarity is below its configured **Minimum similarity**, the rule is treated as skipped and excluded from the weighted combined score calculation.
- The toggle defaults to **No** (disabled) to preserve existing matching behavior and avoid breaking changes.
- Mandatory rules are always evaluated regardless of this toggle; a failed mandatory rule still invalidates the candidate, just as with **Skip match if missing**.
- Update the scoring engine (`src/services/scoringService/scoringService.ts`) to honor the new flag.
- Update the matching configuration model (`src/model/config.ts`) and settings reader.
- Update `connector-spec.json` with the new field, help text, and conditional visibility.
- Update user-facing documentation (`docs/guides/match.md` and `docs/guides/matching-algorithms.md`) and the README configuration reference.
- Add unit tests covering skip-on-threshold behavior, interaction with mandatory rules, and combined-score recalculation.

## Capabilities

### New Capabilities
- `matching-rule-threshold-skip`: Per-rule option to exclude a rule from the weighted combined score when it does not meet its minimum similarity threshold.

### Modified Capabilities
<!-- No existing spec-level requirements are changing; this is an additive option that defaults off. -->
- None

## Impact

- **Code**: `src/model/config.ts`, `src/data/config/settings/matchingSettings.ts`, `src/services/scoringService/scoringService.ts`, `src/services/scoringService/__tests__/scoringService.test.ts`.
- **Configuration surface**: `connector-spec.json` (new toggle under fusion attribute matches).
- **Documentation**: `README.md`, `docs/guides/match.md`, `docs/guides/matching-algorithms.md`.
- **Behavior**: Existing configurations are unaffected because the toggle defaults to disabled. Enabling it changes how the combined score is computed for that rule only.
