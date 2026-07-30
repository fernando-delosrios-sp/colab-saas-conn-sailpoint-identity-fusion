## Context

Identity Fusion NG publishes operator documentation via MkDocs Material (`mkdocs.yml`, `docs/`). Today:

- `scripts/sync-docs-home.cjs` copies the full `README.md` into `docs/index.md`
- Configuration field tables live in README and are duplicated across `docs/guides/*.md`
- `connector-spec.json` carries verbose inline `helpKey` text mirroring those tables
- Glossary at `docs/concepts/glossary.md` mirrors `openspec/specs/ubiquitous-language/spec.md` but is not in nav
- lean-ctx corruption affects `matching-algorithms.md` and `docs/CHANGELOG.md`

Stakeholders: integrators configuring Fusion in ISC, operators running aggregations, maintainers syncing docs with releases.

## Goals / Non-Goals

**Goals:**

- Six top-level nav sections with clear reader intent
- Configuration reference generated from `connector-spec.json` (single source of truth)
- Use guides as scenario-driven how-tos with no duplicated field tables
- Map-Define-Match embedded in Home; operation modes in Getting started Overview
- Glossary in top-level nav
- Slim README; stop full-README Home sync
- Fix lean-ctx artifacts; guard against recurrence

**Non-Goals:**

- Rewriting all guide prose from scratch (migrate + trim, not full rewrite)
- Auto-generating Use guide content from code
- Changing connector runtime behavior
- Creating a separate release-notes docs page

## Decisions

### D1: Configuration reference source of truth

- **Choice:** Generate `docs/configuration/*` from `connector-spec.json` + `src/data/config/settings/*.ts` via `scripts/generate-config-docs.cjs`
- **Reason:** Aligns field docs with ISC UI spec; prevents guide/README drift
- **Considered alternatives:** Manual README extraction (drift risk); README fragment sync (keeps README bloated)

### D2: Content placement model

- **Choice:** No Concepts section. Terms → Glossary; framework → Home inline; modes → Getting started; complex ops concepts → Use guides or Technical reference
- **Reason:** User-validated during brainstorming; avoids orphan concept pages
- **Considered alternatives:** Concepts section with map-define-match; operation modes on Home

### D3: Use guides subsection naming

- **Choice:** Four subsections, all `[Topic] guides`: Configuration guides, Operation guides, Validation and troubleshooting guides, Deployment guides
- **Reason:** Mirrors parent "Use guides" label; disambiguates from top-level Configuration reference
- **Considered alternatives:** Single-word subsections (Configuration, Operation); "Core pipeline" grouping (rejected)

### D4: Use guides roster (12 pages)

- **Choice:** 11 guides + index across four subsections; split `match.md`; proxy has no Use guide
- **Reason:** Clear workflow boundaries; match.md too large for one page
- **Considered alternatives:** Keep match unified; proxy as Use guide (rejected — ops manual → Technical reference)

### D5: Home generation

- **Choice:** Hand-written `docs/index.md`; remove `sync-docs-home.cjs` full README copy
- **Reason:** Home is product framing, not README duplicate
- **Considered alternatives:** Slim README sync fragment

### D6: connector-spec helpKey slimming

- **Choice:** Shorten each `helpKey` to ~1 sentence + relative link to Configuration doc anchor
- **Reason:** ISC UI should point to docs, not duplicate them
- **Considered alternatives:** Keep verbose helpKey (maintainability burden)

## Risks / Trade-offs

- [Risk] Doc URL breakage for external bookmarks → Mitigation: redirect stubs at old paths (`get-started.md`, `docs/guides/*`)
- [Risk] Config doc generator drift from spec schema → Mitigation: run generator in `docs:prepare`; CI verifies build
- [Risk] Top-level "Configuration" vs "Configuration guides" nav confusion → Mitigation: distinct paths; doc map on Home explains sections
- [Trade-off] One-time script investment vs manual maintenance → Accepted for long-term spec alignment
- [Trade-off] match.md split requires careful content boundary → Accepted; review forms content clearly scoped

## Migration Plan

1. Restore lean-ctx-corrupted files from git
2. Implement `generate-config-docs.cjs`; wire into `prepare-docs.cjs`
3. Slim `connector-spec.json` helpKey strings
4. Rewrite Home (`index.md`); update Getting started with operation modes
5. Slim README
6. Scaffold `docs/use-guides/` folder tree; migrate and trim guides
7. Split `match.md`; move proxy to Technical reference
8. Extract Technical reference pages (Velocity, observability, schema, chain recording)
9. Move glossary to top-level nav; retire `docs/concepts/`
10. Rewrite `mkdocs.yml` nav; add redirect stubs
11. Update `project-standards` src→docs scope map paths
12. Verify: `npm run docs:prepare && npm run lint:markdown && npm run ci:docs-review`

**Rollback:** Revert docs folder + mkdocs.yml + scripts; restore README sync script if needed. No database or deployment rollback.

## Open Questions

- None blocking implementation. Optional future: MkDocs redirects plugin vs hand-written stub pages for old URLs.
