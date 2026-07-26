## ADDED Requirements

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

The ubiquitous-language spec SHALL state that **Merge** is a Match decision/outcome, **Blend** is the structural absorption of a managed account into a Fusion account, and **Correlation** is the ISC platform operation to link account records. Documentation SHALL NOT use merge as a synonym for blend or correlation.

#### Scenario: Merge versus blend

- **GIVEN** documentation describes a Match outcome joining an existing Fusion identity
- **WHEN** the prose refers to the decision
- **THEN** it SHALL use **merge** (or **manual merge** / **automatic merge**)
- **AND** it SHALL use **blend** only when describing structural managed-account absorption

## MODIFIED Requirements

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

### Requirement: Documentation uses canonical terms

All documentation (`docs/`, `README.md`, inline comments) SHALL use canonical terms consistently. Retired terms (such as `consolidated account`, `raw account`, `pass`, `new-unmatched`, `automatic assignment`, or `link to existing identity` in Match-outcome context) SHALL be replaced with their canonical successors.

#### Scenario: Guide documentation

- **WHEN** a guide explains a concept or process
- **THEN** the guide SHALL use canonical terms (e.g., "Fusion account", not "consolidated account"; "deferred candidate", not "new-unmatched peer"; "automatic merge", not "automatic assignment")

#### Scenario: Operation documentation

- **WHEN** an operation is documented
- **THEN** the documentation SHALL use canonical terms for inputs, outputs, phases, sweeps, and behavior

## Canonical Terms (delta — Matching and scoring section)

Replace glossary table rows as follows when this change is archived:

| Term | Definition |
|------|------------|
| **Match** | The product step that determines whether a Fusion account corresponds to an existing identity, using scoring and optional automatic merge or manual review. |
| **Automatic merge** | The decision to merge a matched Fusion account into a specific existing Fusion identity without manual review when the combined score meets the automatic merge threshold. |
| **Match outcome dispatch** | The routing of a scored managed source account to one of four outcomes — exact match, partial match, deferred match, or non-match — and the application of the resulting action (automatic merge, review-form creation, deferred claim, or non-match registration). Implemented by `MatchOutcomeDispatcher` inside `src/services/matchingService/`. |
| **Authorized** | `authorized` | Status after a **manual merge** by a reviewer. |
| **FusionDecision** | A reviewer's decision on a review form. Contains the chosen outcome (merge with existing identity or create new identity), the submitter, comments, whether the decision is finished, and whether it was an automatic merge. |
| **Automatic merge match score** | The minimum combined match score (0–100) above which a candidate is automatically merged into an existing Fusion identity without manual review. Requires **Enable automatic merge** to be on. |
| **Matching Settings** | The section configuring per-attribute matching rules (algorithm, threshold, weight, mandatory, skip flags), the manual review score threshold, and automatic merge. |

## Retired Terms (delta)

Add to retired terms table:

| Retired term | Canonical successor | Context |
|--------------|---------------------|---------|
| `automatic assignment` / `Automatic assignment` | automatic merge / **Automatic merge** | Match outcome |
| `assign-existing-identity` | `merge-existing-identity` | Report/dry-run wire |
| `link to existing identity` | merge with existing identity | Review forms, docs |
| `automaticAssignment` | `automaticMerge` | Code property |
| `fusionAssignmentDecisionMap` | `fusionMergeDecisionMap` | Code identifier |
| `authorizedLinkDecision` | `mergeDecision` | Code identifier |
| `fusionEnableAutoAssignment` | `fusionEnableAutoMerge` | Config key |
| `fusionAutoAssignmentScore` | `fusionAutoMergeScore` | Config key |
| `autoAssignedIdentityIds` / `markAutoAssigned` | `autoMergedIdentityIds` / `markAutoMerged` | Run state |
