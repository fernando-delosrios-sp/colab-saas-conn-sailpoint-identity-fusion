## Scope

Retire **row** as a synonym for Fusion accounts, managed source accounts, and identity snapshots in living specs, operator docs, and `src/` comments; keep **row** for real tables (config, scores, HTML reports) and keep the summary field `rowsSent`. Out: archived OpenSpec changes, historical CHANGELOG wording, connector-spec JSON keys, renaming `ExactMatchScoreRow` and similar table types, runtime behavior.

## Language

**Fusion account** (canonical — reuse):
The consolidated ISC account produced by Map and Define.
_Avoid_: Fusion row, Fusion account row, persisted fusion row, this row (when the referent is a Fusion account).

**Managed source account** (canonical — reuse):
An ISC account from a configured Fusion source.
_Avoid_: source record (already retired), managed row, directory row, AD row, non-matched row (when the referent is the account).

**Identity-origin Fusion account** (canonical — reuse):
A Fusion account seeded from an existing ISC identity.
_Avoid_: identity-origin row, Identities row (when the referent is the account or the Identities snapshot).

**Origin snapshot** (canonical — reuse):
The managed account whose key equals `originAccount`, or the Identities identity bag for an identity-origin Fusion account. Velocity `$account`.
_Avoid_: origin row.

**Row** (`conflicts-with-canonical` as account synonym; `promote` as allowed table sense):
A line in a real table — attribute mapping/definition config, match score breakdown, HTML report or review form, phase-timing table. Not an entity.
_Avoid_: using row to mean Fusion account, managed source account, identity, or snapshot.

**StdAccountListOutput object** (`draft` → `promote` as protocol phrasing):
One Fusion account payload streamed via `res.send` during account-list (including dry-run). The console summary key `rowsSent` stays; prose says streamed Fusion accounts / `StdAccountListOutput` objects.
_Avoid_: account row as a domain name for the Fusion account itself.

## Decisions

Context: Explore found leftover tabular slang. The connector SDK does not call accounts rows. Ubiquitous language already bans **source record** but the glossary still says “non-matched rows” and “identity-origin row”. Dry-run work locked `StdAccountListOutput` rows / `rowsSent`. FusionLayers comments say “this row”.

Q1: How far does the rename go?
Chosen: **Living language surfaces** — ubiquitous-language spec, other living capability specs that use Fusion-row slang, `docs/`, and `src/` comments/JSDoc/test titles that call accounts rows. Not archived changes. Not identifier rename of `rowsSent` or score-row types.

Q2: Is `rowsSent` / “account rows” protocol slang kept?
Chosen: **Keep the JSON key `rowsSent`.** Rephrase surrounding prose to streamed Fusion accounts or `StdAccountListOutput` objects. Report HTML “per-account rows” stays (table).

Q3: New domain term for “row”?
Chosen: **None.** Use existing account taxonomy. Do not add Row as a glossary entity.

Q4: Automated check?
Chosen: **Yes** — a named test (or grep gate in tests) that living `docs/`, `openspec/specs/`, and `src/` do not use Fusion-row / identity-origin-row / managed-origin-row account slang, with an allowlist for table contexts and `rowsSent`.

## Open questions

None. Assumed: connector-spec help text is in scope if it says Fusion row; archive folders and past changelog bullets are out.

## Scenarios discussed

- Glossary **Records** / **Orphan accounts** / **$account** definitions rewritten without “row”
- Operator mermaid `NonMatched Fusion row` → non-matched Fusion account
- Velocity docs: `$account` is the origin snapshot, not “origin row”
- fusion-service “once per Fusion row” → once per Fusion account
- mapping-service / definition-service “managed-origin rows” → managed-origin Fusion accounts
- Dry-run `res.send` requirement: `StdAccountListOutput` objects; `rowsSent` unchanged
- HTML report: “not as per-account rows” kept (table)
- `ExactMatchScoreRow` / synthetic score rows kept
- Comment in `fusionLayers.ts`: “this Fusion account”, not “this row”
