## 1. CI blockers

- [x] 1.1 Run `npm run docs:prepare` and confirm `docs/CHANGELOG.md` is regenerated without `lean-ctx: omitted` markers
- [x] 1.2 Fix root cause if `copy-changelog-for-docs.cjs` reintroduces placeholders

## 2. Ubiquitous language and glossary

- [x] 2.1 Add umbrella mode, side-car mode, sources scope, identity scope to `openspec/specs/ubiquitous-language/spec.md` (via change delta archive path — implement terms in glossary now, archive applies spec)
- [x] 2.2 Mirror new terms in `docs/glossary.md` with links to `configuring-sources-and-scope.md`
- [x] 2.3 Cross-link glossary terms on first use in configuration guides (umbrella, side-car, baseline, deferred candidate)

## 3. Getting started and navigation

- [x] 3.1 Expand `docs/getting-started/overview.md` with Day 1–7 checklist
- [x] 3.2 Expand `docs/getting-started/first-aggregation.md` with verification steps
- [x] 3.3 Create `docs/getting-started/which-guide.md` with mermaid decision tree
- [x] 3.4 Update `mkdocs.yml`: Getting started subsection under Use guides; add match-tuning-cookbooks and config-to-phases to nav
- [x] 3.5 Update `docs/index.md` Read next table with Getting started link

## 4. New reference and cookbook content

- [x] 4.1 Create `docs/reference/config-to-phases.md` (settings → account-list phase/step → log prefix)
- [x] 4.2 Create `docs/use-guides/configuration/match-tuning-cookbooks.md` (HR+AD, Records pool, Orphan cleanup)
- [x] 4.3 Link config-to-phases from `docs/use-guides/validation-and-troubleshooting/troubleshooting.md`
- [x] 4.4 Replace video placeholder in `review-forms-and-reviewers.md` with collateral link or static walkthrough

## 5. Placeholder cleanup

- [x] 5.1 Remove placeholder labels/comments from connection-and-observability-tuning.md
- [x] 5.2 Remove placeholder labels/comments from matching-identities.md, tuning-matching-algorithms.md, review-forms-and-reviewers.md, troubleshooting.md
- [x] 5.3 Fix defining-attributes.md: add `attribute-management-mapping-merge.png` or equivalent; remove bare placeholder text

## 6. Operation diagram PNGs

- [x] 6.1 Create `docs/assets/images/operations/` directory
- [x] 6.2 Export ten drawio files to PNG (testConnection, entitlementList, accountList, accountDiscoverSchema, accountCreate, accountRead, accountUpdate, accountEnable, accountDisable, custom-dryrun if applicable)
- [x] 6.3 Embed PNG architecture sections on matching operation pages
- [x] 6.4 Document drawio export steps in `docs/README.md`

## 7. Tooling and generator updates

- [x] 7.1 Create `scripts/recommend-pat-scopes.cjs` and `pat-scopes:recommend` npm script
- [x] 7.2 Document script usage in `docs/reference/pat-scopes.md`
- [x] 7.3 Enable `content.action.edit` and `edit_uri` in `mkdocs.yml`
- [x] 7.4 Update `scripts/generate-config-docs.cjs` for new guides and config-to-phases in Related references

## 8. Verification

- [x] 8.1 Run `npm run docs:prepare` (exit 0)
- [x] 8.2 Run `npm run lint:markdown` on changed docs
- [x] 8.3 Run `python3 -m mkdocs build`
- [x] 8.4 Grep `docs/` for remaining `Screenshot placeholder` and `lean-ctx: omitted`

## 9. Documentation

- [x] 9.1 Update `docs/README.md` site sections and guide index for new pages
- [x] 9.2 Update `docs/use-guides/index.md` for getting started and cookbooks links
- [x] 9.3 N/A — no public connector API contract change (docs-only change)

## 10. Changelog

- [x] 10.1 Add documentation hardening entry to CHANGELOG.md (user-visible: improved onboarding, troubleshooting matrix, PAT recommender)
- [x] 10.2 Confirm entry covers navigation, glossary terms, and new reference pages
