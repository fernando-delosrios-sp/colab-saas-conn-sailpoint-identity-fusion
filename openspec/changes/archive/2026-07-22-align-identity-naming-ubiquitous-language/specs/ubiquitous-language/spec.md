> **Archive note (2026-08-09):** Terminology in this delta reflects the change at archive time. Current canonical terms: **`MatchOutcomeDispatcher`** (replaces `ManagedAccountPassRunner` / `ManagedAccountMatchingRunner`); **`configureScoring({ captureBreakdown })`** (replaces `setCaptureBreakdown`). See `openspec/changes/archive/README.md` and living specs after `reconcile-matching-delegation-spec`.

## ADDED Requirements

### Requirement: Identity reference terms are defined precisely

The connector SHALL distinguish between the authoritative identity alias, the human-friendly identity name, and the internal Fusion account name.

#### Scenario: Identifying the authoritative identity alias

- **WHEN** code needs the value used for the Fusion display attribute override or for identity lookup
- **THEN** it SHALL use the **identity alias**, defined as the top-level `displayName` field of the `IdentityDocument` as reported by the SailPoint SDK
- **AND** it SHALL NOT use `IdentityDocument.name` for that purpose

#### Scenario: Identifying the human-friendly identity name

- **WHEN** code needs a readable label for reports, review form candidates, emails, logs, or other user-facing references
- **THEN** it SHALL use the **identity name**, computed as `IdentityDocument.attributes.displayName`, falling back to `IdentityDocument.name`, then to `FusionAccount.name`

#### Scenario: Identifying the Fusion account name

- **WHEN** code refers to the `name` property of a `FusionAccount` (`state.name`)
- **THEN** it SHALL use the term **Fusion account name**
- **AND** it SHALL use that value only for internal logging, history entries, and conflict tracking unless the display attribute override is explicitly configured to consume it

### Requirement: Fusion display attribute override uses the identity alias

When a Fusion account is linked to an identity, the display attribute (`fusionDisplayAttribute`) SHALL be set from the identity alias.

#### Scenario: Identity-linked Fusion account output

- **WHEN** `getISCAccount` serializes a Fusion account that has an identity linkage
- **THEN** `attributes[fusionDisplayAttribute]` SHALL equal the identity alias
- **AND** it SHALL NOT equal the managed source account name or a stale persisted value

### Requirement: User-facing identity references use the identity name

Reports, review form candidates, emails, logs, and other user-facing references to a correlated identity SHALL use the identity name.

#### Scenario: Match candidate label in a review form

- **WHEN** the connector renders an identity candidate for a Fusion review form
- **THEN** the candidate label SHALL be the identity name
- **AND** it SHALL fall back through `IdentityDocument.name` and `FusionAccount.name` only when `IdentityDocument.attributes.displayName` is unavailable

### Requirement: Velocity identity context exposes alias, name, and id

The Velocity `$identity` object SHALL expose `alias`, `name`, and `id` properties.

#### Scenario: Velocity template references identity metadata

- **WHEN** a normal attribute definition template uses `$identity.alias`, `$identity.name`, or `$identity.id`
- **THEN** `$identity.alias` SHALL resolve to the identity alias
- **AND** `$identity.name` SHALL resolve to the identity name
- **AND** `$identity.id` SHALL resolve to the identity ID

---

## MODIFIED Requirements

### Requirement: Retired terms are not reintroduced

Retired terms and symbols SHALL NOT be reintroduced into code, configuration, or documentation. The retired term list SHALL include `AttributeService`, `ScoringService`, and `identity display name` in addition to the previously retired terms. Retired terms include, but are not limited to: `consolidated account`, `raw account`, `identity-based Fusion account`, `pass`, `round`, `new-unmatched`, `NewUnmatched`, `analyzeIdentityPhase`, `analyzeDeferredPhase`, `hasNewUnmatchedPeerMatches`, `ManagedAccountPassRunner`, `AttributeService`, `ScoringService`, and `identity display name`.

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

---

## REMOVED Requirements

None.

---

## RENAMED Requirements

None.
