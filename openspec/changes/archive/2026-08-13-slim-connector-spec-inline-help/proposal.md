## Why

The documentation restructure moved field reference and Velocity API detail into the MkDocs site, but `connector-spec.json` still carries multi-kilobyte `sectionHelpMessage` blocks and a handful of verbose `helpKey` strings. Operators configuring the connector in ISC see scroll-heavy inline help that duplicates content already published under Configuration reference, Use guides, and Technical reference. Completing the slimming work improves ISC UX, enforces a single source of truth, and closes a gap where the archived helpKey requirement never landed in the main `documentation-site` spec.

## What Changes

**Field-level inline help (`helpKey`)**
- From: Mostly slim with doc links; ~15 fields still exceed 220 characters or omit links
- To: Every `helpKey` ≤220 characters, one short sentence, mandatory link to Configuration reference anchor
- Reason: Consistent ISC field tooltips; matches doc generator expectations
- Impact: Non-breaking for runtime; operators see shorter tooltips with links to full detail

**Section-level inline help (`sectionHelpMessage`)**
- From: 12 sections; Normal and Unique Attribute Definitions ~4k chars each; others use multi-bullet HTML essays
- To: Each section ≤320 characters, ≤2 sentences, link to primary Use guide or reference page; no inline bullet lists
- Reason: Section headers are the worst ISC readability offenders
- Impact: Non-breaking; verbose prose preserved in generated Configuration pages and reference docs

**Enforcement and tooling**
- From: One-off `slim-connector-spec-helpkeys.cjs`; no CI guard
- To: Extended slim script + `check-connector-spec-help.cjs` wired into lint/docs pipeline
- Reason: Prevent regression as fields are added
- Impact: CI fails if new help text violates limits

**Reference doc gap-fill**
- From: Most detail already in `velocity-context.md`, use guides, and `SECTION_INTRO_OVERRIDES`
- To: Patch reference docs only where audit finds facts present in removed inline text but absent elsewhere
- Reason: Slimming must not drop unique operator-facing facts
- Impact: Minor doc edits; no runtime change

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `documentation-site`: Add/reinstate requirements for concise `helpKey` and `sectionHelpMessage` strings with doc links; require CI check for help text limits

## Impact

- **Config UI:** `connector-spec.json` (`helpKey`, `sectionHelpMessage`)
- **Scripts:** `scripts/slim-connector-spec-helpkeys.cjs` (extend or rename), new `scripts/check-connector-spec-help.cjs`, `scripts/generate-config-docs.cjs` (`SECTION_INTRO_OVERRIDES` expansion)
- **Docs:** `docs/reference/velocity-context.md`, use guides, generated `docs/configuration/*` (via `npm run docs:prepare`)
- **CI:** `package.json` lint or docs:prepare hook
- **Tests:** Vitest or Node script test for check script
- **No runtime connector code changes**
