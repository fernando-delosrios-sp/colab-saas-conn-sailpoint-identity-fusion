## 1. Language scan test (red first)

- [x] 1.1 Add a Vitest file (e.g. `src/__tests__/retireAccountRowJargon.test.ts`) whose `it` names match ubiquitous-language scenarios: Referring to a Fusion account; Referring to a managed source account; Referring to identity-origin or origin snapshot; Table rows remain allowed; rowsSent counts streamed Fusion accounts; Comments do not call accounts rows; Guide documentation; Operation documentation.
- [x] 1.2 Scan `docs/` (except historical bullets in `CHANGELOG.md` / `docs/CHANGELOG.md`), `openspec/specs/`, and `src/` for denylist phrases: `Fusion row`, `fusion row`, `Fusion rows`, `identity-origin row`, `managed-origin row`, `Identities row` (entity), `origin row`. Do not use a blanket `\brow\b`. Allow `rowsSent`, `ExactMatchScoreRow`, mapping/score/report table wording, and this change’s `openspec/changes/retire-row-as-account-synonym/` folder.
- [x] 1.3 Run the new file — expect RED until living specs/docs/comments are rewritten.

**Verify:** `npx vitest run src/__tests__/retireAccountRowJargon.test.ts` (adjust path if the file lives elsewhere).

## 2. Living specs (D1, D3)

- [x] 2.1 Apply the ubiquitous-language delta to `openspec/specs/ubiquitous-language/spec.md` (retired-terms table, Records / Orphan accounts / `$account` glossary cells, new **Row is not an account synonym** requirement, account-taxonomy / documentation / code-comments scenarios).
- [x] 2.2 Apply fusion-service, fusion-run, mapping-service, definition-service, match-outcome-dispatch, and account-list-operation deltas in `openspec/specs/` (Fusion account not Fusion row; `StdAccountListOutput` objects; keep `rowsSent`; keep HTML “per-account rows”).
- [x] 2.3 Rename existing test titles that say “the row” / “Fusion row” to Fusion account (e.g. `fusionAccount.test.ts` materialize scenarios) without changing assertions.

**Verify:** language scan still RED only on remaining `src/` comments and `docs/`; living `openspec/specs/` clean.

## 3. Source comments and JSDoc (D1, D3)

- [x] 3.1 Replace Fusion-row / this-row comments in `src/model/fusionLayers.ts`, `src/model/managedAccountLink.ts`, `src/services/fusionService/fusionService.ts`, `src/operations/accountList.ts`, and any other `src/` hits from the scan.
- [x] 3.2 Grep connector-spec help text; rewrite only if it names Fusion row as an account. Do not rename `rowsSent` or `ExactMatchScoreRow` (D2).
- [x] 3.3 Re-run 1.x — GREEN for `src/` and `openspec/specs/`.

**Verify:** `npx vitest run` on the language-scan file; grep `Fusion row` in `src/` and `openspec/specs/` is empty.

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` (global Vitest; do not pipe to `tail`).
- [x] 4.2 All delta spec scenarios covered by named automated tests (language scan for ubiquitous-language; existing tests for fusion-service / fusion-run / mapping / definition / match-outcome-dispatch / account-list behavior — titles updated where they said “row”).
- [x] 4.3 `npm run lint` exit 0. If use-guides changed: `npm run lint:docs-guides` and `npm run lint:markdown`.
- [x] 4.4 `openspec validate --all --json` from the planning home.

## 5. Documentation

- [x] 5.1 Sync `docs/glossary.md` and `docs/concepts/glossary.md` with retired terms and Records / Orphan accounts / `$account` / `StdAccountListOutput` object entries.
- [x] 5.2 Rewrite operator guides that call accounts rows: `docs/use-guides/configuration/source-types.md` (mermaid `NonMatched Fusion row`), `configuring-sources-and-scope.md`, `mapping-attributes.md`, `defining-attributes.md`, `managing-correlation.md`, `match-tuning-cookbooks.md`, `docs/index.md`.
- [x] 5.3 Rewrite `docs/reference/velocity-context.md` (`$account` is origin snapshot), `docs/operations/account-list.md`, `docs/operations/dry-run.md`, `docs/use-guides/operation/analyze-with-dry-run.md` — streamed Fusion accounts; keep `rowsSent` and HTML per-account rows.
- [x] 5.4 Re-run language scan — GREEN for `docs/` (changelog historical bullets still allowed).

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via **changelog-generator** during apply (PATCH; docs/language). Do not add Unreleased. Do not rewrite historical CHANGELOG bullets that say Fusion row.
- [x] 6.2 Confirm entry covers user-visible Capabilities (ubiquitous language; operator docs no longer call accounts rows; `rowsSent` unchanged).
