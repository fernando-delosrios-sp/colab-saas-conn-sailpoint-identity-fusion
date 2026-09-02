## Why

Operators opening Developer Settings in ISC cannot see which connector package is installed. The `sectionHelpMessage` only *mentions* that the section header shows the version, while `sectionTitle` is still plain `Developer Settings` and the help string has no semver. Earlier docs work avoided a hardcoded number so it would not go stale — and the number disappeared. Putting `package.json` `version` in that help string, with lint against drift, lets operators confirm the deployed build after every upgrade.

## What Changes

**Developer Settings section help includes the installed connector version**
- From: Help describes a version in the section header; no digits; `sectionTitle` is `Developer Settings`
- To: `sectionHelpMessage` contains the exact `package.json` `version` string; `sectionTitle` stays `Developer Settings`
- Reason: Operators need the number in the help they actually read; the title is a stable lookup key
- Impact: Non-breaking ISC config; help text updates on each package version bump

**Help lint rejects version drift**
- From: `check-connector-spec-help` checks length, links, sentences, and docs host only
- To: Developer Settings `sectionHelpMessage` MUST contain the current `package.json` version or lint fails
- Reason: A hardcoded number without a check would go stale on the next bump
- Impact: `npm run lint` fails if version is bumped without rewriting that help string

**Canonical template interpolates version**
- From: `SECTION_HELP['Developer Settings']` is a static string that talks about version without a number
- To: Slim/sync writes help from a template that interpolates `package.json` version
- Reason: One source of copy; committed `connector-spec.json` stays what ISC ships
- Impact: Maintainers run existing slim/help rewrite after a bump (or lint tells them to)

**Docs surfaces**
- From: Use guide claims the *section header* displays the version; generated Configuration intro repeats the header story
- To: Use guide points at section help; MkDocs `SECTION_INTRO_OVERRIDES` stay version-free
- Reason: Docs must not churn on every release; ISC help is the version surface
- Impact: Copy-only on `reset-fusion-state.md` and Developer Settings override text

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `documentation-site`: Developer Settings `sectionHelpMessage` MUST include the installed connector version; help lint MUST fail on drift; generated Configuration intros MUST NOT embed the semver
- `ubiquitous-language`: Canonical term **Installed connector version**

## Impact

- **Config UI:** `connector-spec.json` Developer Settings `sectionHelpMessage`
- **Scripts:** `scripts/connector-spec-help-lib.cjs`, `scripts/check-connector-spec-help.cjs`, `scripts/__tests__/checkConnectorSpecHelp.test.cjs`; `scripts/generate-config-docs.cjs` override text (version-free)
- **Docs:** `docs/use-guides/operation/reset-fusion-state.md`; glossary mirror of UL; `CHANGELOG.md`
- **CI:** Existing `npm run lint` help check gains the version assertion
- **Out of scope:** `sectionTitle` version suffix; other sections; field `helpKey`s; runtime version API
