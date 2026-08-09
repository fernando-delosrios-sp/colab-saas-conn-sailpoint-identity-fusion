## ADDED Requirements

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

---

## MODIFIED Requirements

### Requirement: Identity reference terms are defined precisely

The connector SHALL distinguish between the authoritative identity alias, the human-friendly identity name, and the internal Fusion account name. The glossary definition of **Fusion account name** MUST refer to the `name` property of `FusionAccount` and MUST NOT refer to `state.name` or `FusionAccountState`.

#### Scenario: Identifying the authoritative identity alias

- **WHEN** code needs the value used for the Fusion display attribute override or for identity lookup
- **THEN** it SHALL use the **identity alias**, defined as the top-level `displayName` field of the `IdentityDocument` as reported by the SailPoint SDK
  - **AND** it SHALL NOT use `IdentityDocument.name` for that purpose

#### Scenario: Fusion account name definition omits deleted State

- **WHEN** the glossary defines **Fusion account name**
- **THEN** the definition SHALL describe `FusionAccount.name` (or the `name` property of a `FusionAccount`)
- **AND** the definition SHALL NOT mention `state.name` or `FusionAccountState`
