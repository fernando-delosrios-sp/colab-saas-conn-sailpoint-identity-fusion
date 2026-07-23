## ADDED Requirements

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

### Requirement: MatchingService tracks full-scan trigram fallback events

When `getCandidates` cannot produce a candidate set because the managed account has no value for any mandatory trigram-indexed attribute, MatchingService SHALL increment `run.fullScanFallbackCount` on FusionRun. When a `LogService` is provided, MatchingService SHALL emit throttled warning logs for the first five fallback events and every 100th subsequent event in the same run. MatchingService SHALL NOT increment the counter when returning `undefined` because the trigram index is not built or has no indexed mandatory attributes.

#### Scenario: Missing mandatory attributes increment fallback counter
- **GIVEN** a built trigram index with indexed mandatory attributes
- **AND** a managed account with empty or missing values for all those attributes
- **WHEN** `getCandidates` is called with the account
- **THEN** the method SHALL return `undefined`
- **AND** `run.fullScanFallbackCount` SHALL increment by one

#### Scenario: Unbuilt index does not increment fallback counter
- **GIVEN** `run.trigramIndexBuilt` is false
- **WHEN** `getCandidates` is called
- **THEN** the method SHALL return `undefined`
- **AND** `run.fullScanFallbackCount` SHALL remain unchanged

#### Scenario: Throttled warning on fallback with log
- **GIVEN** a built trigram index and a managed account triggering full-scan fallback
- **AND** a LogService passed to `getCandidates`
- **WHEN** the fallback occurs as the first event in the run
- **THEN** a warning log SHALL be emitted describing the full identity scan fallback

#### Scenario: Dispatcher still falls back to all identities
- **GIVEN** `getCandidates` returns `undefined` due to missing mandatory attribute values
- **WHEN** match outcome dispatch scores the account
- **THEN** scoring SHALL iterate all fusion identities (existing full-scan behavior preserved)
