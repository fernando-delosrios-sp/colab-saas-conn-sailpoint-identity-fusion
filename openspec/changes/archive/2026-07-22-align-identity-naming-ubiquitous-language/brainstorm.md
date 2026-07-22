<!--
Raw capture of the identity naming alignment discussion.

本檔原樣捕捉 brainstorming 對話的產出，不強制結構。
Skill 的自然產出通常是 decision log 格式（背景 → 決議鏈 Q1-Qn → 設計取捨），
但依對話內容可能有不同組織方式。

design.md 從本檔萃取並重新整理為結構化設計文件。

不要將本檔的內容複製到 design.md — design.md 是獨立的重組產物，
兩者互補但不重疊。
-->

# Identity naming alignment brainstorm

## Background

The `FusionAccount` model currently carries three overlapping name concepts:

- `FusionAccount.name` / `state.name` — the ISC Account `name` field (source title).
- `FusionAccount.identityName` — `IdentityInfo.name`, which today is the identity alias/login chain (`IdentityDocument.name`, `account.identity?.name`, `decision.identityName`).
- `FusionAccount.identityDisplayName` — `IdentityInfo.displayName`, a human-friendly fallback chain (`attributes.displayName`, `identity.name`, etc.).

The Fusion display attribute (`fusionDisplayAttribute`, usually `name`) is set by `applyDisplayAttributeOverride`, which currently uses `identityName`. For identity-origin accounts this means the display attribute becomes the identity *alias/login*, not the authoritative display name. For correlated managed-account origins, the identity document is often not loaded, so the display attribute falls back to the managed account name.

The SDK/API field naming is also inconsistent:

- `IdentityDocument.displayName` (top-level SDK field) is conceptually the identity alias / authoritative account name.
- `IdentityDocument.name` is the login/alias and is used for `name.exact` search.

## Decision chain

**Q1: What should the Fusion display attribute override use?**
- Decision: the authoritative identity alias, i.e. the SDK's top-level `IdentityDocument.displayName`.

**Q2: What should reports, review forms, emails, and logs use?**
- Decision: a human-friendly fallback label that prefers `IdentityDocument.attributes.displayName`, then `IdentityDocument.name`, then `FusionAccount.name`.

**Q3: What should happen to the current `identityDisplayName` concept?**
- Decision: it is redundant and replaced by the human-friendly label above.

**Q4: Is `FusionAccount.name` (state.name) still needed?**
- Decision: yes, but it is an internal source title. It mirrors `Account.name` / `Identity.name` and is used for logging, history entries, and conflict tracking. It is not the output display attribute.

## Agreed terms

| Term | Definition |
|---|---|
| **Identity alias** | Authoritative account name from the SDK's top-level `IdentityDocument.displayName`. Used for Fusion display attribute overrides and identity lookup. Not `IdentityDocument.name`. |
| **Identity name** | Human-friendly reference label: `IdentityDocument.attributes.displayName` → `IdentityDocument.name` → `FusionAccount.name`. Used in reports, review forms, emails, logs. Replaces `identity display name`. |
| **Fusion account name** | `FusionAccount.name` / `state.name`. Mirrors `Account.name` / `Identity.name`. Internal use only (logging, history, conflict tracking). |

## Design trade-offs

- **Lookup field mismatch**: because the SDK reports the authoritative name as `displayName` while the search API uses `name.exact`, identity lookup must use the *identity alias value* as the lookup term, typically via `name.exact` or a tenant-mapped equivalent.
- **Velocity context**: expose `identity.alias`, `identity.name`, and `identity.id` so templates can choose the authoritative vs. friendly label.
- **Wire/serialization**: fields named `identityName` in `FusionMatch`, `MatchingCandidate`, and `FusionDecision` currently hold the human-friendly label. Under the new terms they are correctly named `identityName`, but their source value changes from the old `identityDisplayName` chain to the new chain.
- **`IdentityInfo` rename**: to avoid confusion, the internal `IdentityInfo` fields should be renamed from `name`/`displayName` to `identityAlias`/`identityName`.

## Out of scope for this change

- No code implementation in this change; only the ubiquitous-language spec and glossary are updated.
- A follow-up change will apply these terms to the code (`IdentityInfo`, `applyDisplayAttributeOverride`, `buildVelocityContext`, `getIdentityDisplayLabel`, `accountCreate`, etc.).

## Acceptance criteria

- `openspec/specs/ubiquitous-language/spec.md` contains the new terms and usage scenarios.
- `docs/concepts/glossary.md` mirrors the new terms.
- `identity display name` is retired and points to `identity name`.
- Markdown lint passes.
