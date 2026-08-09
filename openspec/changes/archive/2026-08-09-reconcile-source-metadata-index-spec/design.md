# Design: Reconcile Source Metadata Index Spec

## Context

Source metadata in Identity Fusion uses multiple indexes with different lifecycles:

```
fetchAllSources (sourceDiscovery.ts)
  ├─ SourceService._allSources[]     full ordered discovery list
  ├─ SourceService.sourcesById       Map<id, SourceInfo>  (includes fusion)
  └─ FusionRun.sourcesByName         Map<name, SourceInfo> (all sources at discovery)

processIdentities → initializeSourceReviewers
  └─ FusionRun.sourcesByName         cleared; managed sources only
```

Cross-service consumers (MatchingService, FormService, analysis recorder) read `run.sourcesByName` by account `sourceName`. SourceService fetch/aggregation paths read `sourcesById` by ISC `sourceId`. The drift audit conflated this with managed-account inventory duplication (already resolved).

This change is **spec-only** — no production code edits.

## Goals / Non-Goals

**Goals:**
- Document the dual-index pattern as intentional architecture
- Specify managed-only `sourcesByName` after reviewer initialization
- Clarify name-only snapshot contract for source metadata
- Close medium-severity drift item from `.scratch/spec-drift-report.md`

**Non-Goals:**
- Removing `sourcesById` or consolidating `_allSources` (optional future simplification)
- Adding `sourcesById` to `RunStateSnapshot`
- Moving all source metadata ownership to FusionRun
- Updating `.scratch/spec-drift-report.md` (local scratch artifact)

## Decisions

### D1: Spec-only reconciliation

**Choice:** Update living specs via OpenSpec delta; no code changes.

**Rationale:** Maps are co-populated at discovery; no observed sync bugs. Spec alignment has zero deployment risk.

**Alternatives rejected:**
- Remove `sourcesById` — small code churn, not required to close drift
- FusionRun owns all indexes — large refactor, no user benefit

### D2: Post-identity managed-only `sourcesByName`

**Choice:** Document that `initializeSourceReviewers` intentionally excludes the fusion connector source from `run.sourcesByName`.

**Rationale:** Matching, deferred-matching flags, record-source rules, and reviewer registration operate on managed sources. Fusion source access continues via SourceService id paths and `fusionSourceId`.

**Alternatives rejected:**
- Keep fusion in map — requires FusionService code change and explicit non-managed guards in matching helpers

### D3: Name-only snapshots

**Choice:** `RunStateSnapshot` continues to serialize `sourcesByName` only; no `sourcesById` field.

**Rationale:** Recording captures run state for debug; consumers resolve sources by name. Id-keyed operations after restore require `fetchAllSources` to rebuild SourceService indexes.

**Alternatives rejected:**
- Extend snapshot schema — migration cost with no current production restore path

### D4: Narrow drift scope

**Choice:** `_allSources` is SourceService discovery session cache, out of cross-service drift scope. Reconcile `sourcesById` vs `run.sourcesByName` contract only.

**Rationale:** `_allSources` and `sourcesById` are assigned together in one discovery function; no hand-sync across service boundaries.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Future code assumes fusion in `sourcesByName` after identity phase | Spec scenario documents managed-only state; prefer `getFusionSource()` / `fusionSourceId` |
| Spec readers expect code refactor | Proposal and design state explicitly: spec-only |
| Snapshot readers misread post-identity map as full discovery | Snapshot scenario notes phase-dependent contents |

## Migration Plan

1. Apply delta specs to living specs under `openspec/specs/` (archive step at change completion)
2. Run `openspec validate --all --json`
3. Ripgrep audit: living specs describe dual-index and managed-only lifecycle
4. No deploy, rollback, or feature flag — documentation merge only

## Open Questions

None — user approved all thread decisions during explore.
