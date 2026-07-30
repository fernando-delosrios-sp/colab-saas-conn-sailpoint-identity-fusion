# Documentation Restructure Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Restructure the MkDocs site into six top-level sections with spec-driven Configuration reference, reorganized Use guides, embedded Home/Getting started content, and slim README.

**Architecture:** Generate `docs/configuration/*` from `connector-spec.json` via `generate-config-docs.cjs`; hand-author Home and Getting started; migrate `docs/guides/*` to `docs/use-guides/` with four `[Topic] guides` subsections; move reference appendices to Technical reference; retire README sync and concepts pages.

**Tech Stack:** MkDocs Material, Node.js scripts (CJS), connector-spec.json, markdownlint, existing `ci:docs-review` pipeline.

**Change artifacts:** `openspec/changes/documentation-restructure/{design.md, tasks.md, specs/}`

---

## Task 1: Clean lean-ctx corruption

- [ ] **Step 1:** Run `git show HEAD:docs/guides/matching-algorithms.md > /tmp/matching-algorithms.md` and diff against current file
- [ ] **Step 2:** Restore clean content to `docs/guides/matching-algorithms.md`
- [ ] **Step 3:** Copy root `CHANGELOG.md` over `docs/CHANGELOG.md` via existing copy script or manual sync
- [ ] **Step 4:** Add check to `scripts/ci-check-readme-changelog.cjs` or new script: fail if `docs/**` contains `lean-ctx: omitted`
- [ ] **Step 5:** Run `npm run ci:docs-review` — verify guard passes on clean tree

---

## Task 2: Build Configuration doc generator

- [ ] **Step 1:** Create `scripts/generate-config-docs.cjs` — read `connector-spec.json`, walk menu → section → field
- [ ] **Step 2:** Emit `docs/configuration/index.md` plus one page per ISC menu (connection, source, mapping, definition, matching, advanced)
- [ ] **Step 3:** Each field entry: name, type, default (from settings TS where available), required, validation, link placeholder to Use guide
- [ ] **Step 4:** Add `runNode('generate-config-docs.cjs')` to `scripts/prepare-docs.cjs` before mkdocs build
- [ ] **Step 5:** Run `npm run docs:prepare` — confirm `docs/configuration/` generated
- [ ] **Step 6:** Add Configuration section to `mkdocs.yml` nav

---

## Task 3: Slim connector-spec helpKey strings

- [ ] **Step 1:** For each field in `connector-spec.json`, replace verbose helpKey with ≤2 sentences + markdown link to generated config page anchor
- [ ] **Step 2:** Spot-check 3 menus in generated docs — anchor links resolve
- [ ] **Step 3:** Run existing connector-spec tests if any (`npm test` scoped to settings tests)

---

## Task 4: Rewrite Home and Getting started

- [ ] **Step 1:** Write new `docs/index.md`: disclaimer, product pitch, embedded Map/Define/Match sections + framework image, doc map cards, changelog link
- [ ] **Step 2:** Merge content from `docs/concepts/map-define-match.md`; delete or stub that file with link to Home
- [ ] **Step 3:** Create `docs/getting-started/overview.md` with prerequisites + embedded operation modes (authoritative, records, orphan)
- [ ] **Step 4:** Create `docs/getting-started/first-aggregation.md` from `docs/get-started.md` checklist
- [ ] **Step 5:** Remove `scripts/sync-docs-home.cjs` call from prepare-docs (or delete script)
- [ ] **Step 6:** Add Getting started to `mkdocs.yml` nav

---

## Task 5: Slim README

- [ ] **Step 1:** Remove §"Reference: configuration at a glance" and downstream config tables from `README.md`
- [ ] **Step 2:** Remove dry-run API, schema tables, chain recording sections (note moved to docs site)
- [ ] **Step 3:** Add read-next table linking to docs site sections
- [ ] **Step 4:** Update any broken README links to new doc paths

---

## Task 6: Scaffold and migrate Use guides

- [ ] **Step 1:** Create folder tree under `docs/use-guides/{configuration,operation,validation-and-troubleshooting,deployment}/`
- [ ] **Step 2:** Migrate map → `configuration/mapping-attributes.md` — strip field tables, add Configuration links
- [ ] **Step 3:** Migrate define → `configuration/defining-attributes.md` — move Velocity API appendix out
- [ ] **Step 4:** Split match.md → `configuration/matching-identities.md` + `configuration/review-forms-and-reviewers.md`
- [ ] **Step 5:** Migrate matching-algorithms, source-configuration to configuration/
- [ ] **Step 6:** Migrate advanced-connection-settings → `operation/connection-and-observability-tuning.md`
- [ ] **Step 7:** Create `operation/dry-run-analysis.md` from README dry-run narrative
- [ ] **Step 8:** Migrate testing-process, troubleshooting to validation-and-troubleshooting/
- [ ] **Step 9:** Migrate migration guide to deployment/
- [ ] **Step 10:** Rewrite `use-guides/index.md` as scenario index by four subsections
- [ ] **Step 11:** Add Use guides nav to `mkdocs.yml` with `[Topic] guides` subsection labels

---

## Task 7: Technical reference and glossary

- [ ] **Step 1:** Move/copy glossary to `docs/glossary.md`; add top-level Glossary nav; update spec mirror note
- [ ] **Step 2:** Create `docs/reference/standard-account-schema.md` from README section
- [ ] **Step 3:** Create `docs/reference/velocity-context.md` from define.md appendix
- [ ] **Step 4:** Create `docs/reference/observability.md` from advanced-connection log formats
- [ ] **Step 5:** Move proxy-mode to `docs/reference/proxy-mode.md` — strip field tables
- [ ] **Step 6:** Add chain recording appendix under reference (from testing-process dev detail)
- [ ] **Step 7:** Group `docs/operations/*` under Technical reference in nav
- [ ] **Step 8:** Retire `docs/concepts/` stubs

---

## Task 8: Redirects and cross-links

- [ ] **Step 1:** Add redirect stub markdown files at legacy `docs/guides/*.md` paths pointing to new locations
- [ ] **Step 2:** Stub `docs/get-started.md` → getting-started
- [ ] **Step 3:** Update `docs/README.md` index
- [ ] **Step 4:** Grep repo for `docs/guides/` and `docs/concepts/` links — update all
- [ ] **Step 5:** Update src→docs scope map in `openspec/specs/project-standards/spec.md` (or via change archive)

---

## Task 9: Verification and changelog

- [ ] **Step 1:** Run `npm run docs:prepare && npm run lint:markdown && python3 -m mkdocs build`
- [ ] **Step 2:** Run `npm run ci:docs-review`
- [ ] **Step 3:** Manual spot-check: Home framework inline, Getting started modes, Glossary nav, 12 Use guide pages, no lean-ctx garbage
- [ ] **Step 4:** Add CHANGELOG entry for docs restructure and URL migration note

---

## Acceptance checklist (from specs)

- [ ] Six top-level nav sections present
- [ ] Configuration pages generated from connector-spec.json
- [ ] Use guides: Configuration guides, Operation guides, Validation and troubleshooting guides, Deployment guides
- [ ] No Core pipeline subsection
- [ ] Proxy: Configuration + Technical reference only
- [ ] README has no field tables
- [ ] `ci:docs-review` passes
