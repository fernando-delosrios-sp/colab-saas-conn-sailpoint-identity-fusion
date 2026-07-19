## MODIFIED Requirements

### Requirement: Canonical terms are defined in the glossary

All domain terms SHALL be defined in `docs/concepts/glossary.md` with clear, unambiguous descriptions. The glossary MUST be a user-friendly mirror of `openspec/specs/ubiquitous-language/spec.md`, which is the master source of truth.

#### Scenario: New domain term is introduced
- **WHEN** a new domain concept is added to the system
- **THEN** a corresponding entry is added first to the ubiquitous-language spec and then to the glossary

#### Scenario: Existing term meaning changes
- **WHEN** the meaning or usage of an existing term evolves
- **THEN** the spec entry is updated first and the glossary is updated to reflect the new meaning

### Requirement: Code uses canonical terms

Source code SHALL use the canonical terms from the ubiquitous-language spec for variable names, function names, type names, class names, file names, and comments. Code identifiers MUST avoid synonyms and retired terms.

#### Scenario: Variable naming follows ubiquitous language
- **WHEN** a developer declares a variable representing a domain concept
- **THEN** the variable name matches the canonical term (e.g., `fusionAccount`, not `consolidatedAccount`; `deferredCandidate`, not `peerCandidate`)

#### Scenario: Function naming follows ubiquitous language
- **WHEN** a developer creates a function that operates on domain concepts
- **THEN** the function name uses canonical terms (e.g., `scoreIdentityCandidates`, not `analyzeIdentityPhase`)

#### Scenario: Type naming follows ubiquitous language
- **WHEN** a developer creates a type or enum value for a domain concept
- **THEN** the type name uses canonical terms (e.g., `MatchCandidateType.Deferred`, not `NewUnmatched`)

### Requirement: Configuration uses canonical terms

Connector configuration (`connector-spec.json`) SHALL use canonical terms for field names, labels, and help text. Help text MUST use the same terms as the glossary.

#### Scenario: Configuration field naming
- **WHEN** a configuration field represents a domain concept
- **THEN** the field name uses the canonical term

#### Scenario: Configuration help text
- **WHEN** help text explains a configuration option
- **THEN** the help text uses canonical terms consistently and avoids retired synonyms

### Requirement: Documentation uses canonical terms

All documentation (`docs/`, `README.md`, inline comments) SHALL use canonical terms consistently. Documentation MUST not use retired terms or synonyms.

#### Scenario: Guide documentation
- **WHEN** a guide explains a concept or process
- **THEN** the guide uses canonical terms (e.g., "identity-origin Fusion account", not "identity-based Fusion account")

#### Scenario: Operation documentation
- **WHEN** an operation is documented
- **THEN** the documentation uses canonical terms for inputs, outputs, and behavior

### Requirement: AI agents use canonical terms

AI agents (via `.agents/AGENTS.md`) SHALL be instructed to consult and use the canonical terms in `openspec/specs/ubiquitous-language/spec.md` when generating code or documentation. Agents MUST update the spec when introducing new domain terms.

#### Scenario: Agent generates code
- **WHEN** an AI agent generates or modifies code
- **THEN** the agent uses canonical terms for identifiers and comments

#### Scenario: Agent generates documentation
- **WHEN** an AI agent generates or modifies documentation
- **THEN** the agent uses canonical terms consistently

#### Scenario: Agent introduces a new term
- **WHEN** an AI agent encounters a new domain concept that needs a name
- **THEN** the agent adds it to the ubiquitous-language spec before using it in code or docs

## ADDED Requirements

### Requirement: Account taxonomy terms SHALL be used consistently

All code, configuration, and documentation MUST use the canonical account taxonomy. Each account type SHALL have exactly one canonical name.

#### Scenario: Authoritative account is referenced
- **WHEN** a developer refers to an account from an authoritative source
- **THEN** the term "authoritative account" or "managed source account" is used, never "source account" alone

#### Scenario: Fusion identity is referenced
- **WHEN** a developer refers to a Fusion account correlated to an ISC identity
- **THEN** the term "Fusion identity" is used, not "correlated Fusion account"

#### Scenario: Identity-origin Fusion account is referenced
- **WHEN** a developer refers to a Fusion account seeded from an ISC identity
- **THEN** the term "identity-origin Fusion account" is used, not "identity-based Fusion account"

### Requirement: Provisional Fusion account term SHALL be used

The transient Fusion account created from a managed source account before its match fate is decided SHALL be called a "provisional Fusion account" in documentation and comments.

#### Scenario: Pre-decision account is described
- **WHEN** documentation or comments describe the Fusion account created during matching before a decision is made
- **THEN** the term "provisional Fusion account" is used

### Requirement: Operation and phase terms SHALL be used consistently

Connector executions SHALL be referred to by their operation name (`accountList operation`, `dryRun operation`, etc.). Major stages of an operation SHALL be called "phases". Traversals within a phase SHALL be called "sweeps".

#### Scenario: Connector execution is referenced
- **WHEN** a developer refers to a single connector execution
- **THEN** the specific operation name is used, not "processing run" or "aggregation run"

#### Scenario: Pipeline stage is referenced
- **WHEN** a developer refers to a major stage such as identity documents or managed accounts
- **THEN** the term "phase" is used

#### Scenario: Matching traversal is referenced
- **WHEN** a developer refers to the identity scoring or deferred scoring traversal
- **THEN** the term "sweep" is used ("identity scoring sweep", "deferred scoring sweep")

### Requirement: Matching and scoring terms SHALL be distinguished

The process of determining whether a Fusion account belongs to an existing identity SHALL be called "matching". The similarity-calculation method used by matching SHALL be called "scoring". The product step name SHALL remain "Match" (capitalized).

#### Scenario: Scoring service is described
- **WHEN** documentation or code refers to the similarity calculation
- **THEN** the term "scoring" is used, not "matching"

#### Scenario: Overall process is described
- **WHEN** documentation or code refers to the determination of identity correspondence
- **THEN** the term "matching" is used

### Requirement: Candidate types SHALL be identity or deferred

Match candidates SHALL be classified only as "identity" candidates or "deferred" candidates. The candidate type value `new-unmatched` SHALL NOT be used.

#### Scenario: Identity candidate is scored
- **WHEN** a Fusion account is scored against an existing identity or Fusion identity
- **THEN** the candidate type is recorded as `identity`

#### Scenario: Deferred candidate is scored
- **WHEN** a Fusion account is scored against another new unmatched account from the same source
- **THEN** the candidate type is recorded as `deferred`, not `new-unmatched`

### Requirement: Symbol names SHALL match canonical terms

Code symbols that represent domain concepts SHALL be renamed to match canonical terms. Retired symbols SHALL NOT remain in the codebase.

#### Scenario: Runner class is renamed
- **WHEN** the managed account matching orchestrator is referenced
- **THEN** it is named `ManagedAccountMatchingRunner`, not `ManagedAccountPassRunner`

#### Scenario: Analyzer methods are renamed
- **WHEN** the analyzer scores identity or deferred candidates
- **THEN** the methods are named `scoreIdentityCandidates` and `scoreDeferredCandidates`, not `analyzeIdentityPhase` and `analyzeDeferredPhase`

#### Scenario: Helper function is renamed
- **WHEN** checking for deferred matches
- **THEN** the helper is named `hasDeferredMatches`, not `hasNewUnmatchedPeerMatches`
