# Brainstorm: Reconcile Source Metadata Index Spec

## Context

Spec drift audit (2026-08-08) flagged **SourceService parallel map** as medium severity: `source-service/spec.md` vs `fusion-run/spec.md` imply SourceService must not maintain parallel inventory maps, but `SourceService` holds `sourcesById` alongside `run.sourcesByName`.

Investigation shows three SourceService-side structures plus one FusionRun map:

| Structure | Key | Owner | Role |
|---|---|---|---|
| `_allSources` | ordered list | SourceService | discovery cache; `allSources` / `managedSources` getters |
| `sourcesById` | ISC source id | SourceService | fetch-by-id, aggregation, rebuild |
| `run.sourcesByName` | source name | FusionRun | matching, forms, cross-service lookups |
| `sources` (config) | static | SourceService ctor | fallback in `getSourceConfig` |

Discovery (`sourceDiscovery.ts`) populates all three atomically with the same `SourceInfo` object references. Managed accounts already follow FusionRun-only inventory (no `managedAccountsAllById`).

After `processIdentities()`, `FusionService.initializeSourceReviewers()` clears `run.sourcesByName` and repopulates **managed sources only** — fusion source remains in `sourcesById` / `_allSources`.

Recording snapshots (`RunStateSnapshot`) include `sourcesByName` only; `restore()` does not rebuild `sourcesById`.

## Decision Chain

### Q1: Should `run.sourcesByName` exclude fusion source after `initializeSourceReviewers`?

**Options:**
- A — Yes, by design (document current behavior)
- B — No, keep full discovery map (code change)

**Decision:** **A.** `sourcesByName` is a matching/reviewer workspace for managed sources. Fusion operations use `fusionSourceId`, `getFusionSource()`, and `sourcesById`. `getSourceConfig()` falls back to static connector config when the name map misses.

### Q2: Should run snapshots include an id index?

**Options:**
- A — Name-only sufficient (status quo)
- B — Add `sourcesById` to snapshot schema

**Decision:** **A.** Consumers look up by `account.sourceName`. Recording/debug use cases do not require id-index restore without re-running `fetchAllSources`. No schema migration.

### Q3: Is `_allSources` part of the drift scope?

**Options:**
- A — Scope = `sourcesById` vs `run.sourcesByName` only; `_allSources` is internal discovery cache
- B — Treat all SourceService source structures as drift

**Decision:** **A.** `_allSources` and `sourcesById` are co-populated in-process with negligible sync risk. Meaningful cross-service contract is `run.sourcesByName` lifecycle vs SourceService id lookups.

### Q4: Reconcile by changing code or specs?

**Options:**
- A — Spec-only: document dual-index pattern and phase-scoped `sourcesByName`
- B — Remove `sourcesById`; derive from `_allSources`
- C — Move all source metadata to FusionRun

**Decision:** **A (spec-only).** Matches shipped architecture; zero behavioral risk. Optional follow-up PR for Option B (code simplification) is out of scope.

## Trade-offs

| Choice | Upside | Downside |
|---|---|---|
| Spec-only (A) | Closes drift quickly; no deployment risk | Three views remain; requires clear spec tiers |
| Keep fusion out of post-identity map (Q1-A) | Matches matching/reviewer semantics | Future code must not assume fusion in `sourcesByName` after identity phase |
| Name-only snapshots (Q2-A) | No schema change | Mid-run replay by id requires `fetchAllSources` bootstrap |

## Success Criteria

- `fusion-run/spec.md` documents id-index exception, managed-only `sourcesByName` after reviewer init, and name-only snapshot contract
- `source-service/spec.md` documents `sourcesById` as id-keyed discovery index and cross-service read path via `run.sourcesByName`
- `openspec validate --all` passes after merge
- No production code changes required

## User Approval

User confirmed defaults during `/opsx-explore`: exclude fusion post-identity, name-only snapshots, narrow scope to `sourcesById` vs `run.sourcesByName`. User said "do that" to capture as change proposal.
