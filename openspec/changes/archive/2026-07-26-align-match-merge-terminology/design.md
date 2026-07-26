## Context

The connector's ubiquitous language spec defines Match, automatic assignment, and review decisions using assign/link vocabulary. Implementation spreads this across ~40 files: config keys in `connector-spec.json`, `FusionDecision.automaticAssignment`, report wire value `assign-existing-identity`, form copy, history strings, and `FusionRun.autoAssignedIdentityIds`. A prior rename (`fusionMergingExactMatch` → `fusionEnableAutoAssignment`) shows config keys do change; this change completes the vocabulary shift to **merge**.

Stakeholder decisions (2026-07-26): full rename, no backwards-compatible aliases for wire format or config keys; review form and history strings renamed; `authorized` status wire value retained.

## Goals / Non-Goals

**Goals:**
- Establish **Merge**, **Manual merge**, and **Automatic merge** as canonical Match-outcome terms in spec, glossary, code, config, UI, reports, and logs
- Rename all assign/link/automatic-assignment identifiers and user-facing strings in the Match-outcome path
- Distinguish merge (decision) from blend (structural absorption) and correlation (ISC API) in ubiquitous language
- Keep status entitlement wire values `authorized` and `auto` unchanged

**Non-Goals:**
- Renaming blend, attribute merge, score blend, or correlation vocabulary
- Renaming reviewer/report entitlement **assignment**
- Changing Match scoring algorithms or thresholds behavior
- Dual naming or deprecation shims for report JSON or config keys

## Decisions

### D1: Canonical term is **merge** (not assign or link)

- **Choice:** Use **merge** for Match outcomes that join to an existing Fusion identity
- **Reason:** Matches product intent; already partially used in code comments and connector help text
- **Considered alternatives:** Keep "assignment" (rejected — conflates with entitlements); keep "link" (rejected — conflates with correlation)

### D2: Breaking wire and config renames (no aliases)

- **Choice:** `merge-existing-identity`, `fusionEnableAutoMerge`, `fusionAutoMergeScore`; remove runtime support for old names
- **Reason:** Stakeholder explicitly rejected backwards compatibility
- **Considered alternatives:** Alias period for report templates (rejected)

### D3: Config read migration only

- **Choice:** `migrateConfigKey` in `matchingSettings.readSettings`: `fusionEnableAutoAssignment` → `fusionEnableAutoMerge`, `fusionAutoAssignmentScore` → `fusionAutoMergeScore`, and retire `fusionMergingExactMatch` → `fusionEnableAutoMerge`
- **Reason:** Existing ISC stored configs load without manual JSON surgery; not dual emission
- **Considered alternatives:** No migration (rejected — unnecessary operator pain)

### D4: Status wire values frozen

- **Choice:** Keep `authorized` and `auto` entitlement strings; update glossary prose only
- **Reason:** Schema/ISC search filters may depend on wire values
- **Considered alternatives:** Rename to `merged` (rejected by stakeholder)

### D5: Internal run state rename

- **Choice:** `autoAssignedIdentityIds` → `autoMergedIdentityIds`, `markAutoAssigned` → `markAutoMerged`, snapshot `autoMergedIds`, event `autoMerged`
- **Reason:** Consistency through stack including heartbeat and fusion-run snapshot
- **Considered alternatives:** Leave internal names (rejected — violates code-uses-canonical-terms requirement)

### D6: Preserve blend as separate term

- **Choice:** Document in ubiquitous language that every merge triggers a blend, but blend also occurs outside merge (correlated sweep)
- **Reason:** Avoid collapsing two concepts established in fusion-blends-report change

## Risks / Trade-offs

- [Risk] Golden test artifacts and external report parsers break → Mitigation: update all `*.expected.json` and document breaking change in CHANGELOG
- [Risk] Missed string in docs or comments → Mitigation: repo-wide search for retired patterns before merge; lint via `npm test`
- [Risk] Large PR hard to review → Mitigation: group commits by layer (spec → config → code → docs → tests)
- [Trade-off] Config key rename breaks API docs referencing old keys → Accepted; update docs in same change

## Migration Plan

1. Ship as single connector version bump (breaking change noted in CHANGELOG)
2. On config read, migrate old keys to new keys (one-way)
3. Operators with custom report templates: replace `assign-existing-identity` → `merge-existing-identity`, `automaticAssignment` → `automaticMerge`
4. No rollback strategy beyond git revert — intentional breaking release
5. Acceptance: `npm test` and `npm run lint` pass; glossary and spec aligned; no remaining retired terms in `src/` or `docs/` (except `migrateConfigKey` source keys and archived changes)

## Open Questions

_(none — stakeholder answered all exploration questions)_
