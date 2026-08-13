# Brainstorm: Slim connector-spec inline help

## Context

Identity Fusion NG stores ISC in-app configuration help in `connector-spec.json` via `helpKey` (per-field) and `sectionHelpMessage` (section headers). The July 2026 documentation restructure introduced:

- Generated Configuration reference (`scripts/generate-config-docs.cjs` → `docs/configuration/*.md`)
- A one-off `scripts/slim-connector-spec-helpkeys.cjs` for field-level help
- Use guides and technical reference (`velocity-context.md`, etc.) as the canonical deep-dive surfaces

**Current state (Aug 2026):**

| Surface | Count / size | Issue |
| --- | --- | --- |
| `helpKey` | ~90 fields | Most follow slim pattern (`Short summary. See [Label](configuration/slug.md#anchor).`); ~15 still exceed 200 chars |
| `sectionHelpMessage` | 12 sections | Two sections are ~4k chars (Normal/Unique Attribute Definitions); others 280–670 chars with bullet lists |
| `openspec/specs/documentation-site/spec.md` | — | Missing archived requirement that helpKey strings be concise with doc links |
| Doc generator | `SECTION_INTRO_OVERRIDES` | Already overrides Normal/Unique section intros — generated docs do **not** depend on verbose sectionHelpMessage for those sections |

**User request:** Slim down `connector-spec.json` inline help; reference docs carry the detail.

## Decision chain

### Q1: What is in scope?

**Decision:** Documentation-only change — edit `connector-spec.json` strings, extend doc generator/lint scripts, and patch reference docs only where slimmed inline text drops unique facts not already documented.

**Out of scope:** Runtime connector behavior, i18n migration to `CONNIDENTITYFUSIONNG.json`, ISC UI rendering changes.

### Q2: Which inline surfaces to slim?

**Decision:** Both `helpKey` and `sectionHelpMessage`.

**Rationale:** Field help was partially slimmed; section headers remain the worst UX offenders (scroll walls in ISC). Both surfaces serve the same operator audience.

### Q3: Where does relocated prose go?

**Decision:** Three-tier routing (recommended — Approach B):

1. **ISC inline** — one sentence purpose + markdown link
2. **Configuration reference** — field semantics via generator (`FIELD_EXPLANATIONS`, `SECTION_INTRO_OVERRIDES`)
3. **Use guides / technical reference** — scenarios and API depth (`defining-attributes.md`, `velocity-context.md`, etc.)

**Rejected alternatives:**

- **A — Slim inline only, no doc updates:** Risk losing facts for sections without `SECTION_INTRO_OVERRIDES`; fails completeness check.
- **C — Move all help to i18n keys now:** Larger migration; doesn't reduce ISC verbosity unless keys are also shortened; defer.

### Q4: Length limits?

**Decision:**

| Field | Max plain-text length | Structure |
| --- | --- | --- |
| `helpKey` | 220 characters | ≤1 short sentence + `See [Label](configuration/<slug>.md#<anchor>).` |
| `sectionHelpMessage` | 320 characters | ≤2 sentences + link to primary Use guide or Configuration reference section |

HTML allowed in `sectionHelpMessage` (`<strong>`, `<code>`, single `<br>`); no bullet lists inline.

### Q5: How to prevent regression?

**Decision:** Add `scripts/check-connector-spec-help.cjs` run from `npm run lint` (or `docs:prepare`) that fails CI when any help string exceeds limits or lacks a doc link.

Extend `slim-connector-spec-helpkeys.cjs` → `slim-connector-spec-help.cjs` to also rewrite `sectionHelpMessage` using `USE_GUIDE_BY_SECTION` / `SECTION_INTRO_OVERRIDES` one-liners.

### Q6: Spec impact?

**Decision:** Modify existing `documentation-site` capability — add/reinstate requirements for concise inline help on both surfaces; no new capability.

## Agreed design summary

1. Audit all 105 help strings; classify as already-slim vs needs-edit.
2. For verbose `sectionHelpMessage`, replace with short blurb + link (e.g. Normal Attribute Definitions → link to `defining-attributes.md` + `velocity-context.md`).
3. Re-run extended slim script; hand-fix edge cases (cardList fields without standard anchors).
4. Expand `SECTION_INTRO_OVERRIDES` for any section where generated config pages would otherwise lose intro prose.
5. Diff-check verbose removed text against `velocity-context.md` / use guides — patch gaps only.
6. Add lint script + unit test for limits.
7. Update `documentation-site` spec delta with enforceable scenarios.

## Trade-offs

- **[Trade-off] Duplication between SECTION_INTRO_OVERRIDES and slim sectionHelpMessage** → Acceptable: ISC and MkDocs serve different contexts; overrides stay the richer generated-doc intro.
- **[Risk] Broken markdown links in ISC** → Mitigation: lint validates link prefix `configuration/` or `../use-guides/` patterns; spot-check in ISC UI during verify.
- **[Risk] Operators lose at-a-glance Velocity helper list in ISC** → Mitigation: one-line pointer to velocity-context.md; that page already documents helpers comprehensively.
