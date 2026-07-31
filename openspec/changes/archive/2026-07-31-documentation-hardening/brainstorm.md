# Brainstorm: Documentation Hardening

## Background

A prior documentation restructure landed core changes: Use guides before Configuration in nav, **Configuring sources and scope** as the first configuration guide, new **Source types** page, PAT scope review, entitlements in Configuration reference Related links, scenario recording testing docs, mermaid on operation pages, and Developer Settings version text (no hardcoded semver in help).

Remaining pain points block CI and reader experience:

- `docs/CHANGELOG.md` contains `lean-ctx: omitted` placeholders → `npm run docs:prepare` fails
- 15+ "Screenshot placeholder" labels remain though PNG assets exist
- New terms **umbrella mode** / **side-car mode** used in guides but absent from ubiquitous language
- `docs/getting-started/` pages are redirect stubs, not in nav
- Ten `.drawio` operation diagrams not visible on the published site
- No onboarding path, decision tree, config-to-log matrix, or match cookbooks

User selected **full package** scope: blockers + UX + content depth + drawio exports + PAT script + MkDocs edit link.

## Q1: What is in scope?

**Decision:** Full documentation hardening package — not just placeholder cleanup.

**Alternatives considered:**

1. **Blockers only** — fast but leaves navigation and glossary gaps
2. **Hardening + tooling** — skips cookbooks and drawio
3. **Full package (chosen)** — complete reader journey from Day 1 to production tuning

## Q2: Where do new pages live in nav?

**Decision:** Add **Getting started** subsection under Use guides (not a new top-level section) to avoid fighting the existing six-section IA while still surfacing onboarding.

Pages:

- `getting-started/overview.md` — expanded Day 1–7 checklist
- `getting-started/first-aggregation.md` — step-by-step first run
- `getting-started/which-guide.md` — decision tree (new)

New reference: `docs/reference/config-to-phases.md`

New guide: `docs/use-guides/configuration/match-tuning-cookbooks.md`

## Q3: How to handle drawio diagrams?

**Decision:** Export drawio to PNG under `docs/assets/images/operations/` and embed below existing mermaid flowcharts on operation pages. Document export process in `docs/README.md`.

**Alternative rejected:** Rely on mermaid only — loses C4 container detail already authored in drawio.

## Q4: Ubiquitous language for deployment modes?

**Decision:** Add **umbrella mode**, **side-car mode**, **sources scope**, and **identity scope** to `openspec/specs/ubiquitous-language/spec.md` and mirror in `docs/glossary.md` before cross-linking guides.

## Q5: PAT scope recommender?

**Decision:** Add `scripts/recommend-pat-scopes.cjs` with npm script; document in `pat-scopes.md`. Input: exported source config JSON; output: minimal + conditional scope lists matching existing doc tables.

## Q6: MkDocs polish?

**Decision:** Enable Material `content.action.edit` with `edit_uri: edit/main/docs/` for GitHub edit links.

## Design trade-offs

| Trade-off | Acceptance |
| --- | --- |
| Getting started under Use guides vs top-level | Keeps nav count stable; update documentation-site spec accordingly |
| Manual drawio PNG export vs CI automation | Manual export for v1; document command; automate later if painful |
| Cookbooks as separate page vs appendix | Separate page for discoverability in Configuration guides nav |

## Agreed outcome

Documentation site becomes CI-green, placeholder-free, glossary-aligned, with linear onboarding, decision tree, troubleshooting matrix, visual operation diagrams, match cookbooks, PAT recommender CLI, and edit-on-GitHub — building on the restructure already merged in working tree.
