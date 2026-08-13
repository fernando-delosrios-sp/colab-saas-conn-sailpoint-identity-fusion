## Context

Identity Fusion NG exposes configuration help in ISC through `connector-spec.json`. The documentation restructure (2026-07) established MkDocs as the deep-reference surface and partially slimmed per-field `helpKey` strings. Section-level `sectionHelpMessage` values were never reduced — especially Attribute Definition sections that embed full Velocity API catalogs (~4k characters each).

The doc generator (`scripts/generate-config-docs.cjs`) already decouples published Configuration reference intros from inline spec text for Normal and Unique Attribute Definitions via `SECTION_INTRO_OVERRIDES`. Other sections still mirror `sectionHelpMessage` into generated pages when no override exists.

**Stakeholders:** Operators configuring sources in ISC; maintainers editing connector-spec and docs.

## Goals / Non-Goals

**Goals:**

- Every ISC inline help string (`helpKey`, `sectionHelpMessage`) is scannable in one glance
- Inline help links operators to Configuration reference, Use guides, or Technical reference for detail
- CI prevents reintroduction of verbose inline help
- No loss of documentation coverage after slimming

**Non-Goals:**

- Migrating help text to i18n translation keys
- Changing connector runtime behavior or settings schema
- Rewriting Use guides wholesale
- Altering ISC platform help rendering

## Decisions

### D1: Slim both help surfaces, not just fields

- **Choice:** Edit `helpKey` and `sectionHelpMessage` in `connector-spec.json`
- **Reason:** Section headers cause the worst ISC UX; field help is already mostly slim
- **Considered alternatives:** Fields-only (incomplete); migrate to i18n (out of scope)

### D2: Three-tier content routing

- **Choice:** ISC = one-liner + link; Configuration reference = field semantics via generator; Use guides / reference = depth
- **Reason:** Matches documentation IA established in documentation-restructure
- **Considered alternatives:** Duplicate full text in both ISC and docs (rejected — maintenance burden)

### D3: Enforceable length limits

- **Choice:** `helpKey` ≤220 chars; `sectionHelpMessage` ≤320 chars plain text; mandatory markdown link
- **Reason:** ISC tooltip/panel space is limited; limits are testable
- **Considered alternatives:** Character-count only without link requirement (allows orphan summaries)

### D4: Generator overrides for generated doc intros

- **Choice:** Expand `SECTION_INTRO_OVERRIDES` in `generate-config-docs.cjs` for sections whose slimmed inline text would be too terse for MkDocs
- **Reason:** ISC and published docs have different density needs; overrides already exist for Normal/Unique definitions
- **Considered alternatives:** Keep verbose text in connector-spec for generator consumption (rejected — defeats ISC slimming goal)

### D5: Lint script in CI

- **Choice:** New `scripts/check-connector-spec-help.cjs`; invoke from `npm run lint` or `npm run docs:prepare`
- **Reason:** One-off slim script is not sufficient for ongoing maintenance
- **Considered alternatives:** Manual review only (rejected — already regressed once)

### D6: Extend existing slim script

- **Choice:** Extend `slim-connector-spec-helpkeys.cjs` to handle `sectionHelpMessage`, optionally rename to `slim-connector-spec-help.cjs`
- **Reason:** Reuses anchor/slug logic and `USE_GUIDE_BY_SECTION` mappings from doc generator patterns
- **Considered alternatives:** Hand-edit all 12 sections (error-prone)

## Risks / Trade-offs

- **[Risk] ISC markdown links not clickable or wrong path** → Mitigation: Use same relative paths as existing slim helpKeys (`configuration/<slug>.md#<anchor>`); manual ISC spot-check in verify
- **[Risk] Unique facts lost when deleting verbose inline text** → Mitigation: Audit diff against `velocity-context.md` and use guides; patch reference docs before merging
- **[Trade-off] SECTION_INTRO_OVERRIDES duplicates slim section blurbs** → Accepted: MkDocs intros can be slightly richer than ISC panels
- **[Trade-off] Plain-text length limits ignore HTML tag overhead** → Accepted: strip HTML for measurement; limits target readable prose

## Migration Plan

1. Run audit script to list violations
2. Expand `SECTION_INTRO_OVERRIDES` for sections that need richer generated intros
3. Run extended slim script; hand-fix exceptions
4. Audit removed prose vs reference docs; patch gaps
5. Add check script + wire into lint
6. Run `npm run docs:prepare`, `npm run lint`, `npm test`
7. Ship with next connector release — no data migration; operators see shorter ISC help immediately on spec upload

**Rollback:** Revert `connector-spec.json` and script changes; no runtime state affected.

## Open Questions

- None blocking — length limits and routing tiers are agreed in brainstorm.
