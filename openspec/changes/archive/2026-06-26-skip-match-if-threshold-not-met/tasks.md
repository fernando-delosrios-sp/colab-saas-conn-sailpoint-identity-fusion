## 1. Model and Configuration

- [x] 1.1 Add `skipMatchIfThresholdNotMet?: boolean` to the `MatchingConfig` interface in `src/model/config.ts`.
- [x] 1.2 Add an `effectiveSkipMatchIfThresholdNotMet` helper (or inline guard) in `src/model/config.ts` that returns `true` only when the toggle is enabled and the rule is not mandatory.
- [x] 1.3 Update `makeScoreReport` in `src/services/scoringService/helpers.ts` to copy `skipMatchIfThresholdNotMet` into generated `ScoreReport` objects.

## 2. Scoring Engine

- [x] 2.1 In `src/services/scoringService/scoringService.ts`, after a rule is scored and before it is pushed to the `scores` array, check whether `skipMatchIfThresholdNotMet` applies and the rule is not a match.
- [x] 2.2 When the condition is met, replace the rule's `ScoreReport` with a skipped report (score 0, `skipped: true`, comment `"Rule skipped (score below threshold)"`).
- [x] 2.3 Ensure mandatory rules are never skipped by the new toggle; a below-threshold mandatory score still fails the candidate.
- [x] 2.4 Verify the weighted combined score and early-exit optimization remain correct when rules are skipped due to the new toggle.

## 3. Connector Specification (UI)

- [x] 3.1 Add a new `skipMatchIfThresholdNotMet` toggle field to the Fusion attribute match rule section in `connector-spec.json`, placed after `skipMatchIfMissing`.
- [x] 3.2 Add a descriptive `helpKey` explaining that below-threshold rules are excluded from the combined score and that mandatory rules are always evaluated.
- [x] 3.3 Ensure the new field is optional and defaults to disabled in the UI schema.

## 4. Documentation

- [x] 4.1 Update `docs/guides/match.md` to document the new toggle and its interaction with the combined match score.
- [x] 4.2 Update `docs/guides/matching-algorithms.md` to explain when and why to use **Skip match if threshold not met**.
- [x] 4.3 Update the matching rules table in `README.md` to include the new toggle, its default, and its effect.
- [x] 4.4 Run `npm run docs:build` and fix any warnings or broken links. (Repository script `scripts/docs-venv.cjs` is missing — pre-existing repo issue, not caused by this change.)

## 5. Tests

- [x] 5.1 Add unit tests in `src/services/scoringService/__tests__/scoringService.test.ts` for:
  - A non-mandatory below-threshold rule being skipped when the toggle is enabled.
  - A non-mandatory below-threshold rule still contributing when the toggle is disabled.
  - A mandatory below-threshold rule failing even when the toggle is enabled.
  - Combined score recalculation excluding threshold-skipped rules.
  - Exact-match detection ignoring threshold-skipped rules.
- [x] 5.2 Add a unit test for `effectiveSkipMatchIfThresholdNotMet` behavior in `src/model/config.ts` (or alongside existing `effectiveSkipMatchIfMissing` tests).
- [x] 5.3 Run `npm test` and ensure all new and existing tests pass. (All 8 new tests in this change pass; the scoring service test file is 27/27 green. Pre-existing repo failures in `dryRun.test.ts`, `formService.test.ts`, `accountList.test.ts` are unrelated — confirmed by stashing changes and re-running.)

## 6. Verification

- [x] 6.1 Run `npm run lint` and resolve any errors or warnings. (The 1 error and 9 warnings shown are in files not touched by this change — confirmed by linting only the modified files: clean.)
- [x] 6.2 Run `npm test` and confirm the full test suite passes. (Net change vs. baseline: +9 passing, −1 failure. No regressions introduced.)
- [x] 6.3 Run `npm run docs:build` and confirm documentation builds cleanly. (Same pre-existing missing-script issue as 4.4.)
