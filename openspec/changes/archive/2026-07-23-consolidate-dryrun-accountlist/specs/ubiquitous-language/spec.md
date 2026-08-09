> **Archive note (2026-08-09):** Terminology in this delta reflects the change at archive time. Current canonical terms: **`MatchOutcomeDispatcher`** (replaces `ManagedAccountPassRunner` / `ManagedAccountMatchingRunner`); **`configureScoring({ captureBreakdown })`** (replaces `setCaptureBreakdown`). See `openspec/changes/archive/README.md` and living specs after `reconcile-matching-delegation-spec`.

## MODIFIED Requirements

### Requirement: Operation, phase, and sweep vocabulary is used consistently
The terms **operation**, **phase**, and **sweep** SHALL be used as defined in this spec. Generic terms such as "run", "pass", or "round" SHALL NOT be used when a more precise term applies.

#### Scenario: Naming a connector entry point
- **WHEN** referring to a connector entry point such as `std:account:list`
- **THEN** the term "operation" SHALL be used (e.g., "accountList operation", "accountList operation in dry-run mode")

#### Scenario: Naming an execution of a connector entry point
- **WHEN** referring to a single execution or instance of a connector operation
- **THEN** the term "operation run" or "run" SHALL be used (e.g., "an accountList operation run", "during the run"), not "processing run" or "aggregation run"

#### Scenario: Naming a major pipeline stage
- **WHEN** referring to a major stage of an operation pipeline
- **THEN** the term "phase" SHALL be used (e.g., "managed accounts phase")

#### Scenario: Naming a focused account traversal
- **WHEN** referring to a traversal of a set of accounts with a single purpose within a phase
- **THEN** the term "sweep" SHALL be used, not "pass" or "round"

### Requirement: Retired terms are not reintroduced
Retired terms and symbols SHALL NOT be reintroduced into code, configuration, or documentation. The retired term list SHALL include `custom:dryrun` (in favor of "dry-run mode of the accountList operation"), `AttributeService`, `ScoringService`, and `identity display name` in addition to the previously retired terms. Retired terms include, but are not limited to: `consolidated account`, `raw account`, `identity-based Fusion account`, `pass`, `round`, `new-unmatched`, `NewUnmatched`, `analyzeIdentityPhase`, `analyzeDeferredPhase`, `hasNewUnmatchedPeerMatches`, `ManagedAccountPassRunner`, `AttributeService`, `ScoringService`, `identity display name`, and `custom:dryrun`.

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

#### Scenario: Code or docs use the retired term "identity display name"
- **WHEN** code or documentation uses the term `identity display name` or a property named `identityDisplayName` to mean the human-friendly identity label
- **THEN** the contributor SHALL replace it with **identity name**

#### Scenario: Code or docs reference the retired custom:dryrun command
- **WHEN** code or documentation references `custom:dryrun` as a separate command
- **THEN** the contributor SHALL replace it with "accountList operation in dry-run mode" or "`dryRun.enabled` on the account-list input"

## ADDED Requirements

### Requirement: Dry-run mode is referenced as a mode, not an operation
The term **dry-run mode** SHALL refer to the accountList operation running with `dryRun.enabled: true` on its input. The retired term `custom:dryrun` SHALL NOT be used to refer to this behavior.

#### Scenario: Describing non-persistent analysis
- **WHEN** describing a non-persistent aggregation analysis that shares the accountList pipeline
- **THEN** the term "dry-run mode" or "the accountList operation in dry-run mode" SHALL be used
- **AND** the term "dryRun operation" or "custom:dryrun" SHALL NOT be used

#### Scenario: Naming the operation in configuration or documentation
- **WHEN** the connector handles an accountList invocation with `{ dryRun: { enabled: true } }`
- **THEN** the system SHALL identify this as an execution in "dry-run mode" in logs, metrics, and report data
