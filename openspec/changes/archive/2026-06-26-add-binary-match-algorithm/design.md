## Context

Identity Fusion NG scores candidate account-to-identity matches using per-attribute rules configured in `MatchingConfig.algorithm`. The scoring layer lives in `src/services/scoringService/`: `helpers.ts` contains algorithm-specific scoring functions, and `ScoringService.scoreAttribute` dispatches to them via a `switch`. Existing algorithms (`name-matcher`, `jaro-winkler`, `lig3`, `dice`, `double-metaphone`, `custom`) all produce graded similarity scores, which is the wrong semantic for stable identifiers where any deviation must be treated as a non-match.

## Goals / Non-Goals

**Goals:**
- Introduce a `binary` matching algorithm that returns a score of **100** only when the two values are identical strings, and **0** otherwise.
- Make the algorithm selectable from the connector UI (`connector-spec.json`) and recognizable in review forms and messages.
- Keep the implementation consistent with the existing scoring function signature and `ScoreReport` shape.
- Provide unit-test coverage for exact-match, mismatch, case-difference, whitespace-difference, and missing-value cases.
- Update `docs/guides/matching-algorithms.md` so administrators know when to choose `binary`.

**Non-Goals:**
- Changing the behavior of any existing algorithm.
- Adding normalization or fuzzy logic to the `binary` algorithm (e.g., case folding, diacritic stripping, whitespace trimming). Administrators can pre-normalize values in **Define** if needed.
- Changing the definition of "exact attribute match" auto-assignment (`isExactAttributeMatchScores`); `binary` participates like any other rule that must score 100.
- Introducing new external dependencies.

## Decisions

### 1. Strict string equality for scoring
- **Decision**: `scoreBinary` compares the two values with `===` after converting each to a string via the existing `(value ?? '').toString()` path used by the scoring service.
- **Rationale**: The name "Binary" and the requested 100/0 behavior imply a true/false exact match. Case, whitespace, and diacritic differences are intentional non-matches unless the administrator normalizes them in **Define**.
- **Alternatives considered**: Normalizing both sides (lowercase + trim) would make the algorithm more forgiving but would contradict the "exact match" requirement and overlap with LIG3/name-matcher behavior.

### 2. Missing values score 0 and follow existing skip rules
- **Decision**: When either side is missing (null/undefined/empty after trim), the algorithm produces a score of 0. The existing `skipMatchIfMissing` and `effectiveSkipMatchIfThresholdNotMet` handling in `ScoringService.scoreAccount` remains unchanged.
- **Rationale**: Keeps the new algorithm consistent with the rest of the scoring pipeline and avoids special-casing in the dispatch loop.

### 3. Reuse the existing `scoreAttribute` dispatch path
- **Decision**: Add `case 'binary': return scoreBinary(...)` in `ScoringService.scoreAttribute` rather than introducing a special normalized/cached branch like LIG3 and name-matcher use.
- **Rationale**: The comparison is O(n) string equality and is already fast; there is no normalization overhead to cache.

### 4. Place `binary` one position before the last algorithm in config lists
- **Decision**: In `src/model/config.ts` and `connector-spec.json`, place `binary` immediately before `custom` (i.e., one before the last entry), preserving the existing order of all other algorithms.
- **Rationale**: Keeps the commonly used similarity algorithms grouped together while positioning `binary` adjacent to `custom`, another specialized/non-similarity option. This minimizes disruption to existing diffs and UI ordering.

### 5. Label the algorithm "Binary (Exact Match)"
- **Decision**: Use the key `binary` and the friendly label `Binary (Exact Match)` in `ALGORITHM_LABELS` and any message-handlebars registration maps.
- **Rationale**: Communicates both the strict nature of the algorithm and its intended use case in the UI and review forms.

## Risks / Trade-offs

- **[Risk] Users may expect case-insensitive exact matching.** → **Mitigation**: Document clearly that `binary` is case-sensitive and recommend pre-normalizing attributes (e.g., lowercase in **Define**) when case-insensitive equality is desired.
- **[Risk] Adding a UI option without updating help text causes confusion.** → **Mitigation**: Update `connector-spec.json` help text and `docs/guides/matching-algorithms.md` as part of the implementation.
- **[Risk] Future algorithms may need similar simple exact-match behavior.** → **Mitigation**: The implementation is a single function and a switch case; it can be reused or extended later without architectural changes.
