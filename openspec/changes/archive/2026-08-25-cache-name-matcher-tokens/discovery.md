## Scope

In: run-scoped caches on `FusionRun` for name-matcher token splits and double-metaphone phonetic codes; `matchNormalized` / `calculatePhoneticSimilarity` consume cached artifacts; tests assert score parity and at-most-once phonetic encoding per distinct token per run.

Out: numeric cheap-path scorers (`numeric-rule-scorers` change); trigram blocking changes (`conclusive-mandatory-blocking` change); token-pair Jaro-Winkler memoization (follow-up only); changes to name-matching weights or token-matching semantics.

## Language

No new ubiquitous-language terms. Implementation caches only (`nameTokenCache`, `namePhoneticCodeCache` on `FusionRun`).

## Decisions

**Context:** `connector-spec.json` and matching settings default `algorithm` to `name-matcher`. `getNameNormalized` caches normalized strings on `FusionRun.nameNormalizedCache`, but `matchNormalized` re-splits tokens and `calculatePhoneticSimilarity` re-runs `doubleMetaphone` on every identity comparison. An identity's tokens are re-encoded once per managed account scored against it.

**D1: Cache keys are strings, not `(FusionAccount, attribute)`**
- **Choice:** `Map<string, string[]>` for normalized name → tokens; `Map<string, [string, string]>` for token → double-metaphone codes.
- **Reason:** Token cardinality is lower than name cardinality; string keys avoid staleness in existing `WeakMap<FusionAccount, …>` caches that ignore raw attribute values.

**D2: Phonetic cache is per token, not per comparison**
- **Choice:** `doubleMetaphone` invoked at most once per distinct token per run.
- **Reason:** `calculatePhoneticSimilarity` already batches codes for `tokens2` within one comparison; waste is across comparisons.

**D3: Semantics unchanged**
- **Choice:** Keep 0.5/0.3/0.2 weights, `MIN_CODE_SIMILARITY`, initial-match credit, and `> 0.8` Jaro-Winkler gate in token matching.

## Open Questions

None.
