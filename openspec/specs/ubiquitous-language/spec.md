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

Source code SHALL use the canonical terms from this spec for variable names, function names, type names, class names, file names, and comments. The retired term **AttributeService** SHALL be replaced with **MappingService** or **DefinitionService** as appropriate. The retired term **ScoringService** SHALL be replaced with **MatchingService**.

#### Scenario: Variable naming follows ubiquitous language (updated)

- **WHEN** a developer declares a variable representing the map service
- **THEN** the variable SHALL be named `mappingService`, not `attributeService`
- **WHEN** a developer declares a variable representing the match service
- **THEN** the variable SHALL be named `matchingService`, not `scoringService`
- **WHEN** a developer declares a variable representing a domain concept
- **THEN** the variable name SHALL match the canonical term (e.g., `fusionAccount`, not `consolidatedAccount`; `managedSourceAccount`, not `rawAccount`)

#### Scenario: Function naming follows ubiquitous language (updated)

- **WHEN** a developer creates a function that calls the map service
- **THEN** the function SHALL reference `mappingService.mapAttributes`, not `attributeService.mapAttributes`
- **WHEN** a developer creates a function that operates on domain concepts
- **THEN** the function name SHALL use canonical terms (e.g., `scoreIdentityCandidates`, not `analyzeIdentityPhase`; `hasDeferredCandidateMatches`, not `hasNewUnmatchedPeerMatches`)

#### Scenario: Type naming follows ubiquitous language (updated)

- **WHEN** a developer defines a type, enum, or class for match outcomes
- **THEN** the type SHALL reference `MatchingService`, not `ScoringService`
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

#### Scenario: Naming an execution of a connector entry point

- **WHEN** referring to a single execution or instance of a connector operation
- **THEN** the term "operation run" or "run" SHALL be used (e.g., "an accountList operation run", "during the run"), not "processing run" or "aggregation run"

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

### Requirement: Match outcome dispatch is owned by MatchingService

The **Match outcome dispatch** (routing a scored managed source account to exact match, partial match, deferred match, or non-match and applying the resulting action) SHALL be implemented inside `src/services/matchingService/`. `FusionService` SHALL orchestrate the operation run but SHALL NOT implement Match resolution logic.

#### Scenario: Code references Match outcome dispatch

- **WHEN** code routes a scored managed source account to one of the four Match outcomes
- **THEN** it SHALL reside in `MatchOutcomeDispatcher` within `src/services/matchingService/`
- **AND** it SHALL use the canonical term "Match outcome dispatch" in identifiers and comments

#### Scenario: Distinguishing orchestration from Match logic

- **WHEN** a module coordinates an operation run
- **THEN** it SHALL be considered operation-run orchestration and live in `FusionService`
- **AND** the Match step's scoring and outcome dispatch SHALL remain in `MatchingService`

### Requirement: Candidate types are identity or deferred

Candidate types SHALL be **identity** or **deferred**. The retired term `new-unmatched` and its wire value `new-unmatched` SHALL NOT be used.

#### Scenario: Internal type naming

- **WHEN** defining a candidate type enum or constant
- **THEN** the value SHALL be `Deferred`, not `NewUnmatched`

#### Scenario: Dry-run wire output

- **WHEN** emitting candidate type in dry-run output
- **THEN** the wire value SHALL be `deferred` and SHALL NOT be translated from another internal value

### Requirement: Services are stateless; FusionRun is the single source of truth

All services SHALL be stateless strategy objects that receive FusionRun for accessing and modifying mutable state. The FusionRun object SHALL be the single source of truth for all mutable data during an operation run. No service SHALL hold mutable run-scoped state internally.

#### Scenario: Services read from FusionRun

- **WHEN** a service needs access to managed accounts, identities, Fusion accounts, or matching state
- **THEN** it SHALL read from the FusionRun instance
- **AND** it SHALL NOT read from internally-owned maps or sets

#### Scenario: Services write to FusionRun

- **WHEN** a service modifies run-scoped data
- **THEN** it SHALL write to the FusionRun instance
- **AND** it SHALL NOT accumulate state internally

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

Retired terms and symbols SHALL NOT be reintroduced into code, configuration, or documentation. The retired term list SHALL include `AttributeService` and `ScoringService` in addition to the previously retired terms. Retired terms include, but are not limited to: `consolidated account`, `raw account`, `identity-based Fusion account`, `pass`, `round`, `new-unmatched`, `NewUnmatched`, `analyzeIdentityPhase`, `analyzeDeferredPhase`, `hasNewUnmatchedPeerMatches`, `ManagedAccountPassRunner`, `AttributeService`, and `ScoringService`.

#### Scenario: Code review discovers AttributeService reference

- **WHEN** a code review finds `AttributeService` in identifiers or imports
- **THEN** the contributor SHALL rename to `MappingService` or `DefinitionService` based on the phase being referenced

#### Scenario: Code review discovers ScoringService reference

- **WHEN** a code review finds `ScoringService` in identifiers or imports
- **THEN** the contributor SHALL rename to `MatchingService`

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
| **Operation** | A connector entry point such as `std:account:list` (the **accountList operation**) or `custom:dryrun` (the **dryRun operation**). The operation is the command definition. |
| **Operation run** | A single execution or instance of an operation. A run is the execution of an operation. |
| **Phase** | A major stage of an operation pipeline (for example the identity documents phase, the Fusion accounts phase, the managed accounts phase, or the report phase). |
| **Sweep** | A traversal of a set of accounts with a single purpose within a phase. |
| **Correlated account sweep** | A sweep that processes already-correlated managed source accounts before the main matching sweeps begin, so their outcomes are visible as candidates for uncorrelated accounts. |
| **Aggregation** | The ISC source-refresh operation. Use **managed source aggregation** or **Fusion source aggregation** when the source matters. |

### Framework steps

| Term | Definition |
|------|------------|
| **Map** | Merging attributes from one or more managed source accounts into a single Fusion account schema. |
| **Define** | Computing new attributes (normal attributes) and generating persistent unique attributes (UUIDs, counters, disambiguated values) using Apache Velocity templates. |
| **Match** | The product step that determines whether a Fusion account corresponds to an existing identity, using scoring and optional automatic assignment or manual review. |

### Services

| Term | Definition |
|------|------------|
| **MappingService** | The stateless service responsible for the **Map** step — merging attributes from managed source accounts into the Fusion account schema using configurable merge strategies. Located at `src/services/mappingService/`. |
| **DefinitionService** | The stateless service responsible for the **Define** step — computing normal attributes via Velocity templates and generating persistent unique attributes (UUIDs, counters, disambiguated values). Located at `src/services/definitionService/`. |
| **MatchingService** | The stateless service responsible for the **Match** step — comparing Fusion accounts against existing identities using weighted scoring rules and routing each scored account to its **Match outcome dispatch** (exact match, partial match, deferred match, non-match). Located at `src/services/matchingService/`. |
| **FusionRun** | The centralized state container for a single operation run. Holds all mutable data loaded during the run (managed accounts, identities, Fusion accounts, form decisions, matching state) and serves as the single source of truth that stateless services read from and write to. Exposes `snapshot()` and `restore()` for recording and replay. Located at `src/model/fusionRun.ts`. |

### Matching and scoring

| Term | Definition |
|------|------------|
| **Matching** | The business process of determining whether a new Fusion account is potentially part of an existing identity. |
| **Scoring** | The similarity-calculation method used by matching to compare attribute values. |
| **Combined match score** | The weighted mean of evaluated rule similarities used to decide whether a candidate is a potential match. |
| **Potential match** | A candidate whose combined match score meets or exceeds the configured threshold and whose mandatory rules pass. |
| **Automatic assignment** | The decision to link a matched Fusion account to a specific identity without manual review when the combined score meets the automatic assignment threshold. |
| **Match outcome dispatch** | The routing of a scored managed source account to one of four outcomes — exact match, partial match, deferred match, or non-match — and the application of the resulting action (automatic assignment, review-form creation, deferred claim, or non-match registration). Implemented by `MatchOutcomeDispatcher` inside `src/services/matchingService/`. |

### Candidate types

| Term | Definition |
|------|------------|
| **Identity candidate** | A candidate for matching that is an existing ISC identity (or a Fusion identity already in the baseline). |
| **Deferred candidate** | A candidate for matching that is another provisional Fusion account from the same source in the same operation run, causing identity creation to be deferred until the next aggregation. |

### Source types

| Term | Definition |
|------|------------|
| **Authoritative accounts** | Managed source accounts that create new ISC identities when they do not match an existing identity. Fusion typically owns correlation decisions for these sources. |
| **Records** | Managed source accounts that run **Map** and **Define** and may register unique attributes, but do not create Fusion accounts for non-matched rows. |
| **Orphan accounts** | Managed source accounts whose non-matched rows are dropped; optionally, stale orphan accounts can be disabled. |

### Processing states and outcomes

| Term | Definition |
|------|------------|
| **Baseline** | An existing identity that is included in the identity scope and used as a comparison point during the **Match** step. |
| **Uncorrelated** | A Fusion account or managed source account that is not yet linked to a known identity. |
| **Non-matched / `nonMatched`** | A managed source account that completed the **Match** step without finding any acceptable identity candidate. The status entitlement value is `nonMatched`; the matching status string is `non-matched`. |
| **Orphan** | A Fusion account that no longer has any contributing managed source accounts. Depending on configuration, orphan accounts may be removed or disabled. |
| **Deferred** | A match result where the best candidate is a deferred candidate from the same source in the same operation run. The connector defers creating a new identity until a later aggregation can compare against the established baseline. |

### Entitlement system

Fusion accounts carry two kinds of entitlements in their schema, distinguished by how they are assigned and what they represent:

| Entitlement type | Schema flag | Assignment | Purpose |
|---|---|---|---|
| **Action** | `managed: true` | Assigned by ISC (via roles, access profiles, or direct assignment) | Trigger connector processing when assigned or removed |
| **Status** | `managed: false` | Calculated by the connector — never assigned externally | Describe the account's current processing state |

**Action entitlements** drive behavior. Assigning a `report` action to a Fusion account triggers report generation. Removing a `reviewer:<sourceId>` action revokes a reviewer's scope.

**Status entitlements** are read-only signals. They let users search, filter, and understand where each account is in the Fusion lifecycle without external assignment being possible.

#### Action entitlements

| Term | Wire value | Definition |
|---|---|---|
| **FusionReport** | `report` | Assign to trigger generation of a Fusion report for this account. |
| **Fusion** | `fusion` | Assign to mark this as a Fusion account. |
| **Correlated** | `correlated` | Set by the connector when all managed source accounts for this Fusion account have been correlated. Triggers correlation of missing source accounts when assigned externally. |
| **Reviewer** | `reviewer:<sourceId>` | Assign to designate an identity as a reviewer for a specific managed source. The suffix identifies the source. The `reviewer` status entitlement is also set on the reviewer's Fusion account to mark their role. |

#### Status entitlements

| Term | Wire value | Definition |
|---|---|---|
| **Uncorrelated** | `uncorrelated` | The Fusion account has managed source accounts that are not yet linked to a known identity. |
| **Baseline** | `baseline` | The identity existed before this Fusion source aggregation and is included as a comparison point during Match. |
| **Non-matched** | `nonMatched` | A managed source account completed the Match step without finding any acceptable identity candidate. |
| **Orphan** | `orphan` | A Fusion account that no longer has any contributing managed source accounts. |
| **Authorized** | `authorized` | A managed source account was manually correlated to an identity by a reviewer. |
| **Auto** | `auto` | A managed source account was automatically assigned to an identity after an exact attribute match (all rules scored 100). |
| **Manual** | `manual` | A new Fusion account was manually approved by a reviewer. |
| **Reviewer** | `reviewer` | The identity is a Match reviewer for one or more managed sources. Set alongside the `reviewer:<sourceId>` action entitlement. |
| **Requested** | `requested` | The account was requested (created via provisioning). |
| **ActiveReviews** | `activeReviews` | The account has one or more pending Fusion review forms awaiting reviewer decision. |
| **Candidate** | `candidate` | The identity is part of a pending Fusion review as a potential match candidate. |

### Review and decision domain

| Term | Definition |
|---|---|
| **Reviewer** | A person who reviews identity candidates presented in a Fusion review form and decides whether a Fusion account should link to an existing identity or create a new one. A reviewer's Fusion identity carries the `reviewer` status entitlement and one or more `reviewer:<sourceId>` action entitlements. |
| **Review form** | An ISC form instance presented to reviewers showing identity candidates and their attribute values, with options to link to an existing identity or create a new one. |
| **FusionDecision** | A reviewer's decision on a review form. Contains the chosen outcome (link to existing identity or create new identity), the submitter, comments, and whether the decision is finished. |
| **Manual review workflow** | The process flow: potential matches are identified → review forms are created with top candidates → reviewers evaluate and decide → decisions are applied by the connector on the next account aggregation. |
| **Global reviewer** | A reviewer automatically added to all review forms regardless of source. Controlled by **Owners are global reviewers?** in Review Settings. When enabled, Fusion source owners and members of the source governance group are added as reviewers on every form. |
| **Form attributes** | The Fusion account attributes displayed on the review form to help reviewers compare candidates. Configured in **Review Settings → List of Fusion account attributes to include in form**. |
| **Form expiration** | The number of days a reviewer has to respond before a review form expires. Configured in **Review Settings → Manual review expiration days**. |

### Matching nuances

| Term | Definition |
|---|---|
| **Matching rule** | A per-attribute comparison configuration within the Match step. Each rule specifies the attribute to compare, the similarity algorithm, a minimum similarity threshold, and a relative weight toward the combined match score. |
| **Mandatory match** | A matching rule that must pass (meet its threshold) for a candidate to be considered a potential match. If a mandatory rule fails, the candidate is rejected regardless of the combined match score. |
| **Skip match if missing** | When enabled on a matching rule, the rule is excluded from the combined score if the attribute is absent from either side of the comparison. |
| **Skip match if threshold not met** | When enabled on a matching rule, the rule contributes a zero-weighted score but does not disqualify the candidate if its individual threshold is not met. |
| **Manual review match score** | The minimum combined match score (0–100) required for a candidate to enter manual review. Candidates scoring below this threshold but above any lower cutoff are non-matched. |
| **Automatic assignment match score** | The minimum combined match score (0–100) above which a candidate is automatically linked to an identity without manual review. Requires **Enable automatic assignment** to be on. |
| **Maximum candidates per review form** | The maximum number of identity candidates displayed on a single review form. Configured in Review Settings. |

### Matching algorithms

| Term | Definition |
|---|---|
| **Enhanced Name Matcher** | A name-specialized algorithm that tokenizes name components (first, middle, last, titles, suffixes), handles cultural naming patterns and nicknames, and compares using bigrams. The recommended algorithm for name attributes. |
| **Jaro-Winkler** | A string-similarity algorithm based on Jaro distance with a prefix-weighting bonus. Favors strings that share a common prefix. |
| **LIG3** | A phonetic and string-similarity hybrid algorithm. |
| **Dice** | The Sorensen-Dice coefficient — measures similarity as twice the intersection of bigrams divided by the sum of bigram counts. |
| **Double Metaphone** | A phonetic algorithm that produces two pronunciation codes per string (primary and alternate), useful for comparing names that sound similar but are spelled differently. |
| **Binary** | Exact-match comparison. Returns 100 when attribute values are identical, 0 otherwise. |
| **Custom Algorithm** | A user-defined Apache Velocity expression that computes a similarity score from the two attribute values. |

### Velocity and Define context

| Term | Definition |
|---|---|
| **Normal attribute definition** | A Define-step rule that computes a Fusion account attribute value using an Apache Velocity template. Runs during every aggregation; may be configured as **Static** (never recalculated) or **Refresh on each aggregation** (always recalculated). |
| **Unique attribute definition** | A Define-step rule that generates a value guaranteed to be unique across all Fusion accounts. Uses collision-based disambiguation or an incremental counter. Runs after normal definitions. |
| **Static attribute** | A normal attribute evaluated only once — when the attribute has no value. Existing values are never recalculated. Overrides **Refresh on each aggregation**. |
| **$account** | The origin account snapshot available in Velocity templates — the managed source account that triggered creation, or the identity-origin row when the origin is the Identities source. |
| **$accounts** | An ordered list of all managed source account snapshots contributing to the Fusion account. Ordered by configured sources, then insertion order. |
| **$sources** | A Map keyed by source name containing per-source account snapshots. Accessible via dot notation (`$sources.Workday`). |
| **$identity** | The correlated ISC identity object, available when the Fusion account is linked to an identity. |
| **$previous** | The Fusion account's attributes from the previous aggregation. Used for change detection. |
| **$counter** | In unique attribute definitions: renders empty on the first attempt and a zero-padded digit suffix on subsequent collision-retry attempts. Controlled by **Minimum counter digits** and **Maximum attempts**. |
| **$UUID** | Generates a fresh random v4 UUID. Referencing it in the expression triggers a new UUID per attempt. |
| **$isUnique(value)** | Returns `true` when the given value (after applying the definition's case, trim, spaces, normalize, and maxLength transformations) is not already registered as in use. Allows branching between candidate formats before falling back to `$counter`. |
| **$originSource** | Resolves to the name of the source that originally created this Fusion account. |
| **Incremental counter** | A persistent, always-incrementing counter that survives across aggregations. Controlled by **Use incremental counter?** and **Counter start value**. When off, collision-based disambiguation is used instead. |
| **Collision-based disambiguation** | The default unique-value strategy: the expression is re-evaluated with an incrementing `$counter` suffix until a value is found that is not already in use, up to **Maximum attempts**. |

### Configuration vocabulary

Configuration is organized into menus and sections in the connector source in ISC.

| Term | Definition |
|---|---|
| **Connection Settings** | The top-level configuration menu for authentication and connectivity to ISC APIs. Contains the ISC API URL and PAT credentials. |
| **Source Settings** | The top-level configuration menu controlling which identities and sources are in scope and how processing is managed. Contains Scope, Sources, and Processing Control sections. |
| **Scope** | The section defining which ISC identities participate in Fusion processing. Controls **Include identities in the scope?** and **Identity Scope Query**. |
| **Identity Scope Query** | An ISC search-syntax filter that narrows which identities are included in processing. Use `*` for all identities or filters like `attributes.cloudLifecycleState:active`. |
| **Sources** | The section listing configured managed sources that feed account data into Fusion. Each source has its own type, aggregation mode, correlation mode, and filters. |
| **Processing Control** | The section managing account maintenance: history retention, empty account deletion, and missing-identifier behavior. |
| **Attribute Mapping Settings** | The top-level configuration menu for the Map step. Contains Attribute Mapping Definitions. |
| **Attribute Mapping Definitions** | The section configuring how source attributes are mapped and merged into the Fusion account schema. Controls the default merge strategy and per-attribute mapping rules. |
| **Attribute Definition Settings** | The top-level configuration menu for the Define step. Contains Normal Attribute Definitions and Unique Attribute Definitions. |
| **Normal Attribute Definitions** | The section defining Velocity expressions that compute Fusion account attributes. Runs on every aggregation; supports static (one-time) or refreshable evaluation. |
| **Unique Attribute Definitions** | The section defining Velocity expressions that generate values guaranteed unique across all Fusion accounts. Uses collision-based disambiguation or incremental counters. |
| **Attribute Matching Settings** | The top-level configuration menu for the Match step. Contains Matching Settings and Review Settings. |
| **Matching Settings** | The section configuring per-attribute matching rules (algorithm, threshold, weight, mandatory, skip flags), the manual review score threshold, and automatic assignment. |
| **Review Settings** | The section configuring the manual review workflow: form attributes, form expiration, maximum candidates per form, and global reviewer behavior. |
| **Advanced Settings** | The top-level configuration menu for developer and integration settings. Contains Developer Settings, Advanced Connection Settings, and Proxy Settings. |
| **Developer Settings** | The section for operation tuning: provisioning timeout, batch size, processing wait, priority processing, concurrency checks, forced refresh, and account reset. |
| **Advanced Connection Settings** | The section for API communication tuning: request rate limiting, retry behavior, and external logging configuration. |
| **Proxy Settings** | The section configuring proxy mode for running connector logic on an external server. |

### Source and aggregation modes

| Term | Definition |
|---|---|
| **Aggregation mode** | Per-source setting controlling when managed source accounts are refreshed. Options: **Do not aggregate** (use existing account data), **Aggregate before processing** (refresh accounts first), or **Delayed aggregation** (refresh after processing completes). |
| **Aggregate before processing** | Aggregation mode where the managed source is refreshed before the connector processes its accounts. The connector polls the aggregation task status every 30 seconds until completion or the configured timeout. |
| **Delayed aggregation** | Aggregation mode where the managed source is refreshed after the connector finishes processing. A workflow waits the configured delay, then triggers the source aggregation. |
| **Optimized aggregation** | When enabled, only accounts that have changed since the last run are processed. Improves performance for large sources. Must be disabled when using reverse correlation. |
| **Aggregation batch size** | The maximum number of accounts processed per aggregation run for a source. Limits load when onboarding large datasets. |
| **Aggregation wait timeout** | The maximum time (in minutes) to wait for a managed source aggregation to complete when using **Aggregate before processing**. |
| **Aggregation delay** | The number of minutes to wait after processing before triggering a delayed aggregation. |
| **Correlation mode** | Per-source setting controlling how uncorrelated managed source accounts are linked to identities. Options: **Do not correlate** (leave unlinked), **Correlate missing accounts on aggregation** (link via API during processing), or **Reverse correlation from managed source** (push Fusion identity data back to the source for ISC correlation). |
| **Correlate missing accounts on aggregation** | Correlation mode where the connector directly links uncorrelated managed source accounts to their Fusion identity via the ISC API during processing. |
| **Reverse correlation** | Correlation mode where the connector creates a dedicated attribute on the managed source containing the Fusion identity ID, then ISC's correlation rule matches accounts to identities. Requires a correlation attribute name and display name. |
| **Correlation attribute** | The attribute name used for reverse correlation on the managed source schema. Must be unique and not overlap with mapped or defined attributes. |
| **Deferred candidate matching** | Per-source toggle that controls whether a managed source account is compared to other provisional Fusion accounts from the same source in the same run. When enabled, if the only strong match is a deferred candidate, identity creation is deferred. Disable when one person may appear as multiple accounts in a single aggregation. |
| **Include record accounts in Match** | Per-source toggle for Record-type sources. When enabled, record accounts participate in Match scoring against identities and deferred candidates. When disabled, they only run Map and Define and register unique attributes. |
| **Disable non-matching accounts** | Per-source toggle for Orphan-type sources. When enabled, orphan accounts that no longer match any identity are automatically disabled after aggregation. |
| **Account filter** | A server-side ISC filter expression applied to the Accounts API to reduce records returned. Uses ISC search syntax. |
| **JMESPath filter** | A client-side filter expression applied page-wise to account results. Uses JMESPath syntax to return a filtered array of account objects. |

### Deployment and integration

| Term | Definition |
|---|---|
| **Proxy mode** | A deployment option where connector logic runs on an external server and communicates with ISC via a lightweight proxy connector. Offloads processing from ISC infrastructure. |
| **External logging** | Sending connector log output to an external endpoint (e.g., Splunk, Datadog) for centralized monitoring. Controlled by the external logging URL and level settings. |
| **External logging level** | The minimum severity for logs sent to the external endpoint. Options: Error, Warn, Info, Debug. |
| **Concurrency check** | A safeguard that prevents overlapping connector aggregations from running simultaneously. Controlled by **Enable concurrency check?** in Developer Settings. |
| **Priority processing** | When enabled, the connector expedites its processing queue. Controlled by **Enable priority processing?** in Developer Settings. |
| **Cascade aggregation** | When enabled, single-account operations (e.g., accountRead) trigger aggregation of managed sources before fetching account data. Ensures up-to-date source data. |
| **Provisioning timeout** | The maximum time (in seconds) to wait for a provisioning operation (create, update, enable, disable) to complete. |
| **Localized user communications** | When enabled, review forms and emails use the reviewer's preferred language. Requires an identity attribute specifying the language code. |
| **Governance group** | An ISC group assigned to source governance. Members of this group are eligible as global reviewers when **Owners are global reviewers?** is enabled. |
| **Identity profile** | The ISC identity profile used for identities created by the Fusion source. Replaces the identity profiles of managed sources when Fusion is authoritative. |

### Testing

| Term | Definition |
|---|---|
| **Scenario** | A self-contained test case with input data, configuration, and expected outputs. Each scenario has a unique ID and manifest file. |
| **Golden artifact** | A pre-validated expected output file (e.g., `output.sweep1.expected.json`) used as the reference for automated test comparison. Generated artifacts are compared against golden artifacts to detect regressions. |
| **Sweep** (testing) | A single aggregation run within a test scenario. Multi-sweep scenarios (sweep 1, sweep 2) validate stateful behavior across sequential aggregations. |
| **Side effects** | Non-account changes produced during an aggregation run (e.g., form creation, correlation API calls). Captured in side-effect files for test validation. |

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
| `hasNewUnmatchedPeerMatches` | `hasDeferredCandidateMatches` |
| `ManagedAccountPassRunner` | `ManagedAccountMatchingRunner` |
| `processing run` | operation run, or the specific operation name when referring to the command definition |
| `AttributeService` | `MappingService` (for attribute mapping/merging) + `DefinitionService` (for attribute computation and unique value generation) |
| `ScoringService` | `MatchingService` (scoring remains as the computation technique within matching) |
| `attribute-service` (spec) | `mapping-service` + `definition-service` |
| `scoring-service` (spec) | `matching-service` |
