## Why

The documentation restructure improved navigation and source-configuration guidance, but several gaps undermine trust and CI: `docs:prepare` fails on corrupted CHANGELOG placeholders, guides still show "Screenshot placeholder" labels despite existing assets, and new deployment terms (umbrella/side-car) are used without canonical definitions. Readers lack a linear onboarding path, a guide-selection decision tree, and troubleshooting aids linking configuration to account-list log phases. Operation C4 diagrams exist only as drawio source files invisible on the published site.

## What Changes

**CI and placeholder debt**

- From: `docs/CHANGELOG.md` contains `lean-ctx: omitted` stubs; `docs:prepare` fails
- To: Full CHANGELOG content via `copy-changelog-for-docs.cjs`; zero lean-ctx placeholders under `docs/`
- Impact: Non-breaking; unblocks docs CI

**Screenshot placeholders**

- From: Placeholder labels and HTML comments despite PNG assets in `docs/assets/images/`
- To: Clean `![alt](path)` only; fix `defining-attributes.md` missing image
- Impact: Non-breaking; reader UX

**Ubiquitous language**

- From: Umbrella/side-car used in guides only
- To: Terms in ubiquitous-language spec + glossary; cross-links from guides
- Impact: Non-breaking; aligns with AGENTS.md language rules

**Navigation and onboarding**

- From: `getting-started/` redirect stubs; no decision tree
- To: Expanded overview + first-aggregation + `which-guide.md`; mkdocs nav updated
- Impact: Non-breaking; new pages

**Content depth**

- From: No config-to-phase matrix or match cookbooks
- To: `docs/reference/config-to-phases.md` and `match-tuning-cookbooks.md`
- Impact: Non-breaking; new reference content

**Visual assets**

- From: Ten drawio files not embedded on site
- To: PNG exports embedded on operation pages
- Impact: Non-breaking; maintainer export step documented

**Tooling and MkDocs**

- From: Manual PAT scope selection; no edit-on-GitHub
- To: `scripts/recommend-pat-scopes.cjs`; Material `content.action.edit`
- Impact: Non-breaking; new npm script

## Capabilities

### New Capabilities

_(none — all changes extend existing documentation and language specs)_

### Modified Capabilities

- `documentation-site`: Nav/onboarding requirements, placeholder-free guides, drawio PNG embedding, config-to-phases reference, match cookbooks, PAT recommender script, MkDocs edit link, updated guide roster counts
- `ubiquitous-language`: Add umbrella mode, side-car mode, sources scope, identity scope definitions

## Impact

- **Docs:** `docs/**`, `mkdocs.yml`, `docs/README.md`
- **Generated:** `docs/configuration/` via `scripts/generate-config-docs.cjs`
- **Connector spec help:** Already updated for Developer Settings version text (no further spec change required for hardening)
- **Scripts:** `scripts/recommend-pat-scopes.cjs` (new), `scripts/copy-changelog-for-docs.cjs` (verify/fix output)
- **CI:** `npm run docs:prepare`, `npm run lint:markdown`, mkdocs build
- **No runtime connector behavior changes**
