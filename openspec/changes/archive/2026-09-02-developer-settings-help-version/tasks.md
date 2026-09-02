## 1. Help-lib template and lint (tests first)

- [x] 1.1 Add failing tests in `scripts/__tests__/checkConnectorSpecHelp.test.cjs`: Developer Settings help missing `package.json` version is a violation named Developer Settings; matching current version is not; other sections are not required to mention version; `slimSpec` interpolates the current version into Developer Settings `sectionHelpMessage` and leaves `sectionTitle` as `Developer Settings`.
- [x] 1.2 Interpolate `package.json` `version` (raw semver, no `v` prefix) into `SECTION_HELP['Developer Settings']` in `scripts/connector-spec-help-lib.cjs`; replace the “section header shows the version” sentence with a short sentence that includes `<strong>{version}</strong>`; keep Operation guides `seeAlso`; stay within `SECTION_HELP_MAX` / `SECTION_HELP_MAX_SENTENCES`.
- [x] 1.3 In `collectViolations`, fail Developer Settings when `sectionHelpMessage` does not contain the current `package.json` version; do not apply that check to other sections.
- [x] 1.4 Run `node scripts/slim-connector-spec-help.cjs` so committed `connector-spec.json` Developer Settings `sectionHelpMessage` contains the current version and `sectionTitle` stays `Developer Settings`.

## 2. Ubiquitous language

- [x] 2.1 Add **Installed connector version** to `openspec/specs/ubiquitous-language/spec.md` Configuration vocabulary (and matching ADDED requirement) so archive merge is a no-op conflict.

## 3. Verification

- [x] 3.1 Confirm canonical test command: `npm test` (do not pipe the suite to `tail`; redirect to a file if output is long).
- [x] 3.2 Run `node scripts/__tests__/checkConnectorSpecHelp.test.cjs` via Vitest/global suite as this repo already does for that file, plus `node scripts/check-connector-spec-help.cjs`.
- [x] 3.3 All delta spec scenarios covered by named automated tests (help/version/slim/lint). Guide and glossary copy are covered by the Documentation tasks.

## 4. Documentation

- [x] 4.1 Update `docs/use-guides/operation/reset-fusion-state.md`: installed connector version is in Developer Settings section help, not the section header.
- [x] 4.2 Update `scripts/generate-config-docs.cjs` `SECTION_INTRO_OVERRIDES['Developer Settings']` to drop the header-version claim and omit `package.json` version.
- [x] 4.3 Update `docs/glossary.md` (and `docs/concepts/glossary.md` if it still mirrors terms) with **Installed connector version**.
- [x] 4.4 No JSDoc/API contract change beyond comments in help-lib if needed; no other `helpKey` edits.

## 5. Changelog

- [x] 5.1 Create or update changelog entry for this change via changelog-generator during apply.
- [x] 5.2 Confirm entry covers Developer Settings section help showing the installed connector version (and lint against drift) — not a version in the section title and not versioned MkDocs intros.
