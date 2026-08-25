## MODIFIED Requirements

### Requirement: MatchingService builds and queries trigram blocking index

MatchingService SHALL build a trigram blocking index over fusion identities for mandatory matching attributes whose effective minimum similarity (`fusionScore`) is strictly greater than zero. Mandatory rules with threshold zero or unset SHALL NOT be indexed. The index SHALL be built on FusionRun. The index SHALL be queried to pre-filter identity candidates before running full similarity scoring.

#### Scenario: Trigram index pre-filters candidates
- **WHEN** buildTrigramIndex is called with a set of fusion identities
- **THEN** per-attribute inverted trigram maps SHALL be built on run.trigramIndexByAttribute for each indexable mandatory matching attribute
- **AND** getCandidates SHALL return only identities sharing at least one trigram with the account's attribute values

#### Scenario: Threshold-zero mandatory attribute is not indexed
- **GIVEN** a mandatory matching rule with fusionScore unset or zero
- **WHEN** buildTrigramIndex runs
- **THEN** that attribute SHALL NOT appear in run.indexedMandatoryAttributes
- **AND** identities lacking that attribute SHALL remain reachable as candidates when other rules allow a match

### Requirement: MatchingService tracks mandatory-missing block events

When a built trigram index has indexable mandatory attributes and a managed account has no non-missing value for any of those attributes, MatchingService SHALL return an empty candidate set from getCandidates, increment run.mandatoryMissingBlockCount on FusionRun, and SHALL NOT increment run.fullScanFallbackCount for that event. When a LogService is provided, MatchingService SHALL emit throttled warning logs (first five events, then every 100th) describing mandatory-attribute blocking with zero candidates. MatchingService SHALL return undefined from getCandidates only when trigram blocking was not possible (index not built or no indexable mandatory attributes), preserving caller full-scan fallback for that case.

#### Scenario: Missing all indexed mandatory values returns empty set
- **GIVEN** a built trigram index with at least one indexable mandatory attribute
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

## REMOVED Requirements

### Requirement: MatchingService tracks full-scan trigram fallback events

**Reason**: Mandatory-missing accounts no longer fall back to a full identity scan; they receive an empty candidate set and a separate counter. Full-scan fallback remains only when getCandidates returns undefined because blocking was not configured.

**Migration**: Replace scenarios that expect undefined and fullScanFallbackCount increment for missing mandatory values with empty-set and mandatoryMissingBlockCount behavior. Retain fullScanFallbackCount only for undefined returns when applicable to future blocking-unavailable cases, or remove increment paths that no longer occur.
