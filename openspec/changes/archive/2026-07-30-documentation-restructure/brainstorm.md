# Documentation restructure — brainstorming decision log

## Background

Identity Fusion NG MkDocs site is poorly structured and partially stale. Issues identified:

- Placeholder corruption in `docs/guides/matching-algorithms.md` and `docs/CHANGELOG.md`
- Home syncs entire README (~465 lines) via `scripts/sync-docs-home.cjs`
- Glossary exists at `docs/concepts/glossary.md` but is not in nav
- Guides duplicate README config tables; boundary between reference and how-to is unclear
- `docs/concepts/map-define-match.md` orphaned; operation modes referenced from broken anchors

## Target top-level sections (user decision)

1. Home
2. Getting started
3. Configuration
4. Use guides
5. Glossary
6. Technical reference

## Decision chain

### Q1: Configuration vs Use guides split?

**Options considered:**
- A) Configuration = field/menu reference; Use guides = workflows & scenarios
- B) Configuration = all ISC settings; Use guides = run-time usage
- C) Configuration = thin overview only; depth stays in guides

**Decision:** A — Configuration = literal connector-spec.json field reference; Use guides = evolved configuration guides + run/troubleshoot content.

### Q2: Where do concepts live?

**Decision:** No standalone Concepts section.
- Individual terms → Glossary
- Map-Define-Match framework → **embedded in Home** (`index.md`), retire `concepts/map-define-match.md`
- Operation modes → **embedded in Getting started Overview** (not Home)
- Complex concepts (algorithms, proxy architecture, log formats) → relevant Use guide or Technical reference

### Q3: Which guides make it to Use guides?

**Initial roster:** map, define, match, algorithms, sources, connection tuning, testing, dry-run, troubleshooting, migration.

**Refinements:**
- Split `match.md` into **Matching identities** + **Review forms and reviewers**
- Proxy mode: **no Use guide** — Configuration reference (fields) + Technical reference (deployment manual)
- testing-process: standalone Use guide (not under Change management)

### Q4: Use guides subsection structure?

**Rejected:** "Core pipeline" grouping.

**Decision:** Four subsections, all following **`[Topic] guides`** naming (mirrors parent "Use guides"):

| Subsection | Guides |
|---|---|
| **Configuration guides** | map, define, match, review, algorithms, sources |
| **Operation guides** | dry-run, connection/observability tuning |
| **Validation and troubleshooting guides** | testing-process, troubleshooting |
| **Deployment guides** | migration from v1 |

Folder slugs omit `-guides` suffix: `use-guides/configuration/`, `operation/`, `validation-and-troubleshooting/`, `deployment/`.

### Q5: Configuration source of truth?

**Decision:** Generate Configuration docs from `connector-spec.json` + `src/data/config/settings/*.ts`. Slim inline `helpKey` strings in spec; link to generated docs. Remove README config tables entirely.

**Approach chosen:** Spec-driven generation (not manual README extraction, not README fragment sync).

## Design trade-offs

| Approach | Pros | Cons |
|---|---|---|
| A: Spec-driven Configuration + guide rewrite | Single source of truth; guides can't drift | Requires doc-generation script |
| B: Nav-first without generation | Faster | Config/spec drift |
| C: README fragment sync | One edit location | Conflicts with slim README intent |

**Recommendation:** A

## Content boundary rules

- **Configuration (top-level):** "What is this field?" — generated reference
- **Use guides → Configuration guides:** "How do I set up Map, Define, Match, sources?"
- **Use guides → Operation guides:** day-to-day running, monitoring, dry-run
- **Use guides → Validation and troubleshooting guides:** pre-go-live testing + symptom recovery
- **Use guides → Deployment guides:** migration, environment stand-up
- **Technical reference:** connector operations, schema, Velocity API, observability log formats, proxy deployment, chain recording, changelog

## README consequence

Slim to repo landing page: pitch, docs site link, read-next table. Remove config tables, dry-run API, schema, chain recording (moved to docs site sections).

## Prerequisites before migration

1. Restore corrupted files from git

## Acceptance criteria (agreed)

- Six top-level nav sections
- Home embeds Map-Define-Match inline; no separate concepts page
- Getting started Overview embeds operation modes
- Configuration generated from connector-spec.json
- 12 Use guide pages (1 index + 11 guides) in four `[Topic] guides` subsections
- Proxy: Configuration + Technical reference only
- Glossary in nav
- `npm run ci:docs-review` passes

