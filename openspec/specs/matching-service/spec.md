# matching-service Spec

## Purpose

The match service (`src/services/matchingService/`) provides weighted scoring algorithms and trigram blocking for the Match step. `MatchOutcomeDispatcher` in the same package owns match outcome dispatch and the two-sweep matching lifecycle (identity scoring sweep → deferred drain). All scoring algorithms from the former ScoringService remain in effect under the new name.

## Public API

**MatchingService** (`matchingService.ts`) — scoring and blocking only:

| Method | Caller | Purpose |
|--------|--------|---------|
| `buildTrigramIndex(identities)` | FusionService (init) | Mandatory-attribute trigram index on FusionRun |
| `getCandidates(account, log?, excludeIds?)` | MatchOutcomeDispatcher | Pre-filter identity candidates before full scan |
| `scoreFusionAccount(...)` | MatchOutcomeDispatcher | Score account against identity or deferred candidate pool |
| `getScore(attribute)` | Callers needing thresholds | Lookup configured fusion score for an attribute |

MatchingService SHALL NOT expose sweep orchestration (`processUncorrelatedManagedAccounts`) or outcome handlers (merge, form creation, non-match registration). Those belong to **MatchOutcomeDispatcher** — see `match-outcome-dispatch/spec.md`.

## Requirements
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

### Requirement: MatchOutcomeDispatcher dispatches identity match → partial match review

When scoring produces identity-candidate matches but no exact match (or automatic merge is disabled), MatchOutcomeDispatcher SHALL create a review form with the highest-scoring identity candidates presenting merge-with-existing-identity and create-new-identity options.

#### Scenario: Identity match creates review form
- **GIVEN** scoring produces identity-candidate matches with combined scores above threshold
- **WHEN** MatchOutcomeDispatcher handles the outcome
- **THEN** a review form SHALL be created via FormService
- **AND** the form SHALL include the top candidates up to maxCandidatesForForm
- **AND** the FusionAccount's identity references SHALL be cleared after form creation

### Requirement: Record-only unique registration bulk pre-pass

When a managed account belongs to a Record-type source with `includeRecordAccountsForMatching` false, FusionService SHALL register its unique attribute values in a bulk **record unique registration** phase before the uncorrelated match sweep. Such accounts SHALL NOT enter Match scoring or full `AccountAssembly.assembleManagedAccount` processing. Registration SHALL use selective attribute mapping (targets coincident with unique definition names) followed by `DefinitionService.registerUniqueAttributes`, then remove the account from the managed-account work queue.

#### Scenario: Match-disabled record account bypasses uncorrelated sweep

- **GIVEN** a Record-type source with `includeRecordAccountsForMatching: false`
- **AND** an uncorrelated managed account from that source with a mappable unique attribute value
- **WHEN** the record unique registration phase runs
- **THEN** the account's unique values SHALL be registered via DefinitionService
- **AND** the account SHALL be removed from `managedAccountsById` before uncorrelated match sweep begins
- **AND** Match scoring SHALL NOT be invoked for that account

#### Scenario: Record with match enabled still uses match sweep

- **GIVEN** a Record-type source with `includeRecordAccountsForMatching: true` (or omitted, default true)
- **WHEN** managed account processing runs
- **THEN** the account SHALL NOT be handled solely by the bulk record unique registration phase
- **AND** existing match sweep behavior SHALL apply

#### Scenario: Form decision record no-match reuses registration helper

- **GIVEN** a finished fusion review decision with `newIdentity: true` on a Record-type source
- **WHEN** DecisionProcessor handles the record no-match outcome
- **THEN** unique attributes SHALL be registered using the same selective map + register helper as the bulk phase
- **AND** no Fusion account SHALL be created

### Requirement: MatchOutcomeDispatcher dispatches non-match per source type

When no identity candidates meet the threshold, MatchOutcomeDispatcher SHALL apply source-type-specific policies: authoritative accounts produce new Fusion accounts, record accounts register unique attributes only, orphan accounts may be disabled. Record accounts whose source has `includeRecordAccountsForMatching` false SHALL be registered in the bulk record unique registration phase and SHALL NOT reach this dispatch path during uncorrelated sweep.

#### Scenario: Authoritative non-match creates new Fusion account
- **GIVEN** an authoritative managed account with no matches
- **WHEN** MatchOutcomeDispatcher handles the outcome
- **THEN** a new Fusion account SHALL be created and registered in FusionRun

#### Scenario: Record non-match registers unique attributes
- **GIVEN** a record-source managed account with no matches and match scoring enabled for that source
- **WHEN** MatchOutcomeDispatcher handles the outcome
- **THEN** unique attributes SHALL be registered via DefinitionService
- **AND** no Fusion account SHALL be created

#### Scenario: Match-disabled record account already registered in pre-pass

- **GIVEN** a record-source managed account with `includeRecordAccountsForMatching: false`
- **WHEN** the record unique registration phase completes
- **THEN** the account SHALL NOT appear in the uncorrelated match sweep queue
- **AND** unique values SHALL already be present in DefinitionService registries

### Requirement: MatchOutcomeDispatcher handles deferred candidate matching

When scoring produces deferred-candidate matches, MatchOutcomeDispatcher SHALL defer identity creation for the incoming managed account by not producing a new Fusion account for that account in the current run. Pending accounts in the deferred drain SHALL be scored against both finalized candidates (persisted fusion anchors from prior runs and materialized non-match anchors from the current sweep) and remaining pending queue peers. When a deferred match includes pending queue peers among its candidates, those peers SHALL be promoted to non-match Fusion accounts and removed from the pending queue.

#### Scenario: Deferred match skips the incoming account and promotes matched peers
- **GIVEN** a managed account with deferred-candidate matches against candidates in the pool (persisted, finalized, or pending)
- **WHEN** MatchOutcomeDispatcher handles the deferred outcome
- **THEN** the incoming managed account SHALL be removed from the work queue
- **AND** no Fusion account SHALL be created for the incoming account in this run
- **AND** any matched pending peers SHALL be promoted to non-match Fusion accounts and removed from the pending queue

#### Scenario: Clique produces one deferred match with multiple promoted candidates
- **GIVEN** N managed accounts from the same deferred-enabled source with no persisted anchors and mutual deferred-match scores
- **WHEN** the deferred drain completes for that source
- **THEN** exactly one account SHALL be held back as a deferred match
- **AND** the remaining N−1 matched accounts SHALL be promoted to non-match Fusion account anchors
- **AND** the deferred match SHALL report all promoted candidates

### Requirement: MatchingService owns the CandidateRegistry

MatchingService SHALL NOT maintain a separate CandidateRegistry object. Deferred candidate pool state SHALL live on FusionRun. MatchOutcomeDispatcher SHALL read and mutate the deferred candidate pool through FusionRun APIs (`registerPersistedDeferredCandidate`, `registerFinalizedDeferredCandidate`, `currentRunDeferredCandidatesForSource`, and related run methods). FusionService SHALL seed persisted fusion anchors into the pool during `initializeManagedAccountProcessing` before uncorrelated sweep begins.

#### Scenario: Candidates registered during identity sweep

- **WHEN** an authoritative account from a deferred-enabled source has no identity match during identity phase
- **THEN** the account SHALL be classified as deferred-pending by MatchOutcomeDispatcher
- **AND** it SHALL NOT be bulk-registered in the deferred pool before the deferred drain

#### Scenario: Persisted anchors seeded at sweep start

- **WHEN** managed account processing initializes for a deferred-enabled source with existing fusion accounts
- **THEN** those fusion accounts SHALL be registered as persisted deferred candidates on FusionRun for the managed source (using `originSource` bucketing)
- **AND** they SHALL be visible to the first pending account scored in the deferred drain

#### Scenario: Materialized anchor joins pool

- **WHEN** a pending account is classified as non-match during the deferred drain
- **THEN** its Fusion account SHALL be registered as an anchor deferred candidate on FusionRun for subsequent pending accounts in the same source during the same sweep

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

### Requirement: MatchingService exposes scoring algorithms

MatchingService SHALL expose the same scoring algorithms as the former ScoringService: binary, jaro-winkler, dice, double-metaphone, lig3, name-matcher, custom-velocity. All algorithm contracts from the former scoring-service spec remain in effect.

#### Scenario: Binary algorithm returns 100 for exact match
- **WHEN** binary algorithm compares "abc123" and "abc123"
- **THEN** score is 100 and isMatch is true

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

### Requirement: Binary algorithm produces a 100 score only for identical string values

The system SHALL, when the configured matching algorithm is `binary`, compute a score of 100 if and only if the account value and the candidate identity value are identical strings. All other comparisons SHALL produce a score of 0.

#### Scenario: Exact string match
- **WHEN** the account value is `"abc123"` and the candidate identity value is `"abc123"` and the rule algorithm is `binary`
- **THEN** the score is 100 and `isMatch` is true when the threshold is 100

#### Scenario: Different string values
- **WHEN** the account value is `"abc123"` and the candidate identity value is `"xyz789"` and the rule algorithm is `binary`
- **THEN** the score is 0 and `isMatch` is false

#### Scenario: Case-sensitive comparison
- **WHEN** the account value is `"ABC123"` and the candidate identity value is `"abc123"` and the rule algorithm is `binary`
- **THEN** the score is 0 and `isMatch` is false

#### Scenario: Whitespace-sensitive comparison
- **WHEN** the account value is `"abc123"` and the candidate identity value is `" abc123 "` and the rule algorithm is `binary`
- **THEN** the score is 0 and `isMatch` is false

### Requirement: Binary algorithm handles missing values as a non-match

The system SHALL produce a score of 0 for the `binary` algorithm when either the account value or the candidate identity value is missing, empty, or whitespace-only. Existing skip-on-missing configuration SHALL continue to apply unchanged.

#### Scenario: Account value is missing
- **WHEN** the account value is missing and the candidate identity value is `"abc123"` and the rule algorithm is `binary`
- **THEN** the score is 0 and the rule is skipped if `skipMatchIfMissing` is true

#### Scenario: Both values are missing
- **WHEN** both the account value and the candidate identity value are missing and the rule algorithm is `binary`
- **THEN** the score is 0 and the rule is skipped if `skipMatchIfMissing` is true

### Requirement: Binary algorithm is selectable in matching configuration

The system SHALL accept `binary` as a valid value for `MatchingConfig.algorithm` and expose it as a selectable option in `connector-spec.json`.

#### Scenario: Configuring a binary rule
- **WHEN** an administrator creates a matching rule with `algorithm: "binary"` and `fusionScore: 100`
- **THEN** the configuration is valid and the rule is evaluated using the binary exact-match scorer

### Requirement: Binary algorithm is labeled in forms and messages

The system SHALL display the friendly label "Binary (Exact Match)" wherever algorithm names are rendered in review forms and messaging helpers.

#### Scenario: Review form renders algorithm name
- **WHEN** a review form includes a score row produced by the `binary` algorithm
- **THEN** the rendered algorithm label is "Binary (Exact Match)"

### Requirement: Matching rules support a skip-if-threshold-not-met toggle

Each Fusion attribute match rule SHALL expose a `skipMatchIfThresholdNotMet` boolean option. When enabled, the rule SHALL be excluded from the weighted combined score whenever its computed similarity is strictly below the rule's configured minimum similarity (`fusionScore`).

#### Scenario: Toggle defaults to disabled
- **GIVEN** a matching rule with no `skipMatchIfThresholdNotMet` value configured
- **WHEN** the rule is evaluated
- **THEN** the rule is treated as if `skipMatchIfThresholdNotMet` is false
- **AND** a below-threshold score still contributes its raw similarity to the combined score

#### Scenario: Toggle appears in connector-spec.json
- **GIVEN** the connector specification UI schema
- **WHEN** an administrator expands a Fusion attribute match rule
- **THEN** a toggle labeled **Skip match if threshold not met** is present
- **AND** its help text explains that below-threshold rules are excluded from the combined score

### Requirement: Below-threshold rules are skipped when the toggle is enabled

When `skipMatchIfThresholdNotMet` is true for a non-mandatory rule and the rule's computed similarity is below its `fusionScore`, the rule SHALL be recorded as skipped and SHALL NOT contribute weight or raw score to the weighted combined score.

#### Scenario: Passing rule still contributes normally
- **GIVEN** a non-mandatory rule with `fusionScore: 80`, `skipMatchIfThresholdNotMet: true`, and computed similarity `85`
- **WHEN** the combined score is calculated
- **THEN** the rule contributes its weight and raw score to the weighted combined score
- **AND** it is not marked as skipped

#### Scenario: Failing rule is skipped from combined score
- **GIVEN** a non-mandatory rule with `fusionScore: 80`, `skipMatchIfThresholdNotMet: true`, and computed similarity `60`
- **WHEN** the combined score is calculated
- **THEN** the rule is marked as skipped with a comment indicating the score was below threshold
- **AND** the rule contributes zero weight and zero raw score to the weighted combined score

#### Scenario: Combined score is recalculated without skipped threshold rules
- **GIVEN** two non-mandatory rules, both with `fusionScore: 80`
- **AND** the first rule has similarity `90` and `skipMatchIfThresholdNotMet: false`
- **AND** the second rule has similarity `60` and `skipMatchIfThresholdNotMet: true`
- **WHEN** the combined score is calculated
- **THEN** only the first rule's weight and raw score are used
- **AND** the combined score equals `90` (not a weighted blend of `90` and `60`)

### Requirement: Mandatory rules ignore the threshold-skip toggle

Mandatory rules SHALL always be evaluated against their minimum similarity. A mandatory rule with a below-threshold score SHALL fail and invalidate the candidate, regardless of the `skipMatchIfThresholdNotMet` value.

#### Scenario: Mandatory below-threshold rule fails even when skip is enabled
- **GIVEN** a mandatory rule with `fusionScore: 80` and `skipMatchIfThresholdNotMet: true`
- **AND** the rule's computed similarity is `60`
- **WHEN** the candidate is scored
- **THEN** the candidate is rejected
- **AND** the rule is recorded as not skipped and not a match

#### Scenario: Mandatory passing rule contributes normally
- **GIVEN** a mandatory rule with `fusionScore: 80` and `skipMatchIfThresholdNotMet: true`
- **AND** the rule's computed similarity is `90`
- **WHEN** the combined score is calculated
- **THEN** the rule contributes its weight and raw score to the combined score

### Requirement: Skipped threshold rules do not affect exact-match checks

The connector's exact-match automatic merge logic SHALL consider only non-skipped rules. A rule skipped due to `skipMatchIfThresholdNotMet` SHALL NOT be required to be an exact match for the candidate to qualify as an exact match.

#### Scenario: Exact-match auto-merge ignores threshold-skipped rules
- **GIVEN** automatic merge is enabled
- **AND** one evaluated rule scores `100` and is an exact match
- **AND** a second rule has `skipMatchIfThresholdNotMet: true` and scores below its threshold
- **WHEN** the exact-match determination runs
- **THEN** the candidate may still be treated as an exact match based on the non-skipped rule

### Requirement: Matching iterations SHALL avoid array allocations

When iterating over multiple Set collections of account IDs during the identity matching evaluation, MatchingService SHALL iterate them sequentially using direct `for...of` loops rather than combining them via array spread syntax (`[...setA, ...setB]`), to avoid O(N) memory allocations per invocation on hot paths.

#### Scenario: Identity matching iterates candidate sets directly
- **WHEN** MatchingService evaluates identity candidates for a managed account
- **THEN** the matching loop iterates directly over `accountIdsSet` and `missingAccountIdsSet` without allocating an intermediate array

### Requirement: MatchOutcomeDispatcher delegates mode-gate logic to AccountAssembly

MatchOutcomeDispatcher SHALL delegate aggregation-mode detection to the injected `AccountAssembly` collaborator. MatchOutcomeDispatcher SHALL NOT own its own copy of `isAggregationAccountListMode`.

#### Scenario: Aggregation mode checked via AccountAssembly
- **WHEN** MatchOutcomeDispatcher needs to determine if the current operation is an aggregation run
- **THEN** it SHALL call `this.deps.accountAssembly.isAggregationAccountListMode()`
- **AND** the method definition SHALL NOT exist on MatchOutcomeDispatcher

### Requirement: Non-match identity comparisons avoid score breakdown allocation

When comparing a managed account against an identity candidate during identity-sweep scoring (`MatchCandidateType.Identity`), `compareFusionAccounts` SHALL compute the combined score using running numeric rule totals without allocating individual per-rule `ScoreReport` objects. Full score breakdowns SHALL be materialized only when the combined score passes the threshold and a `FusionMatch` is stored, reconstructed from the numeric totals without re-invoking scorers. Deferred candidate comparisons (`MatchCandidateType.Deferred`) SHALL continue to build a full `ScoreReport[]` breakdown regardless of match outcome.

#### Scenario: Non-match comparison produces no stored match without breakdown allocation

- **GIVEN** `candidateType` is `Identity`
- **AND** a managed account and identity candidate produce a combined score below the manual review threshold
- **WHEN** `compareFusionAccounts` evaluates the pair
- **THEN** no `FusionMatch` SHALL be added to the fusion account
- **AND** the comparison SHALL NOT allocate individual per-rule `ScoreReport` objects

#### Scenario: Threshold-passing comparison stores full breakdown

- **GIVEN** `candidateType` is `Identity`
- **AND** a managed account and identity candidate produce a combined score at or above the manual review threshold with no failed mandatory rules
- **WHEN** `compareFusionAccounts` evaluates the pair
- **THEN** a `FusionMatch` SHALL be added with a complete `scores` breakdown including per-rule rows and the combined score row
- **AND** each configured scorer SHALL be invoked at most once for that pair
- **AND** match outcome behavior SHALL be identical to the pre-change full-path behavior

#### Scenario: Mandatory-failed comparison exits without stored match

- **GIVEN** `candidateType` is `Identity` and a mandatory rule fails during fast-path evaluation
- **WHEN** `compareFusionAccounts` evaluates the pair
- **THEN** no `FusionMatch` SHALL be stored
- **AND** the comparison SHALL NOT allocate per-rule `ScoreReport` objects for the non-match outcome

#### Scenario: Deferred candidate comparisons always use full breakdown

- **GIVEN** `candidateType` is `Deferred`
- **WHEN** `compareFusionAccounts` evaluates a deferred candidate pair
- **THEN** a full `ScoreReport[]` breakdown SHALL be built regardless of match outcome

### Requirement: Jaro similarity uses zero-initialized typed match flags

`jaroSimilarity` (used by Jaro-Winkler scoring) SHALL track character matches using zero-initialized `Uint8Array` buffers sized to each input string length. Match assignments SHALL use numeric flags (`1` for matched, `0` for unmatched). The function SHALL produce identical Jaro similarity numeric results to the prior boolean-array implementation for all input pairs.

#### Scenario: Jaro scores unchanged for standard inputs
- **GIVEN** string pairs covered by existing `stringComparison.test.ts` cases
- **WHEN** Jaro-Winkler similarity is computed
- **THEN** scores SHALL match pre-change baseline values exactly

#### Scenario: Jaro handles no-match edge case
- **GIVEN** two strings with no characters within the Jaro match window
- **WHEN** `jaroSimilarity` is called
- **THEN** the result SHALL be `0.0`

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

### Requirement: Trigram window extraction uses padded substring windows

`extractTrigrams` and `queryAttributeIndex` SHALL derive each 3-character trigram from a padded normalized string using `substring(i, i + 3)` over the standard padding template `` `  ${normalized} ` ``. The sliding window SHALL iterate from index `0` through `len - 3` inclusive. The resulting trigram sets and candidate query results MUST be identical to pre-optimization behavior for all LIG3-normalized inputs.

#### Scenario: extractTrigrams produces standard padded windows
- **GIVEN** a LIG3-normalized value `"foo"`
- **WHEN** `extractTrigrams` is called
- **THEN** the returned set SHALL equal `['  f', ' fo', 'foo', 'oo ']`
- **AND** the set size SHALL match the pre-optimization window count

#### Scenario: extractTrigrams handles short and empty values
- **GIVEN** normalized values `"a"` and `""`
- **WHEN** `extractTrigrams` is called for each
- **THEN** `"a"` SHALL yield `['  a', ' a ']`
- **AND** `""` SHALL yield `['   ']`

#### Scenario: queryAttributeIndex returns identical candidates
- **GIVEN** a trigram index built from fusion identities sharing trigrams with a query value
- **WHEN** `queryAttributeIndex` is called with that query value
- **THEN** the returned `Set<FusionAccount>` SHALL contain exactly the identities sharing at least one trigram
- **AND** each identity SHALL appear at most once regardless of multiple shared trigrams

#### Scenario: queryAttributeIndex returns empty set on no match
- **GIVEN** a trigram index where no bucket key overlaps the query value's trigrams
- **WHEN** `queryAttributeIndex` is called
- **THEN** an empty set SHALL be returned (not `undefined`)



