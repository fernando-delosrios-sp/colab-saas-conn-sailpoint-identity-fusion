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

Source code SHALL use the canonical terms from this spec for variable names, function names, type names, class names, file names, and comments. The retired term **AttributeService** SHALL be replaced with **MappingService** or **DefinitionService** as appropriate. The retired term **ScoringService** SHALL be replaced with **MatchingService**. The ambiguous term **identity name** (when used for the human-friendly identity label) SHALL be replaced with **identity display name** and the `FusionAccount.identityDisplayName` accessor.

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
- **THEN** the type SHALL reference `MatchingService` for scoring concerns, not `ScoringService`
- **WHEN** a developer defines a type, enum, or class for match sweep orchestration or outcome dispatch
- **THEN** the type name SHALL use `MatchOutcomeDispatcher`, not `ManagedAccountMatchingRunner` or `ManagedAccountPassRunner`

### Requirement: Match sweep orchestration term is MatchOutcomeDispatcher

The canonical implementation type for managed-account match sweep orchestration and outcome dispatch SHALL be `MatchOutcomeDispatcher`. Documentation and specs SHALL refer to **Match outcome dispatch** and the two-sweep lifecycle (identity scoring sweep → deferred drain) in terms of `MatchOutcomeDispatcher.runMatchSweep`, not `ManagedAccountMatchingRunner`.

#### Scenario: Specs reference MatchOutcomeDispatcher for sweeps

- **WHEN** a living spec describes who orchestrates the two-sweep match lifecycle
- **THEN** it SHALL name `MatchOutcomeDispatcher` as the orchestrator
- **AND** it SHALL NOT require `ManagedAccountMatchingRunner` as an active type

#### Scenario: Correlated account sweep is distinct from two-sweep lifecycle

- **WHEN** documentation describes the correlated account sweep
- **THEN** it SHALL treat that sweep as a FusionService pipeline pre-pass
- **AND** it SHALL NOT conflate the correlated account sweep with the identity-scoring or deferred-drain sweeps inside `MatchOutcomeDispatcher`

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

### Requirement: Identity reference terms are defined precisely

The connector SHALL distinguish between the identity alias, the identity display name, and the internal Fusion account name. The glossary definition of **Fusion account name** MUST refer to the `name` property of `FusionAccount` and MUST NOT refer to `state.name` or `FusionAccountState`.

#### Scenario: Identifying the identity alias

- **WHEN** code needs the value used for the Fusion display attribute override or for identity lookup
- **THEN** it SHALL use the **identity alias**, defined as the `name` field of the `IdentityDocument` as reported by the SailPoint SDK (accessed via `FusionAccount.identityAlias`)
  - **AND** it SHALL NOT use `displayName` or `attributes.displayName` for that purpose

#### Scenario: Identifying the identity display name

- **WHEN** code needs a human-friendly reference label for a correlated identity in reports, review forms, emails, or logs
- **THEN** it SHALL use the **identity display name**, computed as `IdentityDocument.attributes.displayName`, falling back to top-level `IdentityDocument.displayName`, then to `IdentityDocument.name` (accessed via `FusionAccount.identityDisplayName`)
  - **AND** it SHALL NOT use the identity alias alone when a display name is available

#### Scenario: Fusion account name definition omits deleted State

- **WHEN** the glossary defines **Fusion account name**
- **THEN** the definition SHALL describe `FusionAccount.name` (or the `name` property of a `FusionAccount`)
- **AND** the definition SHALL NOT mention `state.name` or `FusionAccountState`

### Requirement: Dry-run mode is referenced as a mode, not an operation

The term **dry-run mode** SHALL refer to the accountList operation running with `dryRun.enabled: true` on its input. The retired term `custom:dryrun` SHALL NOT be used to refer to this behavior.

#### Scenario: Describing non-persistent analysis
- **WHEN** describing a non-persistent aggregation analysis that shares the accountList pipeline
- **THEN** the term "dry-run mode" or "the accountList operation in dry-run mode" SHALL be used
- **AND** the term "dryRun operation" or "custom:dryrun" SHALL NOT be used

#### Scenario: Naming the operation in configuration or documentation
- **WHEN** the connector handles an accountList invocation with `{ dryRun: { enabled: true } }`
- **THEN** the system SHALL identify this as an execution in "dry-run mode" in logs, metrics, and report data

### Requirement: The report step is the Epilogue, not a phase
The term **Epilogue** SHALL denote the terminal block of the account-list operation that emits reports and summaries after the pipeline phases complete, regardless of whether the pipeline succeeded or failed. The report step SHALL NOT be called a phase. Code, log labels, and documentation SHALL use "Epilogue" (for example `Epilogue: report generation`) instead of "PHASE 6" or "PHASE 7". The `Report` short label in phase-timing rows SHALL be preserved unchanged.

#### Scenario: Log labels use Epilogue terminology
- **WHEN** the account-list operation logs the report step
- **THEN** the label SHALL read "Epilogue: …" and SHALL NOT use a phase number

#### Scenario: Code naming follows the Epilogue term
- **WHEN** code refers to the terminal report block of the account-list pipeline
- **THEN** identifiers SHALL use canonical terms (for example `reportEpilogue`, `ReportEpilogueOptions`), consistent with the **Epilogue** glossary entry

#### Scenario: Glossary defines Epilogue alongside Phase
- **WHEN** the "Operations, phases, and sweeps" glossary table is consulted
- **THEN** it SHALL contain an **Epilogue** entry defined as the always-runs terminal report block
- **AND** the **Phase** entry SHALL NOT list the report step as an example phase

### Requirement: Glossary defines operation heartbeat terms

The ubiquitous-language glossary SHALL define **Operation heartbeat**, **STATUS line**, and **EVENT_SUMMARY line** as canonical terms for periodic operation visibility logging.

#### Scenario: Glossary entry for Operation heartbeat

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Operation heartbeat** entry describing the periodic STATUS and EVENT_SUMMARY emission during long-running operations

#### Scenario: Glossary entry for STATUS line

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **STATUS line** entry describing the primary situational text line (phase, step, progress, queue, memory, elapsed)

#### Scenario: Glossary entry for EVENT_SUMMARY line

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **EVENT_SUMMARY line** entry describing aggregated account-level activity between heartbeat ticks

### Requirement: Glossary defines bulk ingest terms

The ubiquitous-language glossary SHALL define **Bulk ingest** and **Ingested (progress unit)** as canonical terms for CPU-bound cache registration after Fetch HTTP and for STATUS progress during that work.

#### Scenario: Glossary entry for Bulk ingest

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Bulk ingest** entry describing registration of already-fetched pages into run caches, distinct from HTTP Fetch and from identity hydration

#### Scenario: Glossary entry for Ingested progress unit

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain an **Ingested (progress unit)** entry describing the STATUS `progress=` unit `ingested`
- **AND** the entry SHALL state that operators MUST NOT reuse `fetched` for post-HTTP cache registration

### Requirement: Glossary defines Refreshed progress unit

The ubiquitous-language glossary SHALL define **Refreshed (progress unit)** as the canonical STATUS `progress=` unit while account-list Refresh walks Fusion accounts.

#### Scenario: Glossary entry for Refreshed progress unit

- **WHEN** a reader consults the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Refreshed (progress unit)** entry describing the STATUS `progress=` unit `refreshed`
- **AND** the entry SHALL state that Refresh STATUS MUST NOT reuse unit `processed` and MUST NOT emit a standalone `refreshed(N)` cumulative

### Requirement: Documentation and logs use refreshed for Refresh STATUS

New documentation and Refresh-phase STATUS progress SHALL use unit **refreshed**. They SHALL NOT describe Refresh pipeline throughput as unit `processed` or as a separate `refreshed(N)` token.

#### Scenario: Refresh STATUS examples use refreshed unit

- **WHEN** operator docs show a Refresh STATUS example
- **THEN** the progress segment SHALL use unit `refreshed`
- **AND** the example SHALL NOT include a standalone `refreshed(N)` segment

### Requirement: Glossary defines Main account merge and Origin account merge

The ubiquitous-language glossary SHALL define **Main account merge**, **Origin account merge**, and **origin snapshot** as Map-step terms. Documentation and configuration labels SHALL use these names, not “Origin source” as a merge radio.

#### Scenario: Main account merge entry
- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up the Map strategy that follows `mainAccount`
- **THEN** a **Main account merge** entry SHALL define it as the strategy that reads mapped values from the `mainAccount` snapshot when that key is found this run, otherwise from the origin snapshot, with stored config value `mainAccount`
- **AND** it SHALL NOT describe the strategy as First found with a preferred source

#### Scenario: Origin account merge entry
- **GIVEN** a reader consults the glossary
- **WHEN** they look up the Map strategy that follows creation provenance
- **THEN** an **Origin account merge** entry SHALL define it as the strategy that reads mapped values from the origin snapshot only, ignoring `mainAccount`, with stored config value `originAccount`

#### Scenario: Origin snapshot entry
- **GIVEN** a reader consults the glossary
- **WHEN** they look up the object those strategies read
- **THEN** an **origin snapshot** entry SHALL define it as the snapshot whose key equals `originAccount` in the snapshot-key index, including the Identities snapshot when that key is the identity id
- **AND** it SHALL state that this is the same object Velocity exposes as `$account`

### Requirement: Glossary defines unmapped snapshot key and Identities snapshot

The ubiquitous-language glossary SHALL define **unmapped snapshot key** and **Identities snapshot** as Map-step terms. Documentation SHALL NOT describe unmapped Fusion schema names as mapping targets.

#### Scenario: Unmapped snapshot key entry

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up names Map merges without an attribute mapping row
- **THEN** an **unmapped snapshot key** entry SHALL define it as an attribute name that appears on at least one live snapshot in the current `mapAttributes` invocation and is not an `attributeMaps[].newAttribute` mapping target
- **AND** it SHALL NOT define the term as every Fusion schema attribute

#### Scenario: Identities snapshot entry

- **GIVEN** a reader consults the glossary
- **WHEN** they look up how the identity bag participates in Map
- **THEN** an **Identities snapshot** entry SHALL define it as the identity bag registered in the source attribute map and snapshot-key index under the identity id, treated as another contributing account
- **AND** it SHALL NOT describe identity-origin as a separate merge algebra

### Requirement: Glossary distinguishes Origin account merge from the $originSource Source-name token

The ubiquitous-language spec SHALL state that **Origin account merge** pins one origin snapshot, while the **$originSource** token in the Source name field resolves to the prioritized/`mainAccount` **source name** and then takes the first account on that source. Velocity `$originSource` remains the origin source **name** string in Define templates.

#### Scenario: Source-name token is not Origin account merge
- **GIVEN** documentation describes a per-attribute Source name of `$originSource`
- **WHEN** the prose refers to that setting
- **THEN** it SHALL call it the `$originSource` Source-name token
- **AND** it SHALL NOT call it Origin account merge

### Requirement: Recording scenario terminology SHALL be canonical

The term **scenario** (recording) SHALL refer to a named, tenant-scoped recording directory under `recordings/<tenant>/{scenarioName}/` containing captured operation steps (`steps.ndjson`), ISC API log (`api-log.ndjson`), compiled replay definition (`scenario.json`), and supporting artifacts. The terms **chain**, **chain reference**, and **chain name** SHALL NOT be used in new code, configuration help text, or documentation when referring to recording or replay artifacts.

#### Scenario: Documentation uses scenario for recording artifacts

- **WHEN** documentation describes capturing or replaying recorded operation sequences
- **THEN** the term "scenario" or "scenario reference" (`tenant/scenarioName`) MUST be used
- **AND** the term "chain" MUST NOT be used in the recording/replay domain

#### Scenario: Code review discovers chain terminology in recording domain

- **WHEN** a code review finds `chainName`, `chainRef`, or user-facing "chain" strings in recording/replay modules
- **THEN** the contributor MUST rename to `scenarioName`, `scenarioRef`, or "scenario" unless the identifier is a deprecated compatibility alias

### Requirement: Deployment mode terms SHALL be defined in ubiquitous language

The ubiquitous language spec MUST define **umbrella mode**, **side-car mode**, **sources scope**, and **identity scope** with definitions aligned to Configuring sources and scope guide content. The user-facing glossary MUST mirror these terms.

#### Scenario: Agent introduces umbrella mode in documentation

- **GIVEN** an author writes about authoritative Fusion Match deployments
- **WHEN** they use the term umbrella mode
- **THEN** the term MUST be defined in `openspec/specs/ubiquitous-language/spec.md`
- **AND** MUST appear in `docs/glossary.md`

#### Scenario: Reader distinguishes scope concepts

- **GIVEN** a reader opens the glossary
- **WHEN** they look up sources scope and identity scope
- **THEN** both terms MUST have distinct definitions
- **AND** definitions MUST clarify when identity scope is optional

### Requirement: Correlated entitlement and correlate action are defined as a pair

The ubiquitous language SHALL define **correlated entitlement** (outcome: all managed source accounts correlated with the Fusion identity) and **correlate action** (enforcement: direct PATCH of missing managed accounts when the platform assigns correlated entitlement to an account that lacks it) as linked terms. Documentation and specs SHALL use **correlated entitlement**, not informal synonyms such as "derived correlated". The correlated entitlement SHALL NOT be revocable via entitlement Remove on provisioning paths; Remove for `correlate` or `correlated` tokens SHALL fail the operation.

#### Scenario: Spec references correlated outcome

- **GIVEN** a specification describes when the `correlated` action entitlement appears on a Fusion account
- **WHEN** the spec is reviewed against this ubiquitous-language spec
- **THEN** it SHALL use the term **correlated entitlement**
- **AND** SHALL state that presence means all managed source accounts are correlated with the Fusion identity

#### Scenario: Spec references correlate enforcement on assignment

- **GIVEN** a specification describes platform assignment of the correlated entitlement on account create or update
- **WHEN** the spec is reviewed against this ubiquitous-language spec
- **THEN** it SHALL use the term **correlate action**
- **AND** SHALL describe direct PATCH of missing managed source accounts as the enforcement mechanism

#### Scenario: Correlated entitlement Remove is invalid on provisioning paths

- **GIVEN** documentation or specs describe account-update or account-create action handling
- **WHEN** a Remove change targets `correlate` or `correlated`
- **THEN** the spec SHALL state that the operation fails because correlated entitlement is derived, not revocable

### Requirement: Fusion account collaborator structural terms SHALL be defined

The ubiquitous-language glossary MUST define **Fusion account collaborators** as the three behavior-rich parts of a `FusionAccount`: **FusionCollections**, **FusionCorrelation**, and **FusionLayers**. These terms are architecture vocabulary for how the model is organized. They MUST NOT replace business terms such as statuses, actions, or correlation (ISC linking).

#### Scenario: Glossary defines FusionCollections

- **WHEN** a reader consults the ubiquitous-language glossary for Fusion account structure
- **THEN** **FusionCollections** MUST be defined as the collaborator that owns account-id sets, missing-accounts, statuses, actions, reviews, sources, fusion matches, history, and related collection sync-to-bag behavior

#### Scenario: Glossary defines FusionLayers

- **WHEN** a reader consults the ubiquitous-language glossary for Fusion account structure
- **THEN** **FusionLayers** MUST be defined as the collaborator that owns identity / managed-account / fusion-decision enrichment methods and layer-related flags (for example needsRefresh, disabled, origin metadata)

#### Scenario: Glossary defines FusionCorrelation collaborator

- **WHEN** a reader consults the ubiquitous-language glossary for Fusion account structure
- **THEN** **FusionCorrelation** MUST be defined as the collaborator that owns correlation promises and mark-correlated helpers on a single Fusion account
- **AND** the entry MUST state that this is distinct from business **correlation** (linking managed source accounts to an ISC identity)

### Requirement: Structural correlation MUST NOT be confused with business correlation

Documentation, specs, and agent-generated text MUST use **correlation** (unqualified) for the business process of linking managed source accounts to an ISC identity, and MUST use **FusionCorrelation** (or “Fusion account correlation collaborator”) when referring to the `FusionAccount.correlation` object.

#### Scenario: Spec describes ISC linking

- **WHEN** a requirement describes PATCHING or linking managed accounts to an identity
- **THEN** it SHALL use the business term **correlation** (or **correlate action** / **correlated entitlement** as appropriate)
- **AND** it SHALL NOT imply that `FusionCorrelation` is the ISC linking service

#### Scenario: Spec describes the collaborator

- **WHEN** a requirement describes mutating promises or mark-correlated helpers on a Fusion account instance
- **THEN** it SHALL name **FusionCorrelation** or `fusionAccount.correlation`
- **AND** it SHALL NOT use unqualified “correlation” alone if that would be ambiguous

### Requirement: Documentation and logs use Bulk ingest and ingested

New documentation, STATUS progress units, and DETAIL actions for this work SHALL use **Bulk ingest** and unit **ingested**. They SHALL NOT call this stretch hydration, flush, or promise dump.

#### Scenario: DETAIL ingest start uses ingesting action

- **WHEN** Fetch emits a DETAIL line at the start of identity or fusion-account bulk ingest
- **THEN** the action SHALL use `ingesting` with subject `identities` or `fusion-accounts`
- **AND** the line SHALL NOT describe the work as hydration

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

### Identity reference and Fusion account naming

The connector refers to an ISC identity and to the Fusion account itself through three distinct names. They are separated so the authoritative value used for the Fusion display attribute is not confused with the user-friendly report label.

| Term | Definition |
|------|------------|
| **Identity alias** | The authoritative login/account name of the correlated ISC identity, taken from the `name` field of the `IdentityDocument` as reported by the SailPoint SDK (accessed via `FusionAccount.identityAlias`). This is the only value used for the Fusion account display attribute override (`fusionDisplayAttribute`). |
| **Identity display name** | A human-friendly reference label for the correlated identity. Computed as `IdentityDocument.attributes.displayName`, falling back to top-level `IdentityDocument.displayName`, then to `IdentityDocument.name`, then to `FusionAccount.name`. Used in reports, review form candidates, emails, logs, and other user-facing references where a readable label is required (via `FusionAccount.identityDisplayName`). |
| **Fusion account name** | The `name` property of a `FusionAccount` (`FusionAccount.name`). It mirrors the ISC `Account.name` / `Identity.name` field of the persisted account and is used for internal logging, history entries, and conflict tracking. It is not the output display attribute unless the display attribute override is configured to consume it. |

### Fusion account collaborators

Architecture vocabulary for how a `FusionAccount` is organized. These terms MUST NOT replace business terms such as statuses, actions, or **correlation** (ISC linking).

| Term | Definition |
|------|------------|
| **Fusion account collaborators** | The three behavior-rich parts of a `FusionAccount`: **FusionCollections**, **FusionCorrelation**, and **FusionLayers**. Exposed as readonly `collections`, `correlation`, and `layers` on `FusionAccount`. |
| **FusionCollections** | The collaborator that owns account-id sets, missing-accounts, statuses, actions, reviews, sources, fusion matches, history, and related collection sync-to-bag behavior. |
| **FusionLayers** | The collaborator that owns identity / managed-account / fusion-decision enrichment methods and layer-related flags (for example needsRefresh, disabled, origin metadata). |
| **FusionCorrelation** | The collaborator that owns correlation promises and mark-correlated helpers on a single Fusion account. Distinct from business **correlation** (linking managed source accounts to an ISC identity). |

### Operations, phases, and sweeps

| Term | Definition |
|------|------------|
| **Operation** | A connector entry point such as `std:account:list` (the **accountList operation**). The operation is the command definition. The accountList operation supports an optional **dry-run mode** (`dryRun.enabled: true` on the input) for non-persistent analysis. |
| **Operation run** | A single execution or instance of an operation. A run is the execution of an operation. |
| **Phase** | A major stage of an operation pipeline (for example the identity documents phase, the Fusion accounts phase, or the managed accounts phase). The report step is not a phase; see **Epilogue**. |
| **Epilogue** | The always-runs terminal block of the account-list operation that emits reports and summaries after the pipeline phases complete, regardless of pipeline success. Ordered most-durable-first (report file, report email, summary send). |
| **Operation heartbeat** | A periodic logging interval (default 30s) during long-running operations that emits **STATUS line** and **EVENT_SUMMARY line** text to explain phase, step, progress, queue state, and aggregated account activity. |
| **STATUS line** | The primary situational text line emitted by the operation heartbeat: phase, step, progress, queue delta, memory, and elapsed time (grep prefix `STATUS`). |
| **EVENT_SUMMARY line** | A heartbeat text line aggregating account-level activity (review/merge matches, correlations, decisions) recorded since the previous tick. Not emitted when the only match activity is non-matched accounts already shown on STATUS (grep prefix `EVENT_SUMMARY`). |
| **Bulk ingest** | CPU-bound registration of already-fetched pages into operation-run caches during Fetch. Distinct from HTTP retrieval and from identity hydration, which performs follow-up API lookups for missing identities. |
| **Ingested (progress unit)** | The STATUS `progress=` unit `ingested`, used while bulk ingest registers fetched documents or accounts. Post-HTTP cache registration MUST NOT reuse the `fetched` unit. |
| **Refreshed (progress unit)** | The STATUS `progress=` unit `refreshed`, used while account-list Refresh walks Fusion accounts. Refresh pipeline throughput MUST NOT reuse unit `processed` or emit a standalone `refreshed(N)` cumulative. |
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
| **MatchingService** | The stateless service responsible for **scoring** in the Match step — weighted rule evaluation, trigram blocking, and normalization caches on FusionRun. Located at `src/services/matchingService/`. Outcome routing (merge, review form, defer, non-match) is **Match outcome dispatch** via `MatchOutcomeDispatcher`, not MatchingService. |
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
| **Record unique registration** | A bulk Process-phase step (`record-unique-registration`) that registers unique attribute values for Record-type managed accounts with **Include record accounts in Match** disabled. Applies selective attribute mapping (targets coincident with unique definition names) and `registerUniqueAttributes` only — skipping normal Define, Match scoring, and Fusion account creation. Runs after the correlated sweep and before the uncorrelated sweep. |
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
| **Correlated entitlement** | `correlated` | The action entitlement present on a Fusion account when all managed source accounts for that Fusion identity are correlated with the Fusion identity. Evaluated on every Fusion account build; absent when any managed source account remains in `missing-accounts`. |
| **Correlate action** | `correlate` / `correlated` (Add) | When the platform assigns the correlated entitlement to a Fusion account that lacks it, the connector runs the correlate action: direct identity correlation (ISC PATCH) for missing managed source accounts on provisioning paths until the correlated entitlement outcome is achieved or missing accounts remain. |
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
| **Normal attribute definition** | A Define-step rule that computes a Fusion account attribute value using an Apache Velocity template. Recalculation follows **Static** and **Refresh on each aggregation**: Refresh-on definitions evaluate every aggregation; Refresh-off definitions evaluate when underlying source data changes (`needsRefresh`), on reset, or when force attribute refresh is enabled. |
| **Unique attribute definition** | A Define-step rule that generates a value guaranteed to be unique across all Fusion accounts. Uses collision-based disambiguation or an incremental counter. Runs after normal definitions. |
| **Static attribute** | A normal attribute evaluated only once — when the attribute has no value. Existing values are never recalculated. Overrides **Refresh on each aggregation**. |
| **Refresh on each aggregation** | Per-definition toggle (`definition.refresh`) for Normal attribute definitions. When on, the definition evaluates every aggregation even if source data is unchanged. When off, evaluation is skipped for existing values unless the Fusion account `needsRefresh`, `needsReset`, or force attribute refresh is enabled. |
| **$account** | The origin account snapshot available in Velocity templates — the managed source account that triggered creation, or the identity-origin row when the origin is the Identities source. |
| **$accounts** | An ordered list of all managed source account snapshots contributing to the Fusion account. Ordered by configured sources, then insertion order. |
| **$sources** | A Map keyed by source name containing per-source account snapshots. Accessible via dot notation (`$sources.Workday`). |
| **$identity** | The correlated ISC identity object, available when the Fusion account is linked to an identity. |
| **$previous** | The Fusion account's attributes from the previous aggregation. Used for change detection. |
| **$counter** | In unique attribute definitions: renders empty on the first attempt and a zero-padded digit suffix on subsequent collision-retry attempts. Controlled by **Minimum counter digits** and **Maximum attempts**. |
| **$UUID** | Generates a fresh random v4 UUID. Referencing it in the expression triggers a new UUID per attempt. |
| **$isUnique(value)** | Returns `true` when the given value (after applying the definition's case, trim, spaces, normalize, and maxLength transformations) is not already registered as in use. Allows branching between candidate formats before falling back to `$counter`. |
| **$originSource** | In Define templates, resolves to the name of the source that originally created this Fusion account. Distinct from the **$originSource Source-name token** in Map Source name fields. |
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
| **Main account merge** | A Map strategy that reads mapped values from the `mainAccount` snapshot when that key is found in the current run, otherwise from the origin snapshot. Stored as `mainAccount`. It does not fall through to another account when the selected snapshot lacks a value. |
| **Origin account merge** | A Map strategy that reads mapped values only from the origin snapshot and ignores `mainAccount`. Stored as `originAccount`. It does not fall through to another account. |
| **Origin snapshot** | The managed account whose key equals `originAccount`, or the Identities identity bag for an identity-origin Fusion account. The same object Velocity exposes as `$account`. |
| **$originSource Source-name token** | A per-attribute Source name value that resolves to the prioritized (`mainAccount`) source name, then selects the first account on that source. It is source-level and is not **Origin account merge**. In Velocity, `$originSource` remains the origin source name string. |
| **Attribute Definition Settings** | The top-level configuration menu for the Define step. Contains Normal Attribute Definitions and Unique Attribute Definitions. |
| **Normal Attribute Definitions** | The section defining Velocity expressions that compute Fusion account attributes. Each definition honors **Static** and **Refresh on each aggregation**; Refresh-off definitions do not re-evaluate unchanged accounts that already have a value. |
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
| **Reverse-correlation attribute** | A Fusion account attribute value written for a reverse-correlation source, keyed by the source's `correlationAttribute`, linking the Fusion identity to managed source accounts. Managed on every Fusion account build so rebuild/remap steps do not permanently clobber established values. |
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
| **Cascade aggregation** | When `cascadeAggregationEnabled` is true, single-account operations (e.g., accountRead) trigger managed-source aggregation for sources referenced by the Fusion account before fetching managed account data. Per-source cascade failures are logged and the operation continues with available data. |
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
| `ManagedAccountPassRunner` | `MatchOutcomeDispatcher` |
| `ManagedAccountMatchingRunner` | `MatchOutcomeDispatcher` |
| `processing run` | operation run, or the specific operation name when referring to the command definition |
| `AttributeService` | `MappingService` (for attribute mapping/merging) + `DefinitionService` (for attribute computation and unique value generation) |
| `ScoringService` | `MatchingService` (scoring remains as the computation technique within matching) |
| `identity name` (ambiguous friendly-label usage) | identity display name (via `FusionAccount.identityDisplayName`) |
| `attribute-service` (spec) | `mapping-service` + `definition-service` |
| `scoring-service` (spec) | `matching-service` |
| `custom:dryrun` | dry-run mode of the accountList operation |

