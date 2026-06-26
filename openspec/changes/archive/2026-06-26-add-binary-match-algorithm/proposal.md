## Why

Identity Fusion NG's matching algorithms are all similarity-based (Jaro-Winkler, LIG3, Dice, etc.). Administrators who want to correlate on stable identifiers such as employee IDs, email addresses, or UUIDs need an algorithm that treats values as strictly equal or not equal — any deviation, even minor casing or spacing, should produce a non-match. A dedicated **Binary** algorithm eliminates the ambiguity of partial similarity scores for these use cases and makes threshold configuration trivial (anything below 100 is a non-match).

## What Changes

- Add a new per-attribute matching algorithm named **`binary`**.
- Score is **100** when the account value and candidate identity value are identical strings, and **0** for every other case (including missing values).
- Surface `binary` as an option in `connector-spec.json` matching algorithm configuration.
- Add the friendly label "Binary (Exact Match)" to form/UI label maps.
- Extend `MatchingConfig.algorithm` union type in `src/model/config.ts`.
- Implement `scoreBinary` in `src/services/scoringService/helpers.ts` and wire it into `ScoringService.scoreAttribute`.
- Add unit tests for exact-match, case-mismatch, whitespace-mismatch, and missing-value cases.
- Update user-facing documentation (`docs/guides/matching-algorithms.md`) to describe when and how to use Binary matching.

## Capabilities

### New Capabilities
- `binary-matching-algorithm`: A strict exact-match scoring algorithm that returns 100 for identical string values and 0 otherwise, usable in per-attribute matching rules.

### Modified Capabilities
<!-- No existing capability requirements are changing; this is a pure addition. -->

## Impact

- `src/services/scoringService/helpers.ts` — new scoring function.
- `src/services/scoringService/scoringService.ts` — dispatch to the new algorithm.
- `src/model/config.ts` — extend algorithm union type.
- `src/services/formService/constants.ts` and `src/services/messagingService/messagingHandlebarsRegistration.ts` — add friendly label.
- `connector-spec.json` — add `binary` to the matching algorithm enum/options, placed immediately before `custom` (one before the last position).
- `docs/guides/matching-algorithms.md` — document the new algorithm.
- Unit tests in `src/services/scoringService/__tests__/`.
