# ubiquitous-language Spec

## Purpose

This spec defines the canonical domain terms and their usage requirements across the connector, its configuration, and its documentation. The ubiquitous language ensures consistent terminology between developers, domain experts, and AI agents.

This spec is the master reference for the project's domain vocabulary. `docs/concepts/glossary.md` is a user-friendly mirror and MUST be kept aligned with this spec.

## Requirements

### Requirement: This spec is the source of truth for domain vocabulary

`openspec/specs/ubiquitous-language/spec.md` SHALL be the authoritative source for canonical domain terms, definitions, and usage rules. `docs/concepts/glossary.md` and all other artifacts SHALL reflect the definitions in this spec.

#### Scenario: Glossary entry conflicts with spec
- **WHEN** a glossary entry uses a different definition or term than this spec
- **THEN** the glossary MUST be updated to match this spec

#### Scenario: Code uses a term not defined in the spec
- **WHEN** a developer introduces a new domain term in code or documentation
- **THEN** the term SHALL be added to this spec before it is used elsewhere

### Requirement: New domain terms are added to the spec before use

All new domain terms, states, or classifications SHALL be defined in this spec before they are used in code, configuration, or documentation.

#### Scenario: Introducing a new account state
- **WHEN** a new account state or processing outcome is introduced
- **THEN** it SHALL be defined in this spec with a precise name, definition, and usage rule before appearing in code or configuration

#### Scenario: Introducing a new candidate type
- **WHEN** a new candidate type or classification is introduced
- **THEN** it SHALL be defined in this spec before it is used in types, APIs, or dry-run output

### Requirement: Code uses canonical terms

Source code SHALL use the canonical terms from this spec for variable names, function names, type names, class names, file names, and comments.

#### Scenario: Variable naming follows ubiquitous language
- **WHEN** a developer declares a variable representing a domain concept
- **THEN** the variable name SHALL match the canonical term (e.g., `fusionAccount`, not `consolidatedAccount`; `managedSourceAccount`, not `rawAccount`)

#### Scenario: Function naming follows ubiquitous language
- **WHEN** a developer creates a function that operates on domain concepts
- **THEN** the function name SHALL use canonical terms (e.g., `scoreIdentityCandidates`, not `analyzeIdentityPhase`; `hasDeferredMatches`, not `hasNewUnmatchedPeerMatches`)

#### Scenario: Type naming follows ubiquitous language
- **WHEN** a developer defines a type, enum, or class for a domain concept
- **THEN** the type name SHALL use canonical terms (e.g., `MatchCandidateType.Deferred`, not `NewUnmatched`; `ManagedAccountMatchingRunner`, not `ManagedAccountPassRunner`)

### Requirement: Configuration uses canonical terms

Connector configuration (`connector-spec.json`, settings definitions, and UI labels) SHALL use canonical terms for field names, labels, help text, and option values.

#### Scenario: Configuration field naming
- **WHEN** a configuration field represents a domain concept
- **THEN** the field name and label SHALL use the canonical term

#### Scenario: Configuration help text
- **WHEN** help text explains a configuration option
- **THEN** the help text SHALL use canonical terms consistently

### Requirement: Documentation uses canonical terms

All documentation (`docs/`, `README.md`, inline comments) SHALL use canonical terms consistently. Retired terms (such as `consolidated account`, `raw account`, `pass`, or `new-unmatched`) SHALL be replaced with their canonical successors.

#### Scenario: Guide documentation
- **WHEN** a guide explains a concept or process
- **THEN** the guide SHALL use canonical terms (e.g., "Fusion account", not "consolidated account"; "deferred candidate", not "new-unmatched peer")

#### Scenario: Operation documentation
- **WHEN** an operation is documented
- **THEN** the documentation SHALL use canonical terms for inputs, outputs, phases, sweeps, and behavior

### Requirement: AI agents use canonical terms

AI agents (via `.agents/AGENTS.md` and related instructions) SHALL be instructed to use canonical terms when generating code, documentation, or configuration.

#### Scenario: Agent generates code
- **WHEN** an AI agent generates or modifies code
- **THEN** the agent SHALL use canonical terms for identifiers and comments

#### Scenario: Agent generates documentation
- **WHEN** an AI agent generates or modifies documentation
- **THEN** the agent SHALL use canonical terms consistently and SHALL retire outdated synonyms

### Requirement: Account taxonomy terms are used precisely

Code, configuration, and documentation SHALL use the account taxonomy defined in this spec and SHALL distinguish between ISC accounts, managed source accounts, Fusion accounts, Fusion identities, identity-origin Fusion accounts, and provisional Fusion accounts.

#### Scenario: Referring to an incoming source account
- **WHEN** describing an account fetched from a configured Fusion source
- **THEN** the term "managed source account" SHALL be used, not "raw account" or "source record"

#### Scenario: Referring to a pre-decision Fusion account
- **WHEN** describing a Fusion account created from a managed source account before its match fate is decided
- **THEN** the term "provisional Fusion account" SHALL be used

#### Scenario: Referring to a Fusion account seeded from an identity
- **WHEN** describing a Fusion account created from an existing ISC identity rather than a managed source account
- **THEN** the term "identity-origin Fusion account" SHALL be used, not "identity-based Fusion account"

### Requirement: Operation, phase, and sweep vocabulary is used consistently

The terms **operation**, **phase**, and **sweep** SHALL be used as defined in this spec. Generic terms such as "run", "pass", or "round" SHALL NOT be used when a more precise term applies.

#### Scenario: Naming a connector entry point
- **WHEN** referring to a connector entry point such as `std:account:list` or `custom:dryrun`
- **THEN** the term "operation" SHALL be used (e.g., "accountList operation", "dryRun operation")

#### Scenario: Naming a major pipeline stage
- **WHEN** referring to a major stage of an operation pipeline
- **THEN** the term "phase" SHALL be used (e.g., "managed accounts phase")

#### Scenario: Naming a focused account traversal
- **WHEN** referring to a traversal of a set of accounts with a single purpose within a phase
- **THEN** the term "sweep" SHALL be used, not "pass" or "round"

### Requirement: Matching and scoring are distinguished

The terms **matching** and **scoring** SHALL be used as defined in this spec. Matching is the business process; scoring is the similarity-calculation technique it uses. The product step name remains **Match**.

#### Scenario: Describing the business process
- **WHEN** describing whether a new Fusion account potentially belongs to an existing identity
- **THEN** the term "matching" SHALL be used

#### Scenario: Describing the similarity calculation
- **WHEN** describing the algorithmic computation of a similarity value
- **THEN** the term "scoring" SHALL be used

#### Scenario: Naming the product step
- **WHEN** referring to the Map/Define/Match step in user-facing documentation
- **THEN** the term "Match" (capitalized) SHALL be used

### Requirement: Candidate types are identity or deferred

Candidate types SHALL be **identity** or **deferred**. The retired term `new-unmatched` and its wire value `new-unmatched` SHALL NOT be used.

#### Scenario: Internal type naming
- **WHEN** defining a candidate type enum or constant
- **THEN** the value SHALL be `Deferred`, not `NewUnmatched`

#### Scenario: Dry-run wire output
- **WHEN** emitting candidate type in dry-run output
- **THEN** the wire value SHALL be `deferred` and SHALL NOT be translated from another internal value

### Requirement: Aggregation is qualified by source

The term **aggregation** SHALL refer to the ISC source-refresh operation. When ambiguity is possible, the terms **managed source aggregation** or **Fusion source aggregation** SHALL be used. Generic "processing run" SHALL be replaced with the specific operation name.

#### Scenario: Describing source refresh
- **WHEN** describing an ISC source-refresh operation
- **THEN** the term "aggregation" MAY be used

#### Scenario: Distinguishing source refreshes
- **WHEN** describing aggregation of a configured Fusion source versus a managed source
- **THEN** the terms "Fusion source aggregation" or "managed source aggregation" SHALL be used

#### Scenario: Describing a connector invocation
- **WHEN** describing the execution of a connector entry point
- **THEN** the specific operation name (e.g., "accountList operation") SHALL be used, not "processing run"

### Requirement: Retired terms are not reintroduced

Retired terms and symbols SHALL NOT be reintroduced into code, configuration, or documentation. Retired terms include, but are not limited to: `consolidated account`, `raw account`, `identity-based Fusion account`, `pass`, `round`, `new-unmatched`, `NewUnmatched`, `analyzeIdentityPhase`, `analyzeDeferredPhase`, `hasNewUnmatchedPeerMatches`, and `ManagedAccountPassRunner`.

#### Scenario: Code review discovers a retired term
- **WHEN** a code review finds a retired term in identifiers or comments
- **THEN** the contributor SHALL rename or rewrite it to use the canonical term

#### Scenario: Documentation review discovers a retired term
- **WHEN** a documentation review finds a retired term
- **THEN** the contributor SHALL replace it with the canonical term

## Canonical Terms

### Account taxonomy

| Term | Definition |
|------|------------|
| **ISC account** | Any account object from Identity Security Cloud. |
| **Managed source account** | An ISC account from one of the sources configured under **Source Settings → Sources**. The connector fetches these accounts and merges their attributes into Fusion accounts. |
| **Managed account key** | The composite identifier `sourceId::nativeIdentity` that uniquely identifies a managed source account within ISC. |
| **Fusion account** | The consolidated ISC account produced by the **Map** and **Define** steps. |
| **Fusion identity** | A Fusion account that has been correlated to an ISC identity and is treated as that identity's authoritative account. |
| **Identity-origin Fusion account** | A Fusion account seeded from an existing ISC identity during aggregation (for example when **Include identities in the scope?** is enabled), rather than from a managed source account. |
| **Provisional Fusion account** | A Fusion account created from a managed source account before its match fate has been decided. |

### Operations, phases, and sweeps

| Term | Definition |
|------|------------|
| **Operation** | A connector entry point such as `std:account:list` (the **accountList operation**) or `custom:dryrun` (the **dryRun operation**). |
| **Phase** | A major stage of an operation pipeline (for example the identity documents phase, the Fusion accounts phase, the managed accounts phase, or the report phase). |
| **Sweep** | A traversal of a set of accounts with a single purpose within a phase. |
| **Aggregation** | The ISC source-refresh operation. Use **managed source aggregation** or **Fusion source aggregation** when the source matters. |

### Framework steps

| Term | Definition |
|------|------------|
| **Map** | Merging attributes from one or more managed source accounts into a single Fusion account schema. |
| **Define** | Computing new attributes (normal attributes) and generating persistent unique attributes (UUIDs, counters, disambiguated values) using Apache Velocity templates. |
| **Match** | The product step that determines whether a Fusion account corresponds to an existing identity, using scoring and optional automatic assignment or manual review. |

### Matching and scoring

| Term | Definition |
|------|------------|
| **Matching** | The business process of determining whether a new Fusion account is potentially part of an existing identity. |
| **Scoring** | The similarity-calculation method used by matching to compare attribute values. |
| **Combined match score** | The weighted mean of evaluated rule similarities used to decide whether a candidate is a potential match. |
| **Potential match** | A candidate whose combined match score meets or exceeds the configured threshold and whose mandatory rules pass. |
| **Automatic assignment** | The decision to link a matched Fusion account to a specific identity without manual review when the combined score meets the automatic assignment threshold. |

### Candidate types

| Term | Definition |
|------|------------|
| **Identity candidate** | A candidate for matching that is an existing ISC identity (or a Fusion identity already in the baseline). |
| **Deferred candidate** | A candidate for matching that is another new unmatched managed source account from the same source in the same operation, causing identity creation to be deferred until the next aggregation. |

### Source types

| Term | Definition |
|------|------------|
| **Authoritative accounts** | Managed source accounts that create new ISC identities when they do not match an existing identity. Fusion typically owns correlation decisions for these sources. |
| **Records** | Managed source accounts that run **Map** and **Define** and may register unique attributes, but do not create Fusion accounts for unmatched rows. |
| **Orphan accounts** | Managed source accounts whose unmatched rows are dropped; optionally, stale orphan accounts can be disabled. |

### Processing states and outcomes

| Term | Definition |
|------|------------|
| **Baseline** | An existing identity that is included in the identity scope and used as a comparison point during the **Match** step. |
| **Uncorrelated** | A Fusion account or managed source account that is not yet linked to a known identity. |
| **Non-matched / `nonMatched`** | A managed source account that completed the **Match** step without finding any acceptable identity candidate. The status entitlement value is `nonMatched`; the matching status string is `non-matched`. |
| **Orphan** | A Fusion account that no longer has any contributing managed source accounts. Depending on configuration, orphan accounts may be removed or disabled. |
| **Deferred** | A match result where the best candidate is a deferred candidate from the same source in the same operation. The connector defers creating a new identity until a later aggregation can compare against the established baseline. |

## Retired Terms

The following terms are retired and SHALL NOT be used in new code, configuration, or documentation:

| Retired Term | Canonical Replacement |
|--------------|----------------------|
| `consolidated account` | Fusion account |
| `raw account` | managed source account |
| `identity-based Fusion account` | identity-origin Fusion account |
| `pass` (as a traversal name) | sweep |
| `round` | sweep |
| `new-unmatched` / `NewUnmatched` | deferred / `Deferred` |
| `analyzeIdentityPhase` | `scoreIdentityCandidates` |
| `analyzeDeferredPhase` | `scoreDeferredCandidates` |
| `hasNewUnmatchedPeerMatches` | `hasDeferredMatches` |
| `ManagedAccountPassRunner` | `ManagedAccountMatchingRunner` |
| `processing run` | the specific operation name |
