## ADDED Requirements

### Requirement: Glossary defines candidate blocking terms

The ubiquitous-language glossary SHALL define **Candidate blocking**, **Algorithm-aware blocking**, **Top-K identity matches**, and **Exhaustive-scoring oracle** under Matching and scoring.

**Candidate blocking** is a recall-safe pre-filter that selects which Fusion identities MAY be scored for one uncorrelated managed account. Identities outside the candidate set MUST NOT be able to pass the configured matching rules.

**Algorithm-aware blocking** is candidate blocking whose predicates are proven for the matching algorithms in force. Generic shared-trigram intersection is not algorithm-aware for Jaro-Winkler, name-matcher, or custom Velocity unless a bound proves it cannot drop a passing identity.

**Top-K identity matches** are the K highest combined-score identity candidates that pass the review threshold, independent of scoring iteration order. K is `fusionMaxCandidatesForForm`. This is distinct from stopping after the first K passing identities encountered.

**Exhaustive-scoring oracle** is a test-only path that scores a managed account against every identity in a small fixture with no blocking and no first-K stop, used to assert top-K equivalence of the production path. It is not production full-scan scoring and MUST NOT run against a 100k-identity baseline.

#### Scenario: Glossary entry for Candidate blocking

- **WHEN** a reader consults the Matching and scoring glossary
- **THEN** it SHALL contain a **Candidate blocking** entry
- **AND** the entry SHALL state that identities outside the candidate set MUST NOT be able to pass configured matching rules

#### Scenario: Glossary entry for Algorithm-aware blocking

- **WHEN** a reader consults the Matching and scoring glossary
- **THEN** it SHALL contain an **Algorithm-aware blocking** entry
- **AND** the entry SHALL reject generic padded-trigram intersection as the sole filter for algorithms without a proven bound

#### Scenario: Glossary entry for Top-K identity matches

- **WHEN** a reader consults the Matching and scoring glossary
- **THEN** it SHALL contain a **Top-K identity matches** entry
- **AND** the entry SHALL distinguish top-K from first-K encounter order
- **AND** K SHALL be identified as `fusionMaxCandidatesForForm`

#### Scenario: Glossary entry for Exhaustive-scoring oracle

- **WHEN** a reader consults the Matching and scoring glossary
- **THEN** it SHALL contain an **Exhaustive-scoring oracle** entry
- **AND** the entry SHALL state that the oracle is test-only and MUST NOT exhaustive-score a 100k-identity baseline
