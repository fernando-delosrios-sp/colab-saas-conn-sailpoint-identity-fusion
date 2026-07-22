## Context

The connector's ubiquitous language currently lacks precise terms for the different identity-related names carried by a `FusionAccount`. In practice the code uses:

- `FusionAccount.name` / `state.name` as the ISC Account `name` field.
- `FusionAccount.identityName` for the identity alias/login chain.
- `FusionAccount.identityDisplayName` for a human-friendly fallback chain.

The Fusion display attribute override consumes `identityName`, which for identity-origin accounts yields the login/alias rather than the authoritative display name. Reports consume `identityDisplayName`, which overlaps with `identityName`. This creates inconsistent naming and makes it hard for AI agents and contributors to know which value to use.

The SDK/API naming mismatch adds to the confusion: `IdentityDocument.displayName` (top-level SDK field) corresponds to the authoritative account name / alias in the API, while `IdentityDocument.name` is the login used for `name.exact` search.

## Goals / Non-Goals

**Goals:**
- Introduce a single, unambiguous set of terms for identity-related names.
- Define which term is used for the Fusion display attribute override.
- Define which term is used for user-facing references (reports, review forms, emails, logs).
- Retire the redundant `identity display name` term.
- Update both `openspec/specs/ubiquitous-language/spec.md` and the user-facing glossary mirror.

**Non-Goals:**
- No code changes in this change.
- No changes to the Fusion account schema or wire format.
- No changes to the SDK/API query syntax.

## Decisions

### D1: Authoritative display name is called "identity alias"
- **Choice:** use the term **identity alias** for the value from the SDK's top-level `IdentityDocument.displayName` field.
- **Reason:** this is the authoritative account name returned by the API, and it must be the only source for the Fusion display attribute override.
- **Alternatives considered:**
  - "Identity display name" — rejected because it was ambiguous and redundant with the friendly fallback label.
  - "Identity name" — rejected because the user wanted "identity name" to be the human-friendly fallback label.

### D2: Human-friendly fallback label is called "identity name"
- **Choice:** use the term **identity name** for the fallback chain `IdentityDocument.attributes.displayName` → `IdentityDocument.name` → `FusionAccount.name`.
- **Reason:** reports, review forms, emails, and logs need a readable label that degrades gracefully when the authoritative display attribute is unavailable.
- **Alternatives considered:**
  - Keep "identity display name" — rejected because it created a fourth overlapping term.
  - Merge with "identity alias" — rejected because the authoritative name and the friendly fallback have different use cases and fallback semantics.

### D3: Internal account title is called "Fusion account name"
- **Choice:** keep `FusionAccount.name` / `state.name` as the **Fusion account name**, used only for internal logging, history, and conflict tracking.
- **Reason:** it already exists and is not the output display attribute; renaming it would be churn without benefit.
- **Alternatives considered:**
  - Rename to "source title" — rejected because `Account.name` already exists in the SDK and the existing term is sufficient once documented.

### D4: Identity lookup uses the identity alias value
- **Choice:** identity lookup (e.g., `accountCreate`) uses the **identity alias** value as the lookup term.
- **Reason:** due to the SDK/API field-name mismatch, the authoritative name value is stored in the SDK field `displayName` but corresponds to the API alias; the lookup query field remains `name.exact` or a tenant-mapped equivalent.
- **Alternatives considered:**
  - Lookup by `IdentityDocument.name` — rejected because that is the login/alias in the SDK, not the authoritative display name.

### D5: Velocity context exposes `identity.alias`, `identity.name`, and `identity.id`
- **Choice:** future code will expose these three properties on the Velocity `$identity` object.
- **Reason:** templates need access to both the authoritative display name and the human-friendly fallback.
- **Alternatives considered:**
  - Only expose `name` — rejected because it would force templates to choose between two different semantics.

## Risks / Trade-offs

- [Risk] The term "identity alias" conflicts with the common ISC meaning of "alias" as login. → Mitigation: the spec explicitly states that identity alias is the SDK top-level `displayName` and is **not** `IdentityDocument.name`.
- [Risk] Existing code variables and property names (`identityName`, `identityDisplayName`) do not match the new terms. → Mitigation: this change only updates the spec/glossary; a follow-up change will rename the code fields.
- [Trade-off] We keep `Fusion account name` as a separate internal concept rather than merging it into `identity name`. → Accepted because `state.name` is tied to the persisted ISC `Account.name` and has different consumers (logs/history/conflict tracking) than user-facing labels.

## Migration Plan

N/A — this change updates documentation/spec artifacts only. No deployment or runtime migration is required.

## Open Questions

None. Terms were agreed in the brainstorming discussion.
