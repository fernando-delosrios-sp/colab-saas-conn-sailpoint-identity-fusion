## ADDED Requirements

### Requirement: Row is not an account synonym

Documentation, living specs, and source comments SHALL NOT use **row**, **Fusion row**, **identity-origin row**, **managed-origin row**, **managed row**, or **account row** as a name for a Fusion account, managed source account, identity, or origin snapshot. Those entities SHALL use the account taxonomy in this spec (Fusion account, managed source account, identity-origin Fusion account, managed-origin Fusion account, origin snapshot). **Row** MAY be used for a line in a real table: attribute mapping or definition config, match score breakdown (including `ExactMatchScoreRow`), HTML report or review-form table, or phase-timing table. The dry-run/console summary field `rowsSent` SHALL remain; prose SHALL describe it as the count of streamed Fusion accounts / `StdAccountListOutput` objects.

#### Scenario: Referring to a Fusion account

- **WHEN** documentation or a living spec names a persisted or in-memory Fusion account
- **THEN** it SHALL use **Fusion account**
- **AND** it SHALL NOT use **Fusion row**, **Fusion account row**, or **this row** for that entity

#### Scenario: Referring to a managed source account

- **WHEN** documentation or a living spec names an account fetched from a configured Fusion source
- **THEN** it SHALL use **managed source account**
- **AND** it SHALL NOT use **managed row**, **directory row**, **source record**, or **non-matched row** for that entity

#### Scenario: Referring to identity-origin or origin snapshot

- **WHEN** documentation names a Fusion account seeded from an identity, or Velocity `$account`
- **THEN** it SHALL use **identity-origin Fusion account** or **origin snapshot** as appropriate
- **AND** it SHALL NOT use **identity-origin row**, **Identities row**, or **origin row** for that entity

#### Scenario: Table rows remain allowed

- **WHEN** documentation describes an attribute mapping config line, a match score breakdown line, or an HTML report table line
- **THEN** it MAY use **row**
- **AND** report copy MAY say per-account rows for HTML table lines

#### Scenario: rowsSent counts streamed Fusion accounts

- **WHEN** documentation describes the dry-run or console run summary field `rowsSent`
- **THEN** it SHALL keep the key name `rowsSent`
- **AND** it SHALL describe the value as the number of streamed Fusion accounts or `StdAccountListOutput` objects

---

## MODIFIED Requirements

### Requirement: Code uses canonical terms

Source code SHALL use the canonical terms from this spec for variable names, function names, type names, class names, file names, and comments. The retired term **AttributeService** SHALL be replaced with **MappingService** or **DefinitionService** as appropriate. The retired term **ScoringService** SHALL be replaced with **MatchingService**. The ambiguous term **identity name** (when used for the human-friendly identity label) SHALL be replaced with **identity display name** and the `FusionAccount.identityDisplayName` accessor. Comments and JSDoc SHALL NOT call a Fusion account or managed source account a **row**. Score-table types such as `ExactMatchScoreRow` and the summary field `rowsSent` MAY keep those identifiers.

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

#### Scenario: Comments do not call accounts rows

- **WHEN** a developer writes a comment or JSDoc on `FusionLayers`, FusionService, or linked-account helpers
- **THEN** the comment SHALL say Fusion account or managed source account
- **AND** it SHALL NOT say Fusion row or this row for that entity

### Requirement: Documentation uses canonical terms

All documentation (`docs/`, `README.md`, inline comments) SHALL use canonical terms consistently. Retired terms (such as `consolidated account`, `raw account`, `pass`, `new-unmatched`, `Fusion row`, `identity-origin row`, or `managed row` as an account name) SHALL be replaced with their canonical successors.

#### Scenario: Guide documentation

- **WHEN** a guide explains a concept or process
- **THEN** the guide SHALL use canonical terms (e.g., "Fusion account", not "consolidated account" or "Fusion row"; "deferred candidate", not "new-unmatched peer"; "managed source account", not "non-matched row")

#### Scenario: Operation documentation

- **WHEN** an operation is documented
- **THEN** the documentation SHALL use canonical terms for inputs, outputs, phases, sweeps, and behavior
- **AND** account-list streaming SHALL be described as Fusion accounts or `StdAccountListOutput` objects, not as domain **account rows**

### Requirement: Account taxonomy terms are used precisely

Code, configuration, and documentation SHALL use the account taxonomy defined in this spec and SHALL distinguish between ISC accounts, managed source accounts, Fusion accounts, Fusion identities, identity-origin Fusion accounts, and provisional Fusion accounts.

#### Scenario: Referring to an incoming source account

- **WHEN** describing an account fetched from a configured Fusion source
- **THEN** the term "managed source account" SHALL be used, not "raw account", "source record", or "managed row"

#### Scenario: Referring to a pre-decision Fusion account

- **WHEN** describing a Fusion account created from a managed source account before its match fate is decided
- **THEN** the term "provisional Fusion account" SHALL be used

#### Scenario: Referring to a Fusion account seeded from an identity

- **WHEN** describing a Fusion account created from an existing ISC identity rather than a managed source account
- **THEN** the term "identity-origin Fusion account" SHALL be used, not "identity-based Fusion account" or "identity-origin row"

---

## Canonical Terms (delta — glossary tables)

Replace glossary table cells as follows when this change is archived:

| Term | Definition |
|------|------------|
| **Records** | Managed source accounts that run **Map** and **Define** and may register unique attributes, but do not create Fusion accounts when they do not match. |
| **Orphan accounts** | Managed source accounts whose non-matched accounts are dropped; optionally, stale orphan accounts can be disabled. |
| **$account** | The origin account snapshot available in Velocity templates — the managed source account that triggered creation, or the identity-origin Fusion account’s origin snapshot when the origin is the Identities source. |
| **StdAccountListOutput object** | One Fusion account payload streamed via `res.send` during account-list (including dry-run). The summary field `rowsSent` counts these objects. |

## Retired Terms (delta)

Add to the retired-terms table:

| Retired Term | Canonical Replacement |
|--------------|----------------------|
| `Fusion row` / `Fusion account row` / `persisted fusion row` | Fusion account |
| `identity-origin row` / `Identities row` (entity) | identity-origin Fusion account or Identities snapshot |
| `managed row` / `directory row` / `AD row` (entity) | managed source account |
| `non-matched row` (entity) | non-matched managed source account |
| `account row` (entity) | Fusion account or `StdAccountListOutput` object |
| `origin row` | origin snapshot / `$account` |
| `this row` (FusionLayers / Fusion account) | this Fusion account |
