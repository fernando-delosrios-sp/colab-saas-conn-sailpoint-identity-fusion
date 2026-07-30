## 1. Prerequisites and cleanup

- [x] 1.1 Restore `docs/guides/matching-algorithms.md` and `docs/CHANGELOG.md` from git (remove lean-ctx placeholders)
- [x] 1.2 Add CI guard in docs review script rejecting `lean-ctx: omitted` pattern in `docs/**`

## 2. Configuration reference generation

- [x] 2.1 Implement `scripts/generate-config-docs.cjs` emitting `docs/configuration/*.md` from `connector-spec.json`
- [x] 2.2 Wire generator into `scripts/prepare-docs.cjs` (`npm run docs:prepare`)
- [x] 2.3 Shorten `connector-spec.json` helpKey strings with links to Configuration reference anchors
- [x] 2.4 Add Configuration pages to `mkdocs.yml` top-level nav

## 3. Home, Getting started, README

- [x] 3.1 Write hand-authored `docs/index.md` with Map-Define-Match framework embedded inline
- [x] 3.2 Remove or replace `scripts/sync-docs-home.cjs` (stop full README sync)
- [x] 3.3 Create `docs/getting-started/` with Overview (operation modes embedded) and First aggregation checklist
- [x] 3.4 Slim `README.md` — remove config tables; add docs site links
- [x] 3.5 Retire `docs/concepts/map-define-match.md` with redirect stub to Home

## 4. Use guides migration

- [x] 4.1 Scaffold `docs/use-guides/` folder tree (configuration/, operation/, validation-and-troubleshooting/, deployment/)
- [x] 4.2 Migrate Configuration guides (6 pages); strip field tables; add Configuration reference links
- [x] 4.3 Split `guides/match.md` into `matching-identities.md` and `review-forms-and-reviewers.md`
- [x] 4.4 Migrate Operation guides (dry-run analysis, connection and observability tuning)
- [x] 4.5 Migrate Validation and troubleshooting guides (testing and validation, troubleshooting)
- [x] 4.6 Migrate Deployment guides (migrating from Identity Fusion v1)
- [x] 4.7 Rewrite Use guides index as scenario index organized by four subsections
- [x] 4.8 Add redirect stubs at legacy `docs/guides/*` and `docs/get-started.md` paths

## 5. Technical reference and glossary

- [x] 5.1 Move glossary to `docs/glossary.md`; add top-level Glossary nav entry
- [x] 5.2 Extract Technical reference pages (standard account schema, velocity context, observability, proxy deployment, chain recording appendix)
- [x] 5.3 Move `guides/proxy-mode.md` to Technical reference; strip field tables
- [x] 5.4 Group connector operations under Technical reference in `mkdocs.yml`
- [x] 5.5 Retire `docs/concepts/` directory stubs

## 6. Navigation and cross-links

- [x] 6.1 Rewrite `mkdocs.yml` with six top-level sections and Use guides four-subsection nav
- [x] 6.2 Update `docs/README.md` repo doc index
- [x] 6.3 Update internal cross-links across docs, README, and connector-spec helpKey URLs
- [x] 6.4 Update `openspec/specs/project-standards` src→docs scope map paths to `docs/use-guides/**`

## 7. Verification

- [x] 7.1 Run `npm run docs:prepare && npm run lint:markdown && mkdocs build`
- [x] 7.2 Run `npm run ci:docs-review` and fix any failures
- [x] 7.3 Manually verify Home has framework inline, Getting started has operation modes, Glossary in nav

## 8. Documentation

- [x] 8.1 Update README for user-visible docs structure change (slim landing + doc site links)
- [x] 8.2 Update `docs/README.md` and Getting started for new paths and section map
- [x] 8.3 Update connector-spec helpKey inline docs linking to Configuration reference (N/A — covered in 2.3; confirm complete)

## 9. Changelog

- [x] 9.1 Create or update CHANGELOG entry for documentation restructure (user-visible: new docs IA, URL changes)
- [x] 9.2 Confirm entry covers restructured nav sections, Configuration reference generation, and legacy URL redirects
