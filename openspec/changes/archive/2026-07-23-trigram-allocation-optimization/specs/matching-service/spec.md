## ADDED Requirements

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
