## 1. Audit and generator prep

- [x] 1.1 Add audit mode to list all `helpKey` / `sectionHelpMessage` violations (length, missing link, bullet lists) — baseline before edits
- [x] 1.2 Expand `SECTION_INTRO_OVERRIDES` in `scripts/generate-config-docs.cjs` for sections that still rely on verbose `sectionHelpMessage` (Sources, Matching Settings, External Settings, etc.)
- [x] 1.3 Run `npm run docs:prepare` and confirm generated Configuration pages retain adequate section intros after overrides

## 2. Slim connector-spec inline help

- [x] 2.1 Extend `scripts/slim-connector-spec-helpkeys.cjs` (or rename to `slim-connector-spec-help.cjs`) to rewrite `sectionHelpMessage` using section-to-guide link map
- [x] 2.2 Run slim script and hand-fix remaining violations (long `helpKey` fields: matching, localization, reviewers)
- [x] 2.3 Replace Normal and Unique Attribute Definitions `sectionHelpMessage` with ≤320-char blurbs linking to defining-attributes and velocity-context
- [x] 2.4 Validate `connector-spec.json` parses cleanly (`node -e "JSON.parse(...)"`)

## 3. Reference doc gap-fill

- [x] 3.1 Diff removed verbose inline text against `docs/reference/velocity-context.md` — patch any unique helper facts not already documented
- [x] 3.2 Spot-check other sections (Sources, Matching, External) — patch use guides or reference pages only where slimming drops unique facts

## 4. Help lint enforcement

- [x] 4.1 Create `scripts/check-connector-spec-help.cjs` enforcing 220/320 char limits, link presence, and no `<ul>` in section help
- [x] 4.2 Wire check into `npm run lint` (or `docs:prepare`) via `package.json`
- [x] 4.3 Add Vitest or Node test for check script with fixture violations (covers "CI rejects verbose inline help" scenario)
- [x] 4.4 Update `scripts/README.md` with slim + check script usage

## 5. Verification

- [x] 5.1 Run `npm run lint` — help check passes on slimmed spec
- [x] 5.2 Run `npm run docs:prepare` — generated Configuration reference unchanged or improved vs baseline
- [x] 5.3 Run targeted tests if any settings/doc script tests exist

## 6. Documentation

- [x] 6.1 Update `docs/README.md` if lint/docs pipeline changes affect maintainer workflow
- [x] 6.2 Update `scripts/README.md` for slim and check scripts (N/A for README/getting-started — no user-visible connector behavior change)
- [x] 6.3 Confirm inline help pattern documented in AGENTS.md or project-standards if maintainer guidance exists

## 7. Changelog

- [x] 7.1 Create or update changelog entry (apply invokes **changelog-generator** if available)
- [x] 7.2 Confirm entry covers slimmer ISC configuration help with links to documentation site
