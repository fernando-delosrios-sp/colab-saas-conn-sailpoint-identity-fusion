## Why

The Identity Fusion NG MkDocs site is poorly structured and partially stale. Home syncs the entire README (~465 lines), guides duplicate connector-spec field tables, the glossary is hidden from nav, lean-ctx placeholders render as garbage in published pages, and there is no clear boundary between field reference and workflow documentation. Operators and integrators cannot reliably find configuration options versus setup guides, and inline `helpKey` text in `connector-spec.json` duplicates content that belongs in the docs site.

## What Changes

**Documentation site structure**
- From: Six inconsistent nav groups (Home = full README, Concepts, Configuration guides, Run and troubleshoot, Operations reference); glossary not in nav
- To: Six top-level sections — Home, Getting started, Configuration, Use guides, Glossary, Technical reference
- Reason: Match reader intent (what / how / reference)
- Impact: Non-breaking for connector runtime; breaking for doc URLs (redirect stubs required)

**Home and Getting started content**
- From: `map-define-match` as separate concepts page; operation modes on Home via README sync
- To: Map-Define-Match framework embedded inline in Home; operation modes embedded in Getting started Overview; retire `docs/concepts/map-define-match.md`
- Reason: Framework is product framing; modes are needed before first configuration
- Impact: Internal doc links must be updated

**Configuration reference**
- From: Field tables in README and duplicated in guides; verbose `helpKey` strings in connector-spec.json
- To: Configuration pages generated from `connector-spec.json`; slim `helpKey` with links to docs; README config tables removed
- Reason: Single source of truth for field definitions
- Impact: connector-spec.json help text shortened; new `scripts/generate-config-docs.cjs`

**Use guides reorganization**
- From: Flat `docs/guides/` mixing field reference and workflows
- To: `docs/use-guides/` with four `[Topic] guides` subsections: Configuration guides, Operation guides, Validation and troubleshooting guides, Deployment guides (12 pages total)
- Reason: Clear how-to boundary; strip field tables from guides
- Impact: Guide paths change; `match.md` split into Matching identities + Review forms and reviewers

**Proxy mode placement**
- From: Single `guides/proxy-mode.md` use guide
- To: Field reference in Configuration; deployment manual in Technical reference; no Use guide
- Impact: Nav path change for proxy content

**README slimming**
- From: ~465-line README with config tables, dry-run API, schema, chain recording
- To: Repo landing page with pitch, docs site link, read-next table
- Impact: GitHub README no longer serves as config reference

**lean-ctx cleanup**
- From: Corrupted placeholders in `matching-algorithms.md` and `docs/CHANGELOG.md`
- To: Restored content + CI guard against placeholder pattern

## Capabilities

### New Capabilities

- `documentation-site`: MkDocs information architecture, Configuration reference generation from connector-spec.json, Use guides folder structure and content boundaries, Home/Getting started embedded content rules, Technical reference page set, doc build tooling (`generate-config-docs.cjs`, updated `prepare-docs.cjs`)

### Modified Capabilities

- `project-standards`: Update src→docs scope map paths from `docs/guides/**` to `docs/use-guides/**`; update release-prep fallback paths; add lean-ctx placeholder guard to docs CI requirements
- `ubiquitous-language`: Glossary published at top-level nav (`docs/glossary.md`); documentation path references updated from `docs/concepts/glossary.md` and `docs/guides/**`

## Impact

- **Docs:** `docs/`, `mkdocs.yml`, `README.md`, `docs/README.md`
- **Scripts:** `scripts/sync-docs-home.cjs` (remove/replace), `scripts/prepare-docs.cjs`, new `scripts/generate-config-docs.cjs`, CI markdown checks
- **Config UI:** `connector-spec.json` (`helpKey` strings shortened with doc links)
- **No runtime connector code changes** unless scope-map or spec sync touches settings help text generation
