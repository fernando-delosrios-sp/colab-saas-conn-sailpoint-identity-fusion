# Align identity naming in ubiquitous language — Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the ubiquitous-language spec and user-facing glossary with agreed identity naming terms.

**Architecture:** This is a documentation/spec change only. The canonical spec at `openspec/specs/ubiquitous-language/spec.md` is updated first, then the glossary mirror at `docs/concepts/glossary.md` is aligned. Markdown lint is run after each edit.

**Tech Stack:** Markdown, `markdownlint` (via `npm run lint:markdown`).

## Global Constraints

- `openspec/specs/ubiquitous-language/spec.md` is the source of truth for domain vocabulary.
- `docs/concepts/glossary.md` MUST be kept aligned with the spec.
- New domain terms SHALL be added to the spec before they are used elsewhere.
- Source code SHALL use the canonical terms from this spec for variable names, function names, type names, class names, file names, and comments.

---

## Task 1: Update `openspec/specs/ubiquitous-language/spec.md`

**Files:**
- Modify: `openspec/specs/ubiquitous-language/spec.md:271-282`
- Test: `npm run lint:markdown`

**Interfaces:**
- Produces: new "Identity reference and Fusion account naming" section and updated "Retired terms" requirement.

- [ ] **Step 1:** Insert the new section after the "Account taxonomy" section

```markdown
### Identity reference and Fusion account naming

The connector refers to an ISC identity and to the Fusion account itself through three distinct names. They are separated so the authoritative value used for the Fusion display attribute is not confused with the user-friendly report label.

| Term | Definition |
|------|------------|
| **Identity alias** | The authoritative account name of the correlated ISC identity, taken from the top-level `displayName` field of the `IdentityDocument` as reported by the SailPoint SDK. This is the only value used for the Fusion account display attribute override (`fusionDisplayAttribute`). |
| **Identity name** | A human-friendly reference label for the correlated identity. Computed as `IdentityDocument.attributes.displayName`, falling back to `IdentityDocument.name`, then to `FusionAccount.name`. Used in reports, review form candidates, emails, logs, and other user-facing references where a readable label is required. Replaces the former **identity display name** concept. |
| **Fusion account name** | The `name` property of a `FusionAccount` (`state.name`). It mirrors the ISC `Account.name` / `Identity.name` field of the persisted account and is used for internal logging, history entries, and conflict tracking. It is not the output display attribute unless the display attribute override is configured to consume it. |

#### Scenario: Populating the Fusion display attribute

- **WHEN** the Fusion account is linked to an identity
- **THEN** the display attribute (`fusionDisplayAttribute`, usually `name`) SHALL be set from the **identity alias**
- **AND** it SHALL NOT be left as the managed source account name or a persisted stale value

#### Scenario: Referring to an identity in user-facing output

- **WHEN** a report, review form, email, or log message needs a human-readable identity label
- **THEN** it SHALL use the **identity name**
- **AND** fall back through `IdentityDocument.name` and `FusionAccount.name` only when `IdentityDocument.attributes.displayName` is unavailable

#### Scenario: Looking up an identity by name

- **WHEN** the connector resolves an identity from a provisioning or account-create payload
- **THEN** it SHALL use the **identity alias** value as the lookup term
- **AND** it SHALL NOT use the identity name unless the search query is explicitly changed to match by display name

#### Scenario: Velocity identity context

- **WHEN** a normal attribute definition template references `$identity.alias`, `$identity.name`, or `$identity.id`
- **THEN** `$identity.alias` SHALL resolve to the identity alias
- **AND** `$identity.name` SHALL resolve to the identity name
- **AND** `$identity.id` SHALL resolve to the identity ID
```

- [ ] **Step 2:** Update the retired terms requirement

Find:

```markdown
Retired terms include, but are not limited to: `consolidated account`, `raw account`, `identity-based Fusion account`, `pass`, `round`, `new-unmatched`, `NewUnmatched`, `analyzeIdentityPhase`, `analyzeDeferredPhase`, `hasNewUnmatchedPeerMatches`, `ManagedAccountPassRunner`, `AttributeService`, and `ScoringService`.
```

Replace with:

```markdown
Retired terms include, but are not limited to: `consolidated account`, `raw account`, `identity-based Fusion account`, `pass`, `round`, `new-unmatched`, `NewUnmatched`, `analyzeIdentityPhase`, `analyzeDeferredPhase`, `hasNewUnmatchedPeerMatches`, `ManagedAccountPassRunner`, `AttributeService`, `ScoringService`, and `identity display name`.
```

- [ ] **Step 3:** Run markdown lint

Run: `npm run lint:markdown`
Expected: no errors

- [ ] **Step 4:** Commit

```bash
git add openspec/specs/ubiquitous-language/spec.md
git commit -m "docs(ubiquitous-language): define identity alias, identity name, and Fusion account name"
```

---

## Task 2: Update `docs/concepts/glossary.md`

**Files:**
- Modify: `docs/concepts/glossary.md:18-19`
- Test: `npm run lint:markdown`

**Interfaces:**
- Consumes: the new section from `openspec/specs/ubiquitous-language/spec.md`.
- Produces: aligned glossary section.

- [ ] **Step 1:** Insert the mirror section after "Account taxonomy"

```markdown
## Identity reference and Fusion account naming

| Term | Definition |
|------|------------|
| **Identity alias** | The authoritative account name of the correlated ISC identity, taken from the top-level `displayName` field of the `IdentityDocument` as reported by the SailPoint SDK. This is the only value used for the Fusion account display attribute override (`fusionDisplayAttribute`). |
| **Identity name** | A human-friendly reference label for the correlated identity. Computed as `IdentityDocument.attributes.displayName`, falling back to `IdentityDocument.name`, then to `FusionAccount.name`. Used in reports, review form candidates, emails, logs, and other user-facing references where a readable label is required. Replaces the former **identity display name** concept. |
| **Fusion account name** | The `name` property of a `FusionAccount` (`state.name`). It mirrors the ISC `Account.name` / `Identity.name` field of the persisted account and is used for internal logging, history entries, and conflict tracking. It is not the output display attribute unless the display attribute override is configured to consume it. |
```

- [ ] **Step 2:** Run markdown lint

Run: `npm run lint:markdown`
Expected: no errors

- [ ] **Step 3:** Commit

```bash
git add docs/concepts/glossary.md
git commit -m "docs(glossary): mirror identity naming terms from ubiquitous language spec"
```

---

## Task 3: Final verification

**Files:**
- Read-only: `openspec/specs/ubiquitous-language/spec.md`, `docs/concepts/glossary.md`

- [ ] **Step 1:** Confirm both files contain the same three definitions.
- [ ] **Step 2:** Confirm `identity display name` is retired and replaced by `identity name` in both files.
- [ ] **Step 3:** Run full lint

Run: `npm run lint`
Expected: no errors

- [ ] **Step 4:** Mark the change ready for verification

```bash
git add openspec/changes/align-identity-naming-ubiquitous-language/
git commit -m "chore(openspec): plan and spec for identity naming alignment"
```
