## Context

ISC source configuration shows `sectionHelpMessage` HTML when an operator expands a section. Developer Settings is the troubleshooting surface; operators use it to confirm which connector package is deployed. Today the help *talks about* a version in the section header, but `sectionTitle` is `Developer Settings` and no semver appears. Canonical copy lives in `scripts/connector-spec-help-lib.cjs` (`SECTION_HELP`) and is written into committed `connector-spec.json` by `scripts/slim-connector-spec-help.cjs`. `scripts/check-connector-spec-help.cjs` already runs in `npm run lint`.

## Goals / Non-Goals

**Goals:**

- Operators always see the **installed connector version** (`package.json` `version`) in Developer Settings `sectionHelpMessage`.
- Drift between that string and `package.json` fails lint.
- Slim/rewrite of section help interpolates the current version so a bump plus slim stays consistent.
- Use-guide copy matches the help surface (not the header).
- MkDocs Configuration intros stay version-free.

**Non-Goals:**

- Suffixing `sectionTitle` with a version.
- Embedding the semver in generated `docs/configuration/*.md` intros.
- Changing per-field `helpKey` text.
- A runtime API or entitlement that reports version.
- Relaxing `SECTION_HELP_MAX` / sentence limits.

## Decisions

### D1: Version lives in `sectionHelpMessage`, not `sectionTitle`

- **Choice**: Keep `sectionTitle` as `Developer Settings`. Put the semver in the HTML overview.
- **Reason**: `SECTION_HELP` and doc generators key off the title. The user asked for `sectionHelpMessage`.
- **Considered alternatives**: `Developer Settings (2.2.0)` in the title — breaks the lookup key and earlier docs that treat the title as stable.

### D2: Source of truth is `package.json` `version`

- **Choice**: Read the raw semver (e.g. `2.2.0`), no `v` prefix.
- **Reason**: Same identifier as the published npm/connector package.
- **Considered alternatives**: Git SHA or CI build number — not what operators install; ISC platform version — wrong product.

### D3: Template interpolates; committed spec is what ships

- **Choice**: `SECTION_HELP['Developer Settings'].sectionHelpMessage` is produced with the current `package.json` version. `slimSpec` writes it into `connector-spec.json`. Lint requires the committed string to contain that exact version.
- **Reason**: ISC ships the JSON file. Help-lib stays the canonical copy. Existing slim + check pipeline already owns this string.
- **Considered alternatives**: `{{VERSION}}` placeholder left in git — ISC would show the placeholder. Runtime injection at connector load — connector-spec is static JSON, not evaluated. prebuild-only rewrite without lint — easy to commit a stale file.

### D4: Lint assertion is section-specific

- **Choice**: `collectViolations` flags Developer Settings when `sectionHelpMessage` does not include `package.json` `version` as a substring. Other sections unchanged.
- **Reason**: Only this section is the operator version surface.
- **Considered alternatives**: Require every section to mention version — noise. Regex for any `x.y.z` — could pass on a leftover old version if both appeared; exact current version is stricter.

### D5: Docs do not embed the semver

- **Choice**: `SECTION_INTRO_OVERRIDES['Developer Settings']` drops the “header shows version” sentence and does not add `package.json` version. `reset-fusion-state.md` tells operators to read the version from section help.
- **Reason**: Avoid MkDocs churn on every bump. ISC help is the live surface.
- **Considered alternatives**: Mirror version in generated docs — every release-prep would rewrite Configuration pages for a one-line number operators already see in ISC.

### D6: Copy still fits existing help limits

- **Choice**: Replace the false “section header shows the version” paragraph with a short sentence that includes `<strong>{version}</strong>`. Keep `seeAlso` Operation guides link.
- **Reason**: Limits stay 1000 plain-text characters / 10 sentences in help-lib (spec prose of 320 / two sentences is already looser in code; this change does not reopen that).
- **Considered alternatives**: Raising limits to fit a longer version story — unnecessary.

## Risks / Trade-offs

- **[Risk] Version bump without slim leaves stale help** → Mitigation: lint fails in `npm run lint` until the string contains the new version.
- **[Risk] False positive if version substring appears accidentally** → Mitigation: current versions are distinctive semver; assertion is “must contain,” not “must equal the whole message.”
- **[Trade-off] Committed JSON still duplicates the interpolated string** → Reason: ISC consumes `connector-spec.json`; same pattern as today’s slimmed help.
- **[Trade-off] MkDocs will not show the number** → Reason: operators confirming a deploy are in ISC, not the doc site.

## Migration Plan

N/A — copy and lint only. No tenant migration. After apply: run slim (or equivalent write), confirm lint, update use-guide sentence. Rollback is revert of those files.

## Open Questions

None.
