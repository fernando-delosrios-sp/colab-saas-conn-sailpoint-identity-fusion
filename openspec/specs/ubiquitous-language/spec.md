spec.md [475L]
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

Source code SHALL use the canonical terms from this spec for variable names, function names, type names, class names, file names, and comments. The retired term **AttributeService** SHALL be replaced with **MappingService** or **DefinitionService** as appropriate. The retired term **ScoringService** SHALL be replaced with **MatchingService**. The retired term **identity display name** (and the `identityDisplayName` property) SHALL be replaced with **identity name**. Match-outcome identifiers SHALL use **merge** vocabulary (for example `fusionMergeDecisionMap`, `automaticMerge`, `mergeDecision`) and SHALL NOT use assign/link synonyms for that concept.

#### Scenario: Variable naming follows ubiquitous language (updated)

- **WHEN** a developer declares a variable representing the map service
- **THEN** the variable SHALL be named `mappingService`, not `attributeService`
- **WHEN** a developer declares a variable representing the matching service
- **THEN** the variable SHALL be named `matchingService`, not `scoringService`
- **WHEN** a developer declares a variable representing a domain concept
- **THEN** the variable name SHALL match the canonical term (e.g., `fusionAccount`, not `consolidatedAccount`; `managedSourceAccount`, not `rawAccount`)
- **WHEN** a developer declares a variable for a Match outcome joining an existing Fusion identity
- **THEN** the variable SHALL use merge vocabulary (e.g., `mergeDecision`, `automaticMerge`), not `authorizedLinkDecision` or `automaticAssignment`

#### Scenario: Function naming follows ubiquitous language (updated)

- **WHEN** a developer creates a function that calls the map service
- **THEN** the function SHALL reference `mappingService.mapAttributes`, not `attributeService.mapAttributes`
- **WHEN** a developer creates a function that operates on domain concepts
- **THEN** the function name SHALL use canonical terms (e.g., `scoreIdentityCandidates`, not `analyzeIdentityPhase`; `hasDeferredCandidateMatches`, not `hasNewUnmatchedPeerMatches`)
- **WHEN** a developer creates a function that retrieves a pending merge decision for a Fusion identity
- **THEN** the function SHALL be named `getFusionMergeDecision`, not `getFusionAssignmentDecision`

#### Scenario: Type naming follows ubiquitous language (updated)

- **WHEN** a developer defines a type, enum, or class for match outcomes
- **THEN** the type SHALL reference `MatchingService`, not `ScoringService`
- **WHEN** a developer defines a type, enum, or class for a domain concept
- **THEN** the type name SHALL use canonical terms (e.g., `MatchCandidateType.Deferred`, not `NewUnmatched`; `ManagedAccountMatchingRunner`, not `ManagedAccountPassRunner`)
- **WHEN** a developer defines a report decision wire value for joining an existing identity
- **THEN** the value SHALL be `merge-existing-identity`, not `assign-existing-identity`

### Requirement: Configuration uses canonical terms
Connector configuration (`connector-spec.json`, settings definitions, and UI labels) SHALL use canonical terms for field names, labels, help text, and option values.
#### Scenario: Configuration field naming
- **WHEN** a configuration field represents a domain concept
- **THEN** the field name and label SHALL use the canonical term
#### Scenario: Configuration help text
- **WHEN** help text explains a configuration option
- **THEN** the help text SHALL use canonical terms consistently

### Requirement: Documentation uses canonical terms

All documentation (`docs/`, `README.md`, inline comments) SHALL use canonical terms consistently. Retired terms (such as `consolidated account`, `raw account`, `pass`, `new-unmatched`, `automatic assignment`, or `link to existing identity` in Match-outcome context) SHALL be replaced with their canonical successors.

#### Scenario: Guide documentation

- **WHEN** a guide explains a concept or process
- **THEN** the guide SHALL use canonical terms (e.g., "Fusion account", not "consolidated account"; "deferred candidate", not "new-unmatched peer"; "automatic merge", not "automatic assignment")

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
The connector SHALL distinguish between the authoritative identity alias, the human-friendly identity name, and the internal Fusion account name.
#### Scenario: Identifying the authoritative identity alias
- **WHEN** code needs the value used for the Fusion display attribute override or for identity lookup
- **THEN** it SHALL use the **identity alias**, defined as the top-level `displayName` field of the `IdentityDocument` as reported by the SailPoint SDK
  - **AND** it SHALL NOT use `IdentityDocument.name` for that purpose

### Requirement: Dry-run mode is referenced as a mode, not an operation
The term **dry-run mode** SHALL refer to the accountList operation running with `dryRun.enabled: true` on its input. The retired term `custom:dryrun` SHALL NOT be used to refer to this behavior.
#### Scenario: Describing non-persistent analysis
- **WHEN** describing a non-persistent aggregation analysis that shares the accountList pipeline
- **THEN** the term "dry-run mode" or "the accountList operation in dry-run mode" SHALL be used
... [lean-ctx: omitted 1 lines]
#### Scenario: Naming the operation in configuration or documentation
- **WHEN** the connector handles an accountList invocation with `{ dryRun: { enabled: true } }`
- **THEN** the system SHALL identify this as an execution in "dry-run mode" in logs, metrics, and report data

### Requirement: The report step is the Epilogue, not a phase

The term **Epilogue** SHALL denote the terminal block of the account-list operation that emits reports and summaries after the pipeline phases complete, regardless of whether the pipeline succeeded or failed. The report step SHALL NOT be called a phase. Code, log labels, and documentation SHALL use structured `EPILOGUE {block} START` and `EPILOGUE {block} END elapsed=` lines (grep prefix `EPILOGUE`) instead of `PHASE 6`, `PHASE 7`, or colon-style `Epilogue: …` labels. The **Epilogue** domain term and `Report` short label in internal phase-timing breakdowns SHALL be preserved unchanged.

#### Scenario: Log labels use Epilogue terminology

- **WHEN** the account-list operation logs the report step
- **THEN** the label SHALL read `EPILOGUE report START` at entry and `EPILOGUE report END elapsed=` at completion
- **AND** the label SHALL NOT use a phase number or colon-style `Epilogue: report generation`

#### Scenario: Code naming follows the Epilogue term

- **WHEN** code refers to the terminal report block of the account-list pipeline
- **THEN** identifiers SHALL use canonical terms (for example `reportEpilogue`, `ReportEpilogueOptions`), consistent with the **Epilogue** glossary entry

#### Scenario: Glossary defines Epilogue alongside Phase

- **WHEN** the "Operations, phases, and sweeps" glossary table is consulted
- **THEN** it SHALL contain an **Epilogue** entry defined as the always-runs terminal report block

### Requirement: Glossary defines operation heartbeat terms

The ubiquitous-language glossary SHALL define **Operation heartbeat**, **STATUS line**, **Pipeline progress delta**, **API queue completed delta**, **DETAIL line**, and **EVENT_SUMMARY line** as canonical terms for periodic operation visibility logging. The **Operation heartbeat** entry SHALL state the default interval is 10 seconds (configurable via **Heartbeat interval** in Advanced Connection Settings). The **STATUS line** entry SHALL explain that pipeline progress and api-queue completion are separate counters with independent deltas. The **STATUS line** entry SHALL describe the compact api segment format `api=Na/Nq/Nc`.

#### Scenario: Glossary entry for Operation heartbeat

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up periodic operation visibility
- **THEN** it SHALL contain an **Operation heartbeat** entry describing the periodic STATUS and EVENT_SUMMARY emission during long-running operations with a default interval of 10 seconds

#### Scenario: Glossary entry for STATUS line

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up situational heartbeat text
- **THEN** it SHALL contain a **STATUS line** entry describing the primary situational heartbeat text line (grep prefix `STATUS`) including pipeline `progress=` and compact `api=Na/Nq/Nc` segments

#### Scenario: Glossary entry for pipeline progress delta

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up heartbeat throughput metrics
- **THEN** it SHALL contain a **Pipeline progress delta** entry describing the change in enumerable pipeline work (`progress.done`) since the previous STATUS tick

#### Scenario: Glossary entry for API queue completed delta

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up heartbeat throughput metrics
- **THEN** it SHALL contain an **API queue completed delta** entry describing the change in HTTP requests completed through ApiQueue since the previous STATUS tick, distinct from pipeline progress

#### Scenario: Glossary entry for EVENT_SUMMARY line

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up aggregated account activity logging
- **THEN** it SHALL contain an **EVENT_SUMMARY line** entry describing aggregated account-level activity between heartbeat ticks

---

### Requirement: Glossary defines Heartbeat interval
The ubiquitous-language glossary SHALL define **Heartbeat interval** as the canonical term for the Advanced Connection Settings field that controls how often the operation heartbeat emits STATUS and EVENT_SUMMARY lines.
#### Scenario: Glossary entry for Heartbeat interval
- **GIVEN** a reader opens the ubiquitous-language glossary table
... [lean-ctx: omitted 1 lines]
- **THEN** it SHALL contain a **Heartbeat interval** entry describing the seconds-based Advanced Connection Settings field and its relationship to `statsLoggingIntervalMs`

### Requirement: Glossary table includes heartbeat delta terms

The canonical glossary table under Operations, phases, and sweeps SHALL include rows for **Pipeline progress delta** and **API queue completed delta** with definitions that distinguish enumerable pipeline work from ApiQueue HTTP completions.

#### Scenario: Delta terms appear in operations glossary table

- **GIVEN** a reader consults the Operations, phases, and sweeps glossary table
- **WHEN** they search for heartbeat delta vocabulary
- **THEN** rows for **Pipeline progress delta** and **API queue completed delta** SHALL be present

### Requirement: Glossary defines Match merge terms

The ubiquitous-language glossary SHALL define **Merge**, **Manual merge**, and **Automatic merge** as canonical terms for Match outcomes that combine a managed source account with an existing Fusion identity.

#### Scenario: Merge entry in glossary

- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up Match outcomes that join an existing Fusion identity
- **THEN** a **Merge** entry SHALL define it as the Match outcome where a provisional or managed account is combined with an existing Fusion identity rather than creating a new identity

#### Scenario: Manual merge entry in glossary

- **GIVEN** a reader consults the glossary
- **WHEN** they look up reviewer-driven merge outcomes
- **THEN** a **Manual merge** entry SHALL state it is a merge decided on a review form and sets the `authorized` status entitlement

#### Scenario: Automatic merge entry in glossary

- **GIVEN** a reader consults the glossary
- **WHEN** they look up threshold-driven merge outcomes
- **THEN** an **Automatic merge** entry SHALL state it is a merge applied without review when the combined score meets the automatic merge threshold and sets the `auto` status entitlement

### Requirement: Glossary distinguishes merge from blend and correlation

The ubiquitous-language spec SHALL state that **Merge** is a Match decision/outcome, **Blend** is the structural absorption of a managed account into a Fusion account, and **Correlation** is the ISC platform operation to link account records. For operational logging, **Correlation link** and **Correlation merge** SHALL identify PATCH correlation subtypes in EVENT_SUMMARY and PHASE END lines. Documentation SHALL NOT use merge as a synonym for blend or correlation.

#### Scenario: Merge versus blend

- **GIVEN** documentation describes a Match outcome joining an existing Fusion identity
- **WHEN** the prose refers to the decision
- **THEN** it SHALL use **merge** (or **manual merge** / **automatic merge**)
- **AND** it SHALL use **blend** only when describing structural managed-account absorption

#### Scenario: Merge is not used as a synonym for correlation PATCH in logs

- **GIVEN** documentation describes EVENT_SUMMARY correlation segments
- **WHEN** an operator reads log format guidance
- **THEN** merge-decision-driven PATCH activity SHALL be labeled **Correlation merge**
- **AND** aggregation-time PATCH activity SHALL be labeled **Correlation link**

### Requirement: Glossary defines DETAIL line

The ubiquitous-language glossary SHALL define **DETAIL line** as a structured INFO log kind (grep prefix `DETAIL`) for operational milestones between heartbeat ticks, using space-separated `key=value` pairs. DETAIL lines during operations SHALL be prefixed with `[operationContext]`; during config bootstrap they SHALL be prefixed with `[config]`.

#### Scenario: Glossary entry for DETAIL line

- **GIVEN** a reader opens the ubiquitous-language glossary table
- **WHEN** they look up operational milestone logging
- **THEN** it SHALL contain a **DETAIL line** entry describing the structured key=value format and context prefixes

---

### Requirement: Glossary defines correlation activity log terms

The ubiquitous-language glossary SHALL define **Correlation link**, **Correlation merge**, and **Correlated-action grant** as canonical terms for aggregated log counters emitted during account-list operations. **Correlation link** SHALL mean correlation PATCH activity triggered by correlation-on-aggregation (`correlationMode: correlate`) for missing managed accounts. **Correlation merge** SHALL mean correlation PATCH activity triggered by an identity-merge decision (authorized form outcome or automatic merge). **Correlated-action grant** SHALL mean the log counter increment when the connector newly assigns the `correlated` action entitlement to a fusion account because all missing accounts are cleared. These terms SHALL NOT be used as synonyms for blend or reverse correlation.

#### Scenario: Glossary entry for Correlation link

- **WHEN** an operator reads the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Correlation link** entry describing aggregation-time PATCH correlation and its EVENT_SUMMARY / PHASE END counter segment

#### Scenario: Glossary entry for Correlation merge

- **WHEN** an operator reads the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Correlation merge** entry describing merge-decision-driven PATCH correlation distinct from link

#### Scenario: Glossary entry for Correlated-action grant

- **WHEN** an operator reads the ubiquitous-language spec glossary
- **THEN** it SHALL contain a **Correlated-action grant** entry describing the log counter for newly assigned correlated action entitlement

---

### Requirement: Glossary defines deferred drain and anchor deferred candidate

The ubiquitous-language glossary SHALL define **Deferred drain** and **Anchor deferred candidate** as canonical terms for the sequential deferred-matching resolution phase and the non-match Fusion accounts that seed the deferred candidate pool.

#### Scenario: Deferred drain entry in glossary
- **GIVEN** a reader consults the ubiquitous-language glossary
- **WHEN** they look up how pending managed accounts are resolved after identity scoring
- **THEN** a **Deferred drain** entry SHALL define it as the sequential per-source phase that scores each deferred-pending account against the current candidate pool and dispatches a deferred-match or non-match outcome before advancing to the next account

#### Scenario: Anchor deferred candidate entry in glossary
- **GIVEN** a reader consults the glossary
- **WHEN** they look up Fusion accounts that unblock deferred matching for later accounts in the same sweep
- **THEN** an **Anchor deferred candidate** entry SHALL define it as a persisted or materialized non-match Fusion account registered in the deferred candidate pool so subsequent pending accounts from the same source can defer against it

## Canonical Terms
### Account taxonomy
| Term | Definition |
... [lean-ctx: omitted 2 lines]
| **Managed source account** | An ISC account from one of the sources configured under **Source Settings → Sources**. The connector fetches these accounts and merges their attributes into Fusion accounts. |
| **Managed account key** | The composite identifier `sourceId::nativeIdentity` that uniquely identifies a managed source account within ISC. |
... [lean-ctx: omitted 1 lines]
| **Fusion identity** | A Fusion account that has been correlated to an ISC identity and is treated as that identity's authoritative account. |
| **Identity-origin Fusion account** | A Fusion account seeded from an existing ISC identity during aggregation (for example when **Include identities in the scope?** is enabled), rather than from a managed source account. |
... [lean-ctx: omitted 1 lines]
### Identity reference and Fusion account naming
The connector refers to an ISC identity and to the Fusion account itself through three distinct names. They are separated so the authoritative value used for the Fusion display attribute is not confused with the user-friendly report label.
... [lean-ctx: omitted 2 lines]
| **Identity alias** | The authoritative account name of the correlated ISC identity, taken from the top-level `displayName` field of the `IdentityDocument` as reported by the SailPoint SDK. This is the only value used for the Fusion account display attribute override (`fusionDisplayAttribute`). |
| **Identity name** | A human-friendly reference label for the correlated identity. Computed as `IdentityDocument.attributes.displayName`, falling back to `IdentityDocument.name`, then to `FusionAccount.name`. Used in reports, review form candidates, emails, logs, and other user-facing references where a readable label is required. Replaces the former **identity display name** concept. |
| **Fusion account name** | The `name` property of a `FusionAccount` (`state.name`). It mirrors the ISC `Account.name` / `Identity.name` field of the persisted account and is used for internal logging, history entries, and conflict tracking. It is not the output display attribute unless the display attribute override is configured to consume it. |
### Operations, phases, and sweeps
| Term | Definition |
... [lean-ctx: omitted 1 lines]
| **Operation** | A connector entry point such as `std:account:list` (the **accountList operation**). The operation is the command definition. The accountList operation supports an optional **dry-run mode** (`dryRun.enabled: true` on the input) for non-persistent analysis. |
... [lean-ctx: omitted 2 lines]
| **Epilogue** | The always-runs terminal block of the account-list operation that emits reports and summaries after the pipeline phases complete, regardless of pipeline success. Ordered most-durable-first (report file, report email, summary send). |
| **Operation heartbeat** | A periodic logging interval (default 10s, configurable via **Heartbeat interval**) during long-running operations that emits **STATUS line** and **EVENT_SUMMARY line** text to explain phase, step, progress, queue state, and aggregated account activity. |
| **Heartbeat interval** | Advanced Connection Settings field (`heartbeatInterval`, seconds) controlling how often the operation heartbeat emits STATUS and EVENT_SUMMARY lines. Converted to `statsLoggingIntervalMs` at runtime. Default 10 seconds. |
... [lean-ctx: omitted 1 lines]
| **EVENT_SUMMARY line** | A heartbeat text line aggregating account-level activity (matches, correlations, outcomes) recorded since the previous tick (grep prefix `EVENT_SUMMARY`). |
... [lean-ctx: omitted 1 lines]
| **Correlated account sweep** | A sweep that processes already-correlated managed source accounts before the main matching sweeps begin, so their outcomes are visible as candidates for uncorrelated accounts. |
... [lean-ctx: omitted 1 lines]
### Framework steps
| Term | Definition |
... [lean-ctx: omitted 2 lines]
| **Define** | Computing new attributes (normal attributes) and generating persistent unique attributes (UUIDs, counters, disambiguated values) using Apache Velocity templates. |
| **Match** | The product step that determines whether a Fusion account corresponds to an existing identity, using scoring and optional automatic merge or manual review. |
### Services
| Term | Definition |
... [lean-ctx: omitted 2 lines]
| **DefinitionService** | The stateless service responsible for the **Define** step — computing normal attributes via Velocity templates and generating persistent unique attributes (UUIDs, counters, disambiguated values). Located at `src/services/definitionService/`. |
| **MatchingService** | The stateless service responsible for the **Match** step — comparing Fusion accounts against existing identities using weighted scoring rules and routing each scored account to its **Match outcome dispatch** (exact match, partial match, deferred match, non-match). Located at `src/services/matchingService/`. |
| **FusionRun** | The centralized state container for a single operation run. Holds all mutable data loaded during the run (managed accounts, identities, Fusion accounts, form decisions, matching state) and serves as the single source of truth that stateless services read from and write to. Exposes `snapshot()` and `restore()` for recording and replay. Located at `src/model/fusionRun.ts`. |
### Matching and scoring
| Term | Definition |
... [lean-ctx: omitted 3 lines]
| **Combined match score** | The weighted mean of evaluated rule similarities used to decide whether a candidate is a potential match. |
... [lean-ctx: omitted 1 lines]
| **Merge** | The Match outcome where a managed source account (via its provisional Fusion account) is combined with an existing Fusion identity rather than creating a new identity. |
| **Manual merge** | A merge decided by a reviewer on a review form. Sets the `authorized` status entitlement. |
| **Automatic merge** | A merge applied without review when the combined score meets the automatic merge threshold. Sets the `auto` status entitlement. |
| **Match outcome dispatch** | The routing of a scored managed source account to one of four outcomes — exact match, partial match, deferred match, or non-match — and the application of the resulting action (automatic merge, review-form creation, deferred claim, or non-match registration). Implemented by `MatchOutcomeDispatcher` inside `src/services/matchingService/`. |
### Candidate types
| Term | Definition |
... [lean-ctx: omitted 1 lines]
| **Identity candidate** | A candidate for matching that is an existing ISC identity (or a Fusion identity already in the baseline). |
| **Deferred candidate** | A candidate for matching that is another provisional Fusion account from the same source in the same operation run, causing identity creation to be deferred until the next aggregation. |
### Source types
| Term | Definition |
... [lean-ctx: omitted 1 lines]
| **Authoritative accounts** | Managed source accounts that create new ISC identities when they do not match an existing identity. Fusion typically owns correlation decisions for these sources. |
... [lean-ctx: omitted 1 lines]
| **Record unique registration** | A bulk Process-phase step (`record-unique-registration`) that registers unique attribute values for Record-type managed accounts with **Include record accounts in Match** disabled. Applies selective attribute mapping (targets coincident with unique definition names) and `registerUniqueAttributes` only — skipping normal Define, Match scoring, and Fusion account creation. Runs after the correlated sweep and before the uncorrelated sweep. |
| **Orphan accounts** | Managed source accounts whose non-matched rows are dropped; optionally, stale orphan accounts can be disabled. |
### Processing states and outcomes
| Term | Definition |
... [lean-ctx: omitted 3 lines]
| **Non-matched / `nonMatched`** | A managed source account that completed the **Match** step without finding any acceptable identity candidate. The status entitlement value is `nonMatched`; the matching status string is `non-matched`. |
| **Orphan** | A Fusion account that no longer has any contributing managed source accounts. Depending on configuration, orphan accounts may be removed or disabled. |
| **Deferred** | A match result where the best candidate is a deferred candidate from the same source in the same operation run. The connector defers creating a new identity until a later aggregation can compare against the established baseline. |
### Entitlement system
Fusion accounts carry two kinds of entitlements in their schema, distinguished by how they are assigned and what they represent:
... [lean-ctx: omitted 3 lines]
| **Status** | `managed: false` | Calculated by the connector — never assigned externally | Describe the account's current processing state |
**Action entitlements** drive behavior. Assigning a `report` action to a Fusion account triggers report generation. Removing a `reviewer:<sourceId>` action revokes a reviewer's scope.
**Status entitlements** are read-only signals. They let users search, filter, and understand where each account is in the Fusion lifecycle without external assignment being possible.
#### Action entitlements
| Term | Wire value | Definition |
... [lean-ctx: omitted 1 lines]
| **FusionReport** | `report` | Assign to trigger generation of a Fusion report for this account. |
... [lean-ctx: omitted 1 lines]
| **Correlated** | `correlated` | Set by the connector when all managed source accounts for this Fusion account have been correlated. Triggers correlation of missing source accounts when assigned externally. |
| **Reviewer** | `reviewer:<sourceId>` | Assign to designate an identity as a reviewer for a specific managed source. The suffix identifies the source. The `reviewer` status entitlement is also set on the reviewer's Fusion account to mark their role. |
#### Status entitlements
| Term | Wire value | Definition |
... [lean-ctx: omitted 2 lines]
| **Baseline** | `baseline` | The identity existed before this Fusion source aggregation and is included as a comparison point during Match. |
| **Non-matched** | `nonMatched` | A managed source account completed the Match step without finding any acceptable identity candidate. |
... [lean-ctx: omitted 1 lines]
| **Authorized** | `authorized` | Status after a **manual merge** by a reviewer. |
... [lean-ctx: omitted 2 lines]
| **Reviewer** | `reviewer` | The identity is a Match reviewer for one or more managed sources. Set alongside the `reviewer:<sourceId>` action entitlement. |
... [lean-ctx: omitted 1 lines]
| **ActiveReviews** | `activeReviews` | The account has one or more pending Fusion review forms awaiting reviewer decision. |
... [lean-ctx: omitted 1 lines]
### Review and decision domain
| Term | Definition |
... [lean-ctx: omitted 1 lines]
| **Reviewer** | A person who reviews identity candidates presented in a Fusion review form and decides whether a Fusion account should merge with an existing identity or create a new one. A reviewer's Fusion identity carries the `reviewer` status entitlement and one or more `reviewer:<sourceId>` action entitlements. |
... [lean-ctx: omitted 1 lines]
| **FusionDecision** | A reviewer's decision on a review form. Contains the chosen outcome (merge with existing identity or create new identity), the submitter, comments, whether the decision is finished, and whether it was an automatic merge. |
| **Manual review workflow** | The process flow: potential matches are identified → review forms are created with top candidates → reviewers evaluate and decide → decisions are applied by the connector on the next account aggregation. |
| **Global reviewer** | A reviewer automatically added to all review forms regardless of source. Controlled by **Owners are global reviewers?** in Review Settings. When enabled, Fusion source owners and members of the source governance group are added as reviewers on every form. |
... [lean-ctx: omitted 2 lines]
### Matching nuances
| Term | Definition |
... [lean-ctx: omitted 1 lines]
| **Matching rule** | A per-attribute comparison configuration within the Match step. Each rule specifies the attribute to compare, the similarity algorithm, a minimum similarity threshold, and a relative weight toward the combined match score. |
| **Mandatory match** | A matching rule that must pass (meet its threshold) for a candidate to be considered a potential match. If a mandatory rule fails, the candidate is rejected regardless of the combined match score. |
... [lean-ctx: omitted 1 lines]
| **Skip match if threshold not met** | When enabled on a matching rule, the rule contributes a zero-weighted score but does not disqualify the candidate if its individual threshold is not met. |
... [lean-ctx: omitted 1 lines]
| **Automatic merge match score** | The minimum combined match score (0–100) above which a candidate is automatically merged into an existing Fusion identity without manual review. Requires **Enable automatic merge** to be on. |
... [lean-ctx: omitted 1 lines]
### Matching algorithms
| Term | Definition |
... [lean-ctx: omitted 1 lines]
| **Enhanced Name Matcher** | A name-specialized algorithm that tokenizes name components (first, middle, last, titles, suffixes), handles cultural naming patterns and nicknames, and compares using bigrams. The recommended algorithm for name attributes. |
... [lean-ctx: omitted 2 lines]
| **Dice** | The Sorensen-Dice coefficient — measures similarity as twice the intersection of bigrams divided by the sum of bigram counts. |
| **Double Metaphone** | A phonetic algorithm that produces two pronunciation codes per string (primary and alternate), useful for comparing names that sound similar but are spelled differently. |
... [lean-ctx: omitted 1 lines]
| **Custom Algorithm** | A user-defined Apache Velocity expression that computes a similarity score from the two attribute values. |
### Velocity and Define context
| Term | Definition |
... [lean-ctx: omitted 2 lines]
| **Unique attribute definition** | A Define-step rule that generates a value guaranteed to be unique across all Fusion accounts. Uses collision-based disambiguation or an incremental counter. Runs after normal definitions. |
... [lean-ctx: omitted 1 lines]
| **$account** | The origin account snapshot available in Velocity templates — the managed source account that triggered creation, or the identity-origin row when the origin is the Identities source. |
... [lean-ctx: omitted 1 lines]
| **$sources** | A Map keyed by source name containing per-source account snapshots. Accessible via dot notation (`$sources.Workday`). |
... [lean-ctx: omitted 4 lines]
| **$isUnique(value)** | Returns `true` when the given value (after applying the definition's case, trim, spaces, normalize, and maxLength transformations) is not already registered as in use. Allows branching between candidate formats before falling back to `$counter`. |
... [lean-ctx: omitted 1 lines]
| **Incremental counter** | A persistent, always-incrementing counter that survives across aggregations. Controlled by **Use incremental counter?** and **Counter start value**. When off, collision-based disambiguation is used instead. |
| **Collision-based disambiguation** | The default unique-value strategy: the expression is re-evaluated with an incrementing `$counter` suffix until a value is found that is not already in use, up to **Maximum attempts**. |
### Configuration vocabulary
Configuration is organized into menus and sections in the connector source in ISC.
... [lean-ctx: omitted 2 lines]
| **Connection Settings** | The top-level configuration menu for authentication and connectivity to ISC APIs. Contains the ISC API URL and PAT credentials. |
... [lean-ctx: omitted 2 lines]
| **Identity Scope Query** | An ISC search-syntax filter that narrows which identities are included in processing. Use `*` for all identities or filters like `attributes.cloudLifecycleState:active`. |
... [lean-ctx: omitted 1 lines]
| **Processing Control** | The section managing account maintenance: history retention, empty account deletion, and missing-identifier behavior. |
... [lean-ctx: omitted 3 lines]
| **Normal Attribute Definitions** | The section defining Velocity expressions that compute Fusion account attributes. Runs on every aggregation; supports static (one-time) or refreshable evaluation. |
| **Unique Attribute Definitions** | The section defining Velocity expressions that generate values guaranteed unique across all Fusion accounts. Uses collision-based disambiguation or incremental counters. |
... [lean-ctx: omitted 1 lines]
| **Matching Settings** | The section configuring per-attribute matching rules (algorithm, threshold, weight, mandatory, skip flags), the manual review score threshold, and automatic merge. |
| **Review Settings** | The section configuring the manual review workflow: form attributes, form expiration, maximum candidates per form, and global reviewer behavior. |
... [lean-ctx: omitted 2 lines]
| **Advanced Connection Settings** | The section for API communication tuning: request rate limiting, retry behavior, and external logging configuration. |
... [lean-ctx: omitted 1 lines]
### Source and aggregation modes
| Term | Definition |
... [lean-ctx: omitted 1 lines]
| **Aggregation mode** | Per-source setting controlling when managed source accounts are refreshed. Options: **Do not aggregate** (use existing account data), **Aggregate before processing** (refresh accounts first), or **Delayed aggregation** (refresh after processing completes). |
| **Aggregate before processing** | Aggregation mode where the managed source is refreshed before the connector processes its accounts. The connector polls the aggregation task status every 30 seconds until completion or the configured timeout. |
... [lean-ctx: omitted 1 lines]
| **Optimized aggregation** | When enabled, only accounts that have changed since the last run are processed. Improves performance for large sources. Must be disabled when using reverse correlation. |
... [lean-ctx: omitted 3 lines]
| **Correlation mode** | Per-source setting controlling how uncorrelated managed source accounts are linked to identities. Options: **Do not correlate** (leave unlinked), **Correlate missing accounts on aggregation** (link via API during processing), or **Reverse correlation from managed source** (push Fusion identity data back to the source for ISC correlation). |
... [lean-ctx: omitted 1 lines]
| **Reverse correlation** | Correlation mode where the connector creates a dedicated attribute on the managed source containing the Fusion identity ID, then ISC's correlation rule matches accounts to identities. Requires a correlation attribute name and display name. |
... [lean-ctx: omitted 1 lines]
| **Deferred candidate matching** | Per-source toggle that controls whether a managed source account is compared to other provisional Fusion accounts from the same source in the same run. When enabled, if the only strong match is a deferred candidate, identity creation is deferred. Disable when one person may appear as multiple accounts in a single aggregation. |
| **Include record accounts in Match** | Per-source toggle for Record-type sources. When enabled, record accounts participate in Match scoring against identities and deferred candidates. When disabled, they only run Map and Define and register unique attributes. |
... [lean-ctx: omitted 3 lines]
### Deployment and integration
| Term | Definition |
... [lean-ctx: omitted 1 lines]
| **Proxy mode** | A deployment option where connector logic runs on an external server and communicates with ISC via a lightweight proxy connector. Offloads processing from ISC infrastructure. |
| **External logging** | Sending connector log output to an external endpoint (e.g., Splunk, Datadog) for centralized monitoring. Controlled by the external logging URL and level settings. |
... [lean-ctx: omitted 1 lines]
| **Concurrency check** | A safeguard that prevents overlapping connector aggregations from running simultaneously. Controlled by **Enable concurrency check?** in Developer Settings. |
... [lean-ctx: omitted 1 lines]
| **Cascade aggregation** | When enabled, single-account operations (e.g., accountRead) trigger aggregation of managed sources before fetching account data. Ensures up-to-date source data. |
... [lean-ctx: omitted 1 lines]
| **Localized user communications** | When enabled, review forms and emails use the reviewer's preferred language. Requires an identity attribute specifying the language code. |
... [lean-ctx: omitted 2 lines]
### Testing
| Term | Definition |
... [lean-ctx: omitted 2 lines]
| **Golden artifact** | A pre-validated expected output file (e.g., `output.sweep1.expected.json`) used as the reference for automated test comparison. Generated artifacts are compared against golden artifacts to detect regressions. |
| **Sweep** (testing) | A single aggregation run within a test scenario. Multi-sweep scenarios (sweep 1, sweep 2) validate stateful behavior across sequential aggregations. |
| **Side effects** | Non-account changes produced during an aggregation run (e.g., form creation, correlation API calls). Captured in side-effect files for test validation. |
## Retired Terms
The following terms are retired and SHALL NOT be used in new code, configuration, or documentation:
... [lean-ctx: omitted 7 lines]
| `new-unmatched` / `NewUnmatched` | deferred / `Deferred` |
... [lean-ctx: omitted 4 lines]
| `processing run` | operation run, or the specific operation name when referring to the command definition |
| `AttributeService` | `MappingService` (for attribute mapping/merging) + `DefinitionService` (for attribute computation and unique value generation) |
| `ScoringService` | `MatchingService` (scoring remains as the computation technique within matching) |
| `identity display name` / `identityDisplayName` | identity name (for the human-friendly reference label) |
| `attribute-service` (spec) | `mapping-service` + `definition-service` |
... [lean-ctx: omitted 1 lines]
| `custom:dryrun` | dry-run mode of the accountList operation |
| `automatic assignment` / `Automatic assignment` | automatic merge / **Automatic merge** (Match outcome) |
| `assign-existing-identity` | `merge-existing-identity` |
| `link to existing identity` | merge with existing identity |
| `automaticAssignment` | `automaticMerge` |
| `fusionAssignmentDecisionMap` | `fusionMergeDecisionMap` |
| `authorizedLinkDecision` | `mergeDecision` |
| `fusionEnableAutoAssignment` | `fusionEnableAutoMerge` |
| `fusionAutoAssignmentScore` | `fusionAutoMergeScore` |
| `autoAssignedIdentityIds` / `markAutoAssigned` | `autoMergedIdentityIds` / `markAutoMerged` |

