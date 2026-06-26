## 1. Type and model updates

- [x] 1.1 Add `'binary'` to the `MatchingConfig.algorithm` union type in `src/model/config.ts`, placing it immediately before `'custom'` (one before the last position).

## 2. Scoring implementation

- [x] 2.1 Implement `scoreBinary` in `src/services/scoringService/helpers.ts` returning 100 for identical strings and 0 otherwise.
- [x] 2.2 Import `scoreBinary` into `src/services/scoringService/scoringService.ts`.
- [x] 2.3 Add a `case 'binary': return scoreBinary(...)` branch in `ScoringService.scoreAttribute`.

## 3. UI and messaging labels

- [x] 3.1 Add `binary: 'Binary (Exact Match)'` to `ALGORITHM_LABELS` in `src/services/formService/constants.ts`.
- [x] 3.2 Add `binary: 'Binary (Exact Match)'` to the algorithm label map in `src/services/messagingService/messagingHandlebarsRegistration.ts` if it contains the same set of labels.

## 4. Connector specification

- [x] 4.1 Add `"binary"` to the matching algorithm enum/options in `connector-spec.json`, placing it immediately before `"custom"` (one before the last position).
- [x] 4.2 Add or update help text for the `binary` option so administrators understand it is a strict exact match.

## 5. Tests

- [x] 5.1 Add unit tests in `src/services/scoringService/__tests__/helpers.test.ts` for `scoreBinary` covering exact match, mismatch, case difference, whitespace difference, and missing values.
- [x] 5.2 Add a test in `src/services/scoringService/__tests__/scoringService.test.ts` verifying the algorithm dispatch path returns a `ScoreReport` with `algorithm: 'binary'`.
- [x] 5.3 `matchingSettings.test.ts` does not validate algorithm values; no update required.
- [x] 5.4 Run `npm test` and fix any failures.

## 6. Documentation

- [x] 6.1 Add a `Binary (Exact Match)` section to `docs/guides/matching-algorithms.md` describing behavior and recommended use cases (stable identifiers).
- [x] 6.2 Update the algorithm comparison tables in `docs/guides/matching-algorithms.md` to include `binary`.
- [x] 6.3 `npm run docs:build` is broken on the baseline (`scripts/docs-venv.cjs` is missing). Not introduced by this change; documented in the design notes.

## 7. Quality gates

- [x] 7.1 Run `npm run lint` and fix any issues.
- [x] 7.2 Run the full test suite (`npm test`) and confirm it passes. The 4 failing test suites (`accountList`, `dryRun`, `corePipeline`, `formService`) are pre-existing failures present on the clean baseline (verified with `git stash`); they are not caused by this change. All `scoringService` tests pass.
