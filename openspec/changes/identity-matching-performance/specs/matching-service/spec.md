## ADDED Requirements

### Requirement: Identity-phase scoring retains top-K identity matches

When `candidateType` is Identity, `scoreFusionAccount` SHALL compare the managed account to every identity in the supplied pool (the `getCandidates` set, or the full Fusion identity baseline when `getCandidates` returned undefined). After those comparisons, MatchingService SHALL retain at most K identity-origin `FusionMatch` rows, where K is `fusionMaxCandidatesForForm` (or the `maxIdentityMatches` argument when provided). Retention order SHALL match review-form candidate sort: higher combined match score first, then ascending identity id. MatchingService SHALL NOT stop comparing after the first K passing identities and SHALL NOT stop comparing after the first exact match. Deferred scoring SHALL remain uncapped.

#### Scenario: Stronger identity after three weaker passers is retained

- **GIVEN** K is 3
- **AND** the identity pool is ordered so three identities pass the review threshold with combined scores 70, 71, and 72, then a fourth identity passes with combined score 95
- **WHEN** `scoreFusionAccount` completes identity-phase scoring
- **THEN** the fusion account SHALL store the identity with score 95 among its retained matches
- **AND** the lowest of the first three passers SHALL be dropped if more than K identities passed

#### Scenario: Identity scoring does not stop at the first exact match

- **GIVEN** automatic merge is enabled
- **AND** the first identity in the pool is an exact match
- **AND** a later identity in the pool is also an exact match with a lexicographically smaller identity id
- **WHEN** `scoreFusionAccount` completes
- **THEN** both exact matches SHALL have been compared
- **AND** retained matches SHALL be ranked by form sort so auto-merge can select the rank-1 identity

#### Scenario: Deferred scoring remains uncapped

- **GIVEN** `candidateType` is Deferred
- **WHEN** `scoreFusionAccount` scores the deferred pool
- **THEN** MatchingService SHALL NOT apply the identity top-K retention cap

### Requirement: Exhaustive-scoring oracle tests lock identity top-K equivalence

MatchingService automated tests SHALL include an exhaustive-scoring oracle on a small identity fixture (hundreds of identities at most). The oracle SHALL score a managed account against every fixture identity with candidate blocking disabled and with no top-K stop. Production identity-phase scoring (algorithm-aware blocking plus top-K retention) SHALL yield the same top-K identity ids and combined scores as the oracle for that fixture. Production runtime SHALL NOT invoke the oracle. Tests and production SHALL NOT exhaustive-score a 100k-identity baseline.

#### Scenario: Oracle and production top-K match on a planted fixture

- **GIVEN** a fixture of identities that includes a Jaro-Winkler pair with no shared padded trigram that still meets the mandatory threshold, and a first-K trap (weak early passers and a stronger later identity)
- **WHEN** the exhaustive-scoring oracle and the production identity path both score the same managed account
- **THEN** the retained top-K identity ids and combined scores SHALL be equal
- **AND** the Jaro-Winkler near-miss identity SHALL appear in top-K when it ranks there

#### Scenario: Oracle is not a production API

- **WHEN** a developer inspects MatchingService public methods used by FusionService and MatchOutcomeDispatcher
- **THEN** there SHALL be no production entry point that exhaustive-scores the live identity baseline for oracle purposes

### Requirement: Binary mandatory rules block by exact value

When a mandatory Binary matching rule has `(fusionScore ?? 0) > 0`, MatchingService SHALL include that rule’s exact-value identity index in candidate blocking. `getCandidates` SHALL NOT return identities whose indexed attribute value differs from the managed account’s value for that rule.

#### Scenario: Binary unique value yields only exact identities

- **GIVEN** a mandatory Binary rule on an attribute
- **AND** exactly one Fusion identity has the same attribute value as the uncorrelated account
- **WHEN** `getCandidates` is called
- **THEN** the returned set SHALL contain only that identity

### Requirement: LIG3 mandatory rules block by proven length bound

When a mandatory LIG3 matching rule has `(fusionScore ?? 0) > 0`, MatchingService SHALL exclude from the candidate set identities whose attribute lengths cannot meet that rule’s `fusionScore` under the same length-ratio bound already used by the LIG3 scorer.

#### Scenario: Identity outside LIG3 length bound is not a candidate

- **GIVEN** a mandatory LIG3 rule with a positive fusionScore
- **AND** an identity whose compared attribute length is outside the scorer’s length-ratio bound versus the account value
- **WHEN** `getCandidates` is called
- **THEN** that identity SHALL NOT appear in the candidate set

### Requirement: Unsafe algorithms do not use padded-trigram intersection as a blocker

MatchingService SHALL NOT apply padded-trigram intersection as a candidate blocker for Jaro-Winkler, Dice, double-metaphone, name-matcher, or custom Velocity rules. Those algorithms SHALL NOT shrink the candidate set until a recall-safe blocker for that algorithm is specified and oracle-tested.

#### Scenario: Jaro-Winkler near-miss with no shared trigram remains reachable

- **GIVEN** a mandatory Jaro-Winkler rule with fusionScore 80
- **AND** no other mandatory rule contributes a recall-safe blocker
- **AND** an identity that would score at least 80 against the account but shares no padded trigram with the account value
- **WHEN** `getCandidates` is called
- **THEN** the method SHALL return undefined
- **AND** identity-phase scoring SHALL include that identity in the comparison pool

#### Scenario: Mixed Binary and Jaro-Winkler mandatory rules use Binary only to filter

- **GIVEN** a mandatory Binary rule and a mandatory Jaro-Winkler rule, both with positive fusionScore
- **WHEN** `getCandidates` is called for an account with values on both attributes
- **THEN** the candidate set SHALL be the Binary exact-value hits
- **AND** the Jaro-Winkler rule SHALL NOT further shrink the set via trigram intersection

---

## MODIFIED Requirements

### Requirement: MatchingService scope is scoring and trigram blocking

MatchingService SHALL provide weighted scoring algorithms, algorithm-aware candidate blocking (built during `buildTrigramIndex`), and normalization caches on FusionRun. MatchingService SHALL NOT expose `processUncorrelatedManagedAccounts`, `configureScoring`, or own match sweep orchestration. Match outcome dispatch and the two-sweep lifecycle SHALL be owned by `MatchOutcomeDispatcher` in the same package. The public scoring-prep entry point during init SHALL be `buildTrigramIndex` only. That method SHALL build every identity-side blocking index required for `getCandidates`, not only padded-trigram maps.

#### Scenario: MatchingService has no sweep orchestration entry point

- **WHEN** a developer inspects the public API of MatchingService
- **THEN** there SHALL be no `processUncorrelatedManagedAccounts` method
- **AND** there SHALL be no `configureScoring` method
- **AND** sweep orchestration SHALL be invoked through `MatchOutcomeDispatcher.runMatchSweep`

#### Scenario: Trigram and scoring prep remain on MatchingService

- **WHEN** FusionService prepares for managed-account matching during init
- **THEN** it SHALL call `MatchingService.buildTrigramIndex`
- **AND** it SHALL NOT call `MatchingService.configureScoring`

#### Scenario: buildTrigramIndex builds algorithm-aware blocking indexes

- **WHEN** `buildTrigramIndex` runs
- **THEN** FusionRun SHALL hold the recall-safe blocking indexes for mandatory Binary and LIG3 rules present in matching configuration
- **AND** MatchingService SHALL NOT keep those indexes as service-local fields

### Requirement: MatchingService builds and queries trigram blocking index

MatchingService SHALL treat padded-trigram maps as an optional, algorithm-specific structure — not as the universal identity candidate filter. Mandatory rules with threshold zero or unset SHALL NOT contribute blocking indexes. `getCandidates` SHALL return the intersection of recall-safe per-rule candidate sets for mandatory rules with `(fusionScore ?? 0) > 0`. When no such rule contributes a recall-safe blocker, `getCandidates` SHALL return undefined so the caller scores the full Fusion identity baseline. When the account has no non-missing value for any indexable mandatory attribute, `getCandidates` SHALL return an empty set as specified by mandatory-missing block events.

#### Scenario: Trigram index pre-filters candidates

- **WHEN** buildTrigramIndex is called with a set of fusion identities
- **THEN** MatchingService SHALL build recall-safe blocking indexes on FusionRun for mandatory Binary and LIG3 rules with positive fusionScore
- **AND** getCandidates SHALL NOT require identities to share a padded trigram in order to remain reachable for Jaro-Winkler, Dice, double-metaphone, name-matcher, or custom Velocity mandatory rules

#### Scenario: Threshold-zero mandatory attribute is not indexed

- **GIVEN** a mandatory matching rule with fusionScore unset or zero
- **WHEN** buildTrigramIndex runs
- **THEN** that attribute SHALL NOT appear in run.indexedMandatoryAttributes
- **AND** identities lacking that attribute SHALL remain reachable as candidates when other rules allow a match

### Requirement: MatchingService receives FusionRun for state access

MatchingService SHALL receive FusionRun at construction time and read/write all shared state through it. MatchingService SHALL NOT hold internal mutable state beyond configuration. Candidate blocking indexes (including Binary exact-value indexes, LIG3 length buckets, and any remaining trigram maps), `indexedMandatoryAttributes`, `trigramIndexBuilt`, normalization caches (`normalizedCache`, `nameNormalizedCache`), and name-matcher artifact caches (`nameMatcherTokenCache`, `nameMatcherPhoneticCache`) SHALL live on FusionRun, not on MatchingService.

#### Scenario: MatchingService reads fusion identities from FusionRun
- **WHEN** MatchingService needs the set of existing fusion identities
- **THEN** it SHALL read from run.fusionIdentityMap, not from a service-local cache

#### Scenario: Match outcome dispatch writes domain results to FusionRun
- **WHEN** MatchOutcomeDispatcher creates a new Fusion account from a non-match or completes an automatic merge
- **THEN** new or updated accounts SHALL be written to run.fusionAccountMap
- **AND** auto-merged identity IDs SHALL be written to run.autoMergedIdentityIds when applicable

#### Scenario: MatchingService builds trigram index on FusionRun
- **WHEN** MatchingService.buildTrigramIndex is called
- **THEN** it SHALL populate run.trigramIndexByAttribute, run.indexedMandatoryAttributes, and run.trigramIndexBuilt when those structures still apply
- **AND** it SHALL populate FusionRun fields for Binary and LIG3 blocking indexes when those algorithms are configured
- **AND** there SHALL be no blocking-index fields on MatchingService

#### Scenario: MatchingService uses normalization caches from FusionRun
- **WHEN** MatchingService normalizes a string value for scoring
- **THEN** it SHALL read and write run.normalizedCache and run.nameNormalizedCache
- **AND** there SHALL be no normalizedCache or nameNormalizedCache fields on MatchingService

#### Scenario: Name-matcher token splits are cached on FusionRun
- **GIVEN** a normalized name string produced by the name-matcher normalization path
- **WHEN** name-matcher scoring splits that string into tokens more than once during the same operation run
- **THEN** the token array SHALL be read from run.nameMatcherTokenCache after the first split
- **AND** MatchingService SHALL NOT re-split the same normalized string on every comparison

#### Scenario: Name-matcher phonetic codes are cached on FusionRun
- **GIVEN** a name token with length greater than one
- **WHEN** name-matcher phonetic scoring encodes that token more than once during the same operation run
- **THEN** doubleMetaphone SHALL be invoked at most once for that token
- **AND** subsequent comparisons SHALL read codes from run.nameMatcherPhoneticCache

### Requirement: MatchOutcomeDispatcher dispatches exact match → automatic merge

When scoring produces an exact match (all evaluated rules score 100, none skipped) and automatic merge is enabled, MatchOutcomeDispatcher SHALL create a synthetic decision and merge the managed account into the matching Fusion identity without creating a review form. When more than one retained identity match is exact, MatchOutcomeDispatcher SHALL merge into the rank-1 identity after top-K form sort (combined score, then identity id), not whichever identity was compared first.

#### Scenario: Exact match triggers automatic merge
- **GIVEN** automatic merge is enabled and scoring produces an exact match
- **WHEN** MatchOutcomeDispatcher handles the outcome
- **THEN** a synthetic FusionDecision SHALL be created with `automaticMerge: true`
- **AND** the managed account SHALL be merged into the matching Fusion identity
- **AND** no review form SHALL be created

#### Scenario: Two exact matches auto-merge the rank-1 identity
- **GIVEN** automatic merge is enabled
- **AND** two identities are exact matches after identity-phase scoring
- **WHEN** MatchOutcomeDispatcher handles the outcome
- **THEN** the managed account SHALL be merged into the identity that sorts first by form candidate order
- **AND** the other exact match SHALL NOT receive the automatic merge

### Requirement: MatchingService tracks mandatory-missing block events

When a built candidate-blocking index has indexable mandatory attributes and a managed account has no non-missing value for any of those attributes, MatchingService SHALL return an empty candidate set from getCandidates, increment run.mandatoryMissingBlockCount on FusionRun, and SHALL NOT increment run.fullScanFallbackCount for that event. When a LogService is provided, MatchingService SHALL emit throttled warning logs (first five events, then every 100th) describing mandatory-attribute blocking with zero candidates. MatchingService SHALL return undefined from getCandidates only when no recall-safe blocker applies (including index not built or no indexable mandatory attributes that can filter), preserving caller full-scan fallback for that case.

#### Scenario: Missing all indexed mandatory values returns empty set
- **GIVEN** a built blocking index with at least one indexable mandatory attribute
- **AND** a managed account with missing or empty values for all indexed mandatory attributes
- **WHEN** getCandidates is called with the account
- **THEN** the method SHALL return an empty Set
- **AND** run.mandatoryMissingBlockCount SHALL increment by one
- **AND** run.fullScanFallbackCount SHALL remain unchanged

#### Scenario: Unbuilt index does not increment mandatory missing block counter
- **GIVEN** run.trigramIndexBuilt is false
- **WHEN** getCandidates is called
- **THEN** the method SHALL return undefined
- **AND** run.mandatoryMissingBlockCount SHALL remain unchanged

#### Scenario: Identity scoring performs zero comparisons for empty set
- **GIVEN** getCandidates returns an empty Set for a managed account
- **WHEN** match outcome dispatch scores identity candidates for that account
- **THEN** scoreFusionAccount SHALL perform zero identity comparisons
- **AND** the dispatcher SHALL NOT iterate run.allFusionIdentities for that account
