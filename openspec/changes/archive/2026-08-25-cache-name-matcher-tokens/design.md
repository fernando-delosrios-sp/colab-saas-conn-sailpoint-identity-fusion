## Context

Match scoring compares each managed account against many fusion identities. The default algorithm is `name-matcher` (`connector-spec.json` initial value, `matchingSettings.ts`). `MatchingService.getNameNormalized` caches normalized strings on `FusionRun.nameNormalizedCache` (WeakMap by account). `matchNormalized` in `nameMatching.ts` then splits both sides and runs phonetic encoding every time.

Drift check: `git rev-parse --short HEAD` → `25acd10` at package authoring time.

## Goals / Non-Goals

**Goals:**
- Cache token arrays keyed by normalized name string.
- Cache double-metaphone codes keyed by token string.
- Identical match scores to current behavior for all existing fixtures.
- Deterministic test: one `doubleMetaphone` call per distinct token across a multi-identity sweep.

**Non-Goals:**
- Numeric cheap-path scorers (separate change).
- Token-pair Jaro-Winkler memoization inside `calculateTokenSimilarity`.
- Changing name-matcher weights or matching semantics.

## Decisions

### D1: FusionRun owns caches (matching-service spec)

Caches live on `FusionRun`, not `MatchingService`, consistent with `normalizedCache` and `nameNormalizedCache`.

### D2: String-keyed maps

```typescript
// fusionRun.ts (new fields, illustrative)
nameMatcherTokenCache: Map<string, string[]> = new Map()
nameMatcherPhoneticCache: Map<string, [string, string]> = new Map()
```

Pass `FusionRun` (or the maps) into `matchNormalized` / helpers from `scoreNameMatcherNormalized` via `MatchingService`.

### D3: Cache population

- **Tokens:** On first need for normalized string `N`, `split(' ')` and store in `nameMatcherTokenCache`.
- **Phonetic:** On first need for token `T` with `length > 1`, `doubleMetaphone(T)` and store in `nameMatcherPhoneticCache`.

## Current state (excerpts)

`nameMatching.ts` — token split every comparison:

```91:98:src/services/matchingService/nameMatching.ts
    const tokens1 = normalized1.split(' ')
    const tokens2 = normalized2.split(' ')

    const tokenScore = calculateTokenSimilarity(tokens1, tokens2)
    const stringSimilarity = jaroWinklerSimilarity(normalized1, normalized2)
    const phoneticScore = calculatePhoneticSimilarity(tokens1, tokens2)
```

`fusionRun.ts` — existing cache placement:

```117:121:src/model/fusionRun.ts
    trigramIndexByAttribute: Map<string, Map<string, Set<FusionAccount>>> = new Map()
    normalizedCache: WeakMap<FusionAccount, Map<string, string>> = new WeakMap()
    nameNormalizedCache: WeakMap<FusionAccount, Map<string, string>> = new WeakMap()
    indexedMandatoryAttributes: string[] = []
```

## In scope

- `src/model/fusionRun.ts`
- `src/services/matchingService/nameMatching.ts`
- `src/services/matchingService/scoringHelpers.ts` (wiring only if needed)
- `src/services/matchingService/__tests__/nameMatching.test.ts`
- `src/services/matchingService/__tests__/matchService.test.ts`

## Out of scope

- `matchingService.ts` fast-path / `captureBreakdown` (numeric-rule-scorers)
- Trigram index (conclusive-mandatory-blocking)
- Documentation beyond changelog note (no operator-visible behavior change)

## STOP conditions

- Any `nameMatching.test.ts` fixture score changes — stop and report; do not tweak weights to pass.
- Knip reports unused exports after adding cache helpers — fix before merge.

## Verification commands

```bash
npx vitest run src/services/matchingService/__tests__/nameMatching.test.ts src/services/matchingService/__tests__/matchService.test.ts
npm run lint
npx tsc --noEmit
```

## Git workflow

Apply on a feature branch from current main; one commit per task group in `tasks.md` or one squash at executor discretion. Do not archive until verify passes.

## Risks / Trade-offs

[Trade-off] Maps grow with distinct names/tokens in the run → bounded by identity corpus size; acceptable vs per-comparison allocation.

[Risk] Cache key must use the same normalized form as scoring → use strings from `normalizeName` / `getNameNormalized` only.
