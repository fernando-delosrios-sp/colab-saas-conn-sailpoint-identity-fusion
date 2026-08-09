## Why

The spec drift audit flagged **SourceService parallel map** because `fusion-run/spec.md` forbids parallel source inventory maps while `SourceService` maintains `sourcesById` alongside `run.sourcesByName`. Investigation shows this is an undocumented dual-index pattern, not a sync bug: discovery populates both atomically with the same object references, and `run.sourcesByName` intentionally narrows to managed-only sources after identity processing. Stale spec language misleads agents into treating `sourcesById` as drift requiring removal. Aligning living specs with code closes the gap without behavioral risk.

## What Changes

**Cross-service source metadata ownership**
- From: FusionRun is sole owner; SourceService must not store source metadata internally
- To: FusionRun owns run-scoped `sourcesByName` for cross-service reads; SourceService MAY maintain an id-keyed discovery index (`sourcesById`) populated atomically at discovery for ISC API operations keyed by `sourceId`
- Reason: Matches shipped access patterns (name for matching/forms; id for fetch/aggregation)
- Impact: Spec-only; non-breaking

**Post-identity `sourcesByName` lifecycle**
- From: Implied full discovery inventory for entire run
- To: After `initializeSourceReviewers`, `run.sourcesByName` SHALL contain managed sources only; fusion source metadata remains on SourceService (`sourcesById`, `_allSources`, `fusionSourceId`)
- Reason: Matches `FusionService.initializeSourceReviewers` behavior
- Impact: Spec-only

**Run snapshot source metadata**
- From: Unspecified id vs name index in snapshots
- To: `RunStateSnapshot` SHALL continue to serialize `sourcesByName` only; id-keyed lookups after restore require SourceService discovery bootstrap
- Reason: Matches current recording use; no schema migration needed
- Impact: Spec-only

**Drift report attribution**
- From: Listed under `source-service/spec.md`
- To: Primary contract in `fusion-run/spec.md` and `source-service/spec.md` source-metadata sections
- Reason: Accurate spec ownership
- Impact: Documentation only

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `fusion-run`: Clarify source metadata tiers, id-index exception, managed-only post-identity `sourcesByName`, name-only snapshot contract
- `source-service`: Document source metadata indexing (`sourcesById`, `_allSources` as discovery cache) and FusionRun write path for name-indexed run state

## Impact

- **Code**: None (spec/docs only)
- **Specs**: `openspec/specs/fusion-run/spec.md`, `openspec/specs/source-service/spec.md`
- **Verification**: `openspec validate --all --json`; ripgrep audit that living specs document dual-index pattern and post-identity managed-only `sourcesByName`
