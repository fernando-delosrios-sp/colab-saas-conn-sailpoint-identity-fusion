# Brainstorm: Align Match Merge Terminology

## Context

Exploration (`/opsx-explore`) found inconsistent vocabulary when a Fusion Match outcome joins a managed account to an **existing Fusion identity**. The codebase uses assign, link, authorized, and merge interchangeably. **Merge** is the preferred canonical term for this Match outcome. **Blend** (absorbing managed accounts into a Fusion account) and **correlation** (ISC API linking) remain separate terms.

Partial alignment already exists (`decisionProcessor`: "merge into existing"; `connector-spec` helpKey mentions "Merge") but spec, code, config, reports, forms, and history still dominate on assign/link.

## Decision chain

**Q1: Wire format — keep `assign-existing-identity` for backwards compatibility?**
- **Answer:** No. Rename to `merge-existing-identity`. No aliases.

**Q2: Config — rename labels only or keys too?**
- **Answer:** Rename both keys and labels. No backwards compatibility.
- Keys: `fusionEnableAutoAssignment` → `fusionEnableAutoMerge`, `fusionAutoAssignmentScore` → `fusionAutoMergeScore`

**Q3: Review form UI copy?**
- **Answer:** Rename ("merge with existing identity" instead of "link to existing identity").

**Q4: Fusion account history messages?**
- **Answer:** Rename (e.g. "Auto-merged … into existing identity", "Merged … by …").

**Q5: `Authorized` status entitlement wire value (`authorized`)?**
- **Answer:** Keep wire value unchanged. Redefine glossary: status after **manual merge** (not "manually correlated").

## Agreed approach

**Full rename, single vocabulary tier** — spec, code, config, UI, reports, logs, and tests in one change. No dual naming or deprecation period.

### Canonical terms (new)

| Term | Definition |
|------|------------|
| **Merge** | Match outcome: provisional/managed account combined with an existing Fusion identity |
| **Manual merge** | Reviewer-selected merge; sets `authorized` status |
| **Automatic merge** | Threshold bypass merge; sets `auto` status |

### Relationship to existing terms

```
Match outcome: MERGE
  → processing: BLEND (managed account into Fusion identity)
  → side effect: CORRELATE (if source correlation mode allows)
```

### Retired (Match context)

- automatic assignment → **automatic merge**
- assign-existing-identity → **merge-existing-identity**
- link to existing identity → **merge with existing identity**
- fusionAssignmentDecisionMap → **fusionMergeDecisionMap**
- authorizedLinkDecision → **mergeDecision**
- automaticAssignment (property) → **automaticMerge**
- autoAssignedIdentityIds / markAutoAssigned / autoAssigned event → **autoMerged** variants

### Out of scope

- Renaming **blend** / **attribute merge** / **score blend**
- Renaming **correlation** / **correlation mode**
- Renaming entitlement **assignment** for reviewer/report actions
- Changing status wire values `authorized`, `auto`

## Trade-offs accepted

- **Breaking change** for stored ISC configs (old keys), report/dry-run JSON, email templates, and golden test artifacts — acceptable per stakeholder decision.
- **Large touch surface** (~40+ files) — mitigated by mechanical rename + full test suite.
- **Config migration on read** via `migrateConfigKey` (old → new keys once) is still recommended so existing tenant configs load without manual JSON edits; this is not dual-runtime support.
