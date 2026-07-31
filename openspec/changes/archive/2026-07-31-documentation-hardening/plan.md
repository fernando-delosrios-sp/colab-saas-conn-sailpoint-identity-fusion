# Documentation Hardening Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete documentation hardening so the MkDocs site is CI-green, placeholder-free, glossary-aligned, and provides onboarding, troubleshooting, visual, and tooling aids.

**Architecture:** Docs-only change across `docs/`, `mkdocs.yml`, `scripts/generate-config-docs.cjs`, and new `scripts/recommend-pat-scopes.cjs`. Ubiquitous language updated first; content and nav follow; verification last.

**Tech Stack:** MkDocs Material, markdownlint, Node.js scripts, draw.io PNG export

**Spec references:** `openspec/changes/documentation-hardening/specs/documentation-site/spec.md`, `specs/ubiquitous-language/spec.md`

---

## Task 1: Fix CI blocker (CHANGELOG)

- [ ] **Step 1:** Run `npm run docs:prepare` and capture failure output
- [ ] **Step 2:** Inspect `docs/CHANGELOG.md` for `lean-ctx: omitted` lines
- [ ] **Step 3:** Run `node scripts/copy-changelog-for-docs.cjs` or full `docs:prepare`; verify `docs/CHANGELOG.md` matches root `CHANGELOG.md` without placeholders
- [ ] **Step 4:** Re-run `npm run docs:prepare` — must exit 0

**Commit:** `fix(docs): restore CHANGELOG for lean-ctx check`

---

## Task 2: Ubiquitous language + glossary

- [ ] **Step 1:** Add terms to `docs/glossary.md`: Umbrella mode, Side-car mode, Sources scope, Identity scope (mirror change delta)
- [ ] **Step 2:** Cross-link from `configuring-sources-and-scope.md` first mentions
- [ ] **Step 3:** Pass `grep -r "Screenshot placeholder" docs/use-guides/configuration/configuring-sources-and-scope.md` — none expected

**Commit:** `docs: add deployment mode and scope glossary terms`

---

## Task 3: Getting started pages + nav

- [ ] **Step 1:** Rewrite `docs/getting-started/overview.md` — Day 1–7 checklist with guide links
- [ ] **Step 2:** Rewrite `docs/getting-started/first-aggregation.md` — ISC UI steps + verification
- [ ] **Step 3:** Create `docs/getting-started/which-guide.md` with mermaid decision tree + outcome table
- [ ] **Step 4:** Update `mkdocs.yml` — add Getting started subsection; add cookbooks + config-to-phases entries
- [ ] **Step 5:** Update `docs/index.md` and `docs/use-guides/index.md`

**Commit:** `docs: add getting started path and guide decision tree`

---

## Task 4: New reference pages

- [ ] **Step 1:** Create `docs/reference/config-to-phases.md` from `docs/operations/account-list.md` phase table
- [ ] **Step 2:** Create `docs/use-guides/configuration/match-tuning-cookbooks.md` (3 scenarios)
- [ ] **Step 3:** Add troubleshooting link to config-to-phases
- [ ] **Step 4:** Fix review-forms video placeholder

**Commit:** `docs: add config-to-phases matrix and match cookbooks`

---

## Task 5: Placeholder cleanup

- [ ] **Step 1:** For each file in tasks.md §5, remove `**Screenshot placeholder:**` and `<!-- PLACEHOLDER -->` lines
- [ ] **Step 2:** Fix `defining-attributes.md` image reference
- [ ] **Step 3:** `grep -r "Screenshot placeholder" docs/use-guides/` — expect zero matches

**Commit:** `docs: remove screenshot placeholder labels`

---

## Task 6: Drawio PNG exports

- [ ] **Step 1:** `mkdir -p docs/assets/images/operations`
- [ ] **Step 2:** Export each `docs/operations/diagrams/*.drawio` to PNG (draw.io desktop or CLI)
- [ ] **Step 3:** Add `## Architecture diagram` + `![...](...)` to each operation page
- [ ] **Step 4:** Document export in `docs/README.md`

**Commit:** `docs: embed operation architecture diagram PNGs`

---

## Task 7: PAT recommender + MkDocs edit

- [ ] **Step 1:** Implement `scripts/recommend-pat-scopes.cjs` — parse config JSON, print scope lists
- [ ] **Step 2:** Add `"pat-scopes:recommend": "node scripts/recommend-pat-scopes.cjs"` to `package.json`
- [ ] **Step 3:** Document in `docs/reference/pat-scopes.md`
- [ ] **Step 4:** Add to `mkdocs.yml`: `content.action.edit`, `edit_uri: edit/main/docs/`
- [ ] **Step 5:** Update `generate-config-docs.cjs` for new guide links

**Commit:** `docs: add PAT scope recommender and edit-on-GitHub`

---

## Task 8: Verification + changelog

- [ ] **Step 1:** `npm run docs:prepare && npm run lint:markdown && python3 -m mkdocs build`
- [ ] **Step 2:** Update root `CHANGELOG.md` with documentation improvements
- [ ] **Step 3:** Re-run `docs:prepare` to sync `docs/CHANGELOG.md`

**Commit:** `chore(docs): verify build and update changelog`
