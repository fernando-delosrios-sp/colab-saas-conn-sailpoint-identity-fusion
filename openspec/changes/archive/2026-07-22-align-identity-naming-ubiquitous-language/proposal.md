## Why

The `FusionAccount` model currently mixes three naming concepts: the Fusion account source title (`state.name`), the identity alias/login chain (`identityName`), and a human-friendly display label (`identityDisplayName`). The Fusion display attribute override uses `identityName`, which for identity-origin accounts produces the login rather than the authoritative display name. Reports and review forms then use a separate `identityDisplayName` concept that is redundant. We need a single, unambiguous vocabulary so AI agents and contributors use the same terms for the authoritative display name, the human-friendly reference label, and the internal account title.

## What Changes

**Identity naming vocabulary**
- From: `identityName` = login/alias chain, `identityDisplayName` = human-friendly fallback chain.
- To: `identityAlias` = authoritative account name from SDK top-level `IdentityDocument.displayName`; `identityName` = human-friendly fallback chain (`attributes.displayName` → `IdentityDocument.name` → `FusionAccount.name`); `Fusion account name` = internal source title.
- Reason: the SDK reports the authoritative name as `displayName` while `IdentityDocument.name` is the login; the old terms conflated these roles.
- Impact: non-breaking for runtime behavior until the follow-up code change; spec/glossary changes only.

**Display attribute override rule**
- From: override uses `identityName` (login/alias).
- To: override uses `identityAlias` (authoritative account name).
- Reason: the platform display attribute should show the authoritative identity name, not the login.

**User-facing references**
- From: use `identityDisplayName`.
- To: use `identityName`.
- Reason: one human-friendly label is enough.

**Retired term**
- `identity display name` is retired and replaced by `identity name`.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `ubiquitous-language`: adds definitions for `identityAlias`, `identityName`, and `Fusion account name`; updates display-attribute and user-facing-reference scenarios; retires `identity display name`.

## Impact

- `openspec/specs/ubiquitous-language/spec.md` — new terms and usage scenarios.
- `docs/concepts/glossary.md` — mirror of the new terms.
- Future code changes (out of scope here): `IdentityInfo` field rename, `applyDisplayAttributeOverride`, `buildVelocityContext`, `FusionMatch`/`FusionDecision` labels, `accountCreate` lookup.
