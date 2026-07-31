## Context

Identity Fusion NG publishes an MkDocs site (`docs/`, `mkdocs.yml`) with Use guides, generated Configuration reference, Technical reference, and Glossary. A recent restructure flipped nav order, added sources/scope and source-types guides, and updated testing docs for scenario replay. This change completes hardening: CI blockers, placeholder cleanup, glossary alignment, onboarding UX, reference depth, drawio visibility, and doc tooling.

Constraints:

- Ubiquitous language spec is source of truth; glossary mirrors it
- Configuration reference is generated — do not hand-edit `docs/configuration/*.md`
- Use guides must not duplicate field tables; link to Configuration reference
- `npm run docs:prepare` must pass including `check-lean-ctx-docs.cjs`

## Goals / Non-Goals

**Goals:**

- `docs:prepare` and mkdocs build pass cleanly
- Remove all screenshot placeholder noise where assets exist
- Canonical umbrella/side-car/scope terms with glossary cross-links
- Getting started subsection with Day 1–7 path and guide decision tree
- Config-to-account-list-phase reference for troubleshooting
- Three match tuning cookbooks with config snippets
- Operation drawio diagrams visible as PNG on site
- PAT scope recommender CLI documented in pat-scopes.md
- MkDocs edit-on-GitHub enabled

**Non-Goals:**

- Automated drawio export in CI (manual export v1)
- Rewriting all existing guides end-to-end
- Connector runtime or API behavior changes
- New video production (link existing collateral or static walkthrough)

## Decisions

### D1: Getting started placement

- **Choice:** Subsection under Use guides in `mkdocs.yml`
- **Reason:** Avoids expanding top-level nav beyond six sections while surfacing onboarding early
- **Considered alternatives:** Top-level Getting started (conflicts with archived documentation-site six-section requirement unless spec is MODIFIED)

### D2: Drawio rendering strategy

- **Choice:** Export PNG to `docs/assets/images/operations/`; embed in operation pages
- **Reason:** MkDocs Material renders PNG reliably; drawio source stays editable
- **Considered alternatives:** Mermaid-only (loses C4 detail); drawio iframe plugin (extra dependency)

### D3: PAT recommender input

- **Choice:** Accept path to exported ISC source config JSON; infer conditional scopes from known keys
- **Reason:** Matches operator workflow; reuses pat-scopes.md tables as single source of truth in script comments
- **Considered alternatives:** Parse live connector-spec only (less useful for deployed configs)

### D4: Guide roster update

- **Choice:** MODIFIED documentation-site requirement to reflect current guide count (sources/scope, source-types, match cookbooks, getting-started pages)
- **Reason:** Existing "twelve pages" requirement is stale after restructure

## Risks / Trade-offs

- [Risk] Drawio PNGs drift from source → Mitigation: Document export command in docs/README.md; name PNGs after operation slug
- [Risk] documentation-site spec conflicts (six top-level vs Getting started under Use guides) → Mitigation: MODIFIED requirement clarifies Getting started as Use guides subsection
- [Trade-off] Manual PNG export maintenance → Accepted for v1; low change frequency on operation diagrams

## Migration Plan

1. Fix `docs/CHANGELOG.md` via `npm run docs:prepare` (regenerate from root CHANGELOG)
2. Content edits in dependency order: ubiquitous language → glossary → new pages → placeholder cleanup → drawio PNGs
3. Update `generate-config-docs.cjs` and `mkdocs.yml`
4. Add `recommend-pat-scopes.cjs` + package.json script
5. Verify: `npm run docs:prepare && npm run lint:markdown && python3 -m mkdocs build`
6. Rollback: revert docs commits; no data migration

## Open Questions

- None blocking — user confirmed full package scope
