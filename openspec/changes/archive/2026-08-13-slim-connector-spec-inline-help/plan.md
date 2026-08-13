# Slim Connector-Spec Inline Help Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Shorten all `helpKey` and `sectionHelpMessage` strings in `connector-spec.json` with links to Configuration reference and Use guides, without losing documentation coverage.

**Architecture:** Slim ISC inline text in connector-spec; preserve depth via `SECTION_INTRO_OVERRIDES` in `generate-config-docs.cjs` and existing reference docs. Enforce limits with `check-connector-spec-help.cjs` in CI.

**Tech Stack:** Node.js (CJS scripts), connector-spec.json, MkDocs doc generator, Vitest.

**Change artifacts:** `openspec/changes/slim-connector-spec-inline-help/{design.md, tasks.md, specs/}`

**Canonical test command:** `npm test` (full) · `npm run lint` (includes help check after Task 4)

---

## Task 1: Baseline audit

- [ ] **Step 1:** Create `scripts/check-connector-spec-help.cjs` with `--audit` flag that prints violations without failing (implement core measurement first: strip HTML, count chars, detect links)
- [ ] **Step 2:** Run `node scripts/check-connector-spec-help.cjs --audit` — capture violation list
- [ ] **Step 3:** Commit: `chore: add connector-spec help audit script`

---

## Task 2: Expand SECTION_INTRO_OVERRIDES

- [ ] **Step 1:** Read current generated `docs/configuration/*.md` section intros for sections without overrides
- [ ] **Step 2:** Add overrides in `scripts/generate-config-docs.cjs` for: Sources, Matching Settings, Review Settings, Developer Settings, External Settings, Advanced Connection Settings (2–4 sentences + guide links each)
- [ ] **Step 3:** Run `npm run docs:prepare` — diff generated pages; confirm intros are substantive
- [ ] **Step 4:** Commit: `docs: expand config doc section intros for slim ISC help`

---

## Task 3: Extend slim script for sectionHelpMessage

- [ ] **Step 1:** Copy `USE_GUIDE_BY_SECTION` link map into slim script (or import shared constants file if cleaner)
- [ ] **Step 2:** Add `slimSectionHelp(sectionTitle, currentHtml)` → short HTML blurb + markdown link
- [ ] **Step 3:** Walk `sourceConfig` sections; rewrite `sectionHelpMessage` when over 320 chars
- [ ] **Step 4:** Run script; verify JSON valid
- [ ] **Step 5:** Commit: `chore: slim connector-spec sectionHelpMessage strings`

---

## Task 4: Slim remaining helpKey violations

- [ ] **Step 1:** Run existing helpKey slim pass on fields still over 220 chars (`enableLocalization`, `fusionOwnerIsGlobalReviewer`, `skipMatchIfThresholdNotMet`, `fusionScore`, etc.)
- [ ] **Step 2:** Hand-edit any fields where first-sentence extraction loses meaning — write concise summary manually
- [ ] **Step 3:** Commit: `chore: slim remaining connector-spec helpKey strings`

---

## Task 5: Reference doc gap-fill

- [ ] **Step 1:** Diff pre-slim Normal/Unique sectionHelpMessage against `docs/reference/velocity-context.md`
- [ ] **Step 2:** Patch velocity-context only for missing helper signatures or behavior notes
- [ ] **Step 3:** Run `npm run lint:markdown` on edited docs
- [ ] **Step 4:** Commit: `docs: backfill velocity context after ISC help slimming` (skip if no gaps)

---

## Task 6: Wire help lint into CI

- [ ] **Step 1:** Finalize `check-connector-spec-help.cjs` — exit 1 on violations; document limits in file header
- [ ] **Step 2:** Add to `package.json` lint script chain
- [ ] **Step 3:** Add `scripts/__tests__/checkConnectorSpecHelp.test.cjs` or Vitest wrapper with temp fixture spec
- [ ] **Step 4:** Run `npm run lint` — must pass on slimmed tree
- [ ] **Step 5:** Commit: `ci: enforce connector-spec inline help limits`

---

## Task 7: Final verification

- [ ] **Step 1:** Run `npm run docs:prepare`
- [ ] **Step 2:** Run `npm run lint`
- [ ] **Step 3:** Run `npm test` (or scoped test for new check script)
- [ ] **Step 4:** Run `openspec validate --all --json` — all valid
- [ ] **Step 5:** Update CHANGELOG via changelog-generator skill

---

## Manual spot-check (deferred)

- [~] **ISC UI:** Upload updated spec to a dev tenant; confirm section help panels render links and fit without scroll — no automated equivalent; record in verify.md §5
