## MODIFIED Requirements

### Requirement: MatchingService receives FusionRun for state access

MatchingService SHALL receive FusionRun at construction time and read/write all shared state through it. MatchingService SHALL NOT hold internal mutable state beyond configuration. The trigram index (`trigramIndexByAttribute`, `indexedMandatoryAttributes`, `trigramIndexBuilt`), normalization caches (`normalizedCache`, `nameNormalizedCache`), and name-matcher artifact caches (`nameMatcherTokenCache`, `nameMatcherPhoneticCache`) SHALL live on FusionRun, not on MatchingService.

#### Scenario: MatchingService reads fusion identities from FusionRun

- **WHEN** MatchingService needs the set of existing fusion identities
- **THEN** it SHALL read from run.fusionIdentityMap, not from a service-local cache

#### Scenario: Match outcome dispatch writes domain results to FusionRun

- **WHEN** MatchOutcomeDispatcher creates a new Fusion account from a non-match or completes an automatic merge
- **THEN** new or updated accounts SHALL be written to run.fusionAccountMap
- **AND** auto-merged identity IDs SHALL be written to run.autoMergedIdentityIds when applicable

#### Scenario: MatchingService builds trigram index on FusionRun

- **WHEN** MatchingService.buildTrigramIndex is called
- **THEN** it SHALL populate run.trigramIndexByAttribute, run.indexedMandatoryAttributes, and run.trigramIndexBuilt
- **AND** there SHALL be no trigramIndexByAttribute, indexedMandatoryAttributes, or trigramIndexBuilt fields on MatchingService

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
