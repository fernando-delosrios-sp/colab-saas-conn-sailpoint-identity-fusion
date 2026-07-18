# ubiquitous-language Spec

## Purpose

This spec defines the canonical domain terms and their usage requirements across the connector, its configuration, and its documentation. The ubiquitous language ensures consistent terminology between developers, domain experts, and AI agents.

## Requirements

### Requirement: Canonical terms are defined in the glossary

All domain terms SHALL be defined in `docs/concepts/glossary.md` with clear, unambiguous descriptions.

#### Scenario: New domain term is introduced
- **WHEN** a new domain concept is added to the system
- **THEN** a corresponding entry is added to the glossary

#### Scenario: Existing term meaning changes
- **WHEN** the meaning or usage of an existing term evolves
- **THEN** the glossary entry is updated to reflect the new meaning

### Requirement: Code uses canonical terms

Source code SHALL use the canonical terms from the glossary for variable names, function names, type names, and comments.

#### Scenario: Variable naming follows ubiquitous language
- **WHEN** a developer declares a variable representing a domain concept
- **THEN** the variable name matches the canonical term (e.g., `fusionAccount`, not `consolidatedAccount`)

#### Scenario: Function naming follows ubiquitous language
- **WHEN** a developer creates a function that operates on domain concepts
- **THEN** the function name uses canonical terms (e.g., `matchFusionAccount`, not `scoreConsolidatedRecord`)

### Requirement: Configuration uses canonical terms

Connector configuration (`connector-spec.json`) SHALL use canonical terms for field names, labels, and help text.

#### Scenario: Configuration field naming
- **WHEN** a configuration field represents a domain concept
- **THEN** the field name uses the canonical term

#### Scenario: Configuration help text
- **WHEN** help text explains a configuration option
- **THEN** the help text uses canonical terms consistently

### Requirement: Documentation uses canonical terms

All documentation (`docs/`, `README.md`, inline comments) SHALL use canonical terms consistently.

#### Scenario: Guide documentation
- **WHEN** a guide explains a concept or process
- **THEN** the guide uses canonical terms (e.g., "Fusion account", not "consolidated account")

#### Scenario: Operation documentation
- **WHEN** an operation is documented
- **THEN** the documentation uses canonical terms for inputs, outputs, and behavior

### Requirement: AI agents use canonical terms

AI agents (via `.agents/AGENTS.md`) SHALL be instructed to use canonical terms when generating code or documentation.

#### Scenario: Agent generates code
- **WHEN** an AI agent generates or modifies code
- **THEN** the agent uses canonical terms for identifiers and comments

#### Scenario: Agent generates documentation
- **WHEN** an AI agent generates or modifies documentation
- **THEN** the agent uses canonical terms consistently

## Canonical Terms

### Accounts

| Term | Definition |
|------|------------|
| **Fusion account** | The connector's consolidated ISC account, produced by Map and Define steps |
| **Fusion identity** | A Fusion account that became an identity in ISC |
| **Identity-based Fusion account** | A Fusion account whose origin is an identity |
| **Managed account** | An account from a configured source |
| **Managed account key** | The composite identifier `sourceId::nativeIdentity` |

### Processing States

| Term | Definition |
|------|------------|
| **Baseline** | Existing identities used as comparison points during Match |
| **Uncorrelated** | A Fusion or managed account not yet linked to a known identity |
| **Non-matched** | A managed account that completed Match without finding an acceptable candidate |
| **Orphan** | A Fusion account with no contributing managed source accounts |
| **Deferred** | A match result where the best candidate is another new unmatched account |

### Framework Steps

| Term | Definition |
|------|------------|
| **Map** | Merging attributes from managed source accounts into Fusion account schema |
| **Define** | Computing new attributes using Velocity templates |
| **Match** | Scoring Fusion accounts against identity baseline |

### Source Types

| Term | Definition |
|------|------------|
| **Authoritative accounts** | Managed source accounts that create new ISC identities |
| **Records** | Managed source accounts that run Map and Define but don't create Fusion accounts |
| **Orphan accounts** | Managed source accounts whose unmatched rows are dropped |

### Correlation and Matching

| Term | Definition |
|------|------------|
| **Correlation** | Linking a managed account to an existing identity |
| **Matching** | Similarity scoring to determine identity correspondence |
| **Assignment** | Linking a matched account to a specific identity |
| **Deferred matching** | Comparing unmatched accounts against other new unmatched accounts |
