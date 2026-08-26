## Context

Explore found leftover jargon: **row** used for Fusion accounts, managed source accounts, and identity snapshots. Ubiquitous language already forbids **source record** for managed source accounts; **row** is the same tabular metaphor and leaked into the glossary (`Records`, `Orphan accounts`, `$account`) and into Refresh/Map specs (“once per Fusion row”). Dry-run work called `StdAccountListOutput` payloads “account rows” and kept a summary field `rowsSent`. The SailPoint connector SDK does not use “row”. This change is language-only.

## Goals / Non-Goals

**Goals:**

- One rule: **row** is a table line, not an account or snapshot
- Living specs, operator docs, and `src/` comments use the account taxonomy
- Keep `rowsSent` as the dry-run/console summary key
- Automated check so the slang does not return on living surfaces

**Non-Goals:**

- Runtime, schema, or config-key changes
- Renaming `ExactMatchScoreRow` or other types that name real tables
- Rewriting archived OpenSpec changes or historical CHANGELOG entries
- Adding **Row** as a glossary entity
- C4 / structural design (no container change)

## Decisions

### D1: Surfaces in scope

- **Choice**: Living `openspec/specs/`, `docs/` (except historical changelog bullets), and `src/` comments/JSDoc/test titles. Connector-spec **help text** only if it currently says Fusion row.
- **Reason**: That is where agents and operators read canonical language.
- **Considered alternatives**: Glossary-only (leaves specs teaching the slang); full archive rewrite (noise, no operator value).

### D2: Protocol listing vs domain type

- **Choice**: Prose says streamed Fusion accounts or `StdAccountListOutput` objects. JSON key `rowsSent` stays. Report HTML “per-account rows” stays (table).
- **Reason**: `rowsSent` is a wire/summary field already documented; renaming it is a consumer break for no product gain.
- **Considered alternatives**: Rename `rowsSent` → `accountsSent` (breaking, out of scope); keep “account row” as an official protocol term (continues the leak).

### D3: Replacement phrases

- **Choice**: Fusion account / identity-origin Fusion account / managed-origin Fusion account / managed source account / origin snapshot (`$account`). “This Fusion account” on `FusionLayers`. Scenario titles that say “Fusion row” become “Fusion account”.
- **Reason**: Existing taxonomy; no new noun.
- **Considered alternatives**: Invent “Fusion record” (worse; **record** is already retired).

### D4: Guard test

- **Choice**: A Vitest (or equivalent) named after the ubiquitous-language scenarios that scans `docs/`, `openspec/specs/`, and `src/` for forbidden phrases (`Fusion row`, `fusion row`, `identity-origin row`, `managed-origin row`, `managed row` as account, `this row` in FusionLayers-style comments), with an allowlist for: this change folder, `openspec/changes/archive/`, `rowsSent`, `ExactMatchScoreRow`, mapping/score/report table wording, and markdown table “row” in meta-docs about tables.
- **Reason**: Language regressions are grep-shaped; apply’s scenario→test gate needs a named test.
- **Considered alternatives**: Manual grep in tasks only (drifts); knip/eslint custom rule (heavier than a focused test).

### D5: No architecture diagram

- **Choice**: Omit C4.
- **Reason**: Zero container/runtime structure change.

## Risks / Trade-offs

- [Risk] Allowlist too tight flags legitimate “mapping row” / “score row” → Mitigation: phrase-based denylist (`Fusion row`, `identity-origin row`, …) not a blanket `\brow\b`
- [Risk] Living specs still say “the row” after a partial replace → Mitigation: tasks list each capability file; scan test catches leftovers
- [Trade-off] `rowsSent` still contains “row” → Reason: non-breaking protocol; documented as a count of streamed Fusion accounts
- [Trade-off] Historical CHANGELOG still says Fusion row → Reason: changelog is a record of past wording; new entry explains the language fix only

## Migration Plan

N/A — documentation and comment wording. No tenant or config migration. Rollback is reverting the docs/spec/comment commit.

Acceptance: living specs and docs pass the scan test; `npm test` and `npm run lint` (plus `lint:docs-guides` / `lint:markdown` if those files change); `openspec validate --all`.

## Open Questions

None.
