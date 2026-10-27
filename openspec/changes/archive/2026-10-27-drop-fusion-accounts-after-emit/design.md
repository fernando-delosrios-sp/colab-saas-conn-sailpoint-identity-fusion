## Context

In production environments managing 100k+ identities and managed accounts, memory spikes during account aggregation (`accountList`) present operational stability risks. Currently, all identities refreshed or processed during Phase 3 and Phase 4 remain resident as full `FusionAccount` instances in `FusionRun` until Phase 5 (Output), when they are finally formatted as `ISCAccount` and sent to ISC.

Additionally, `MatchingService.buildTrigramIndex` stores these full `FusionAccount` objects in its candidate roster (`blockingIdentityRoster`). Each instance holds extensive state: raw layer accounts, source attribute snapshots, decision histories, and multiple Set structures.

This design introduces a two-tier memory reduction strategy:
1. Candidate decoupling: Storing lightweight `MatchCandidateRecord` projections containing only the attributes required by matching rules, review forms, and reporting.
2. An opt-in Advanced Option (`fusionDropAccountsAfterEmit`) that formats and sends `ISCAccount`s immediately during identity processing, dropping the `FusionAccount` instances before the uncorrelated Match sweep begins, and re-fetching/re-emitting on auto-match.

## Goals / Non-Goals

**Goals:**
- Dramatically reduce peak heap consumption and GC overhead during the uncorrelated Match sweep for large tenants.
- Provide a risk-free, opt-in setting (`fusionDropAccountsAfterEmit`, default `false`) ensuring existing deployments remain unaffected.
- Maintain full fidelity of Fusion Review Forms and Aggregation Reports without requiring additional network roundtrips.
- Support ISC last-write-wins streaming by re-emitting auto-matched accounts when early emission is enabled.

**Non-Goals:**
- Modifying default single-phase Phase 5 emission when the toggle is disabled.
- Introducing a persistent on-disk scratch database for dropped accounts.
- Changing match scoring algorithms, thresholds, or form approval workflows.

## Decisions

### D1: Opt-In Advanced Configuration Toggle
- **Choice**: Introduce `fusionDropAccountsAfterEmit` as a boolean toggle under Advanced Options in `connector-spec.json`, defaulting to `false`.
- **Reason**: Guarantees zero regressions for existing deployments while allowing tenants with memory-constrained environments or massive identity rosters to opt in.
- **Considered alternatives**:
  - Making early emit unconditional: Rejected because auto-matches require API re-fetching, which is suboptimal for runs with tens of thousands of auto-matches.

### D2: Decoupled Candidate Projection (`MatchCandidateRecord`)
- **Choice**: Candidate identities in `MatchingService` and `blockingIdentityRoster` use `MatchCandidateRecord`:
  ```ts
  interface MatchCandidateRecord {
      readonly identityId: string
      readonly identityName: string
      readonly attributes: Record<string, string>
  }
  ```
  The attribute bag is computed as the union of `matchingConfigs` attributes, `fusionFormAttributes`, and `reportAttributes`.
- **Reason**: Allows FormService and ReportBuilder to render rich HTML candidate views and report rows with zero network calls and zero dependency on heavy `FusionAccount` objects.
- **Considered alternatives**:
  - Keeping full `FusionAccount`s in candidate rosters: Rejected; keeps heavy objects pinned in heap.
  - Minimal matching-only attributes without form attributes: Rejected; would require FormService to make dozens of API calls to build review forms.

### D3: On-Demand Rebuild via ISC API for Auto-Matches
- **Choice**: When early emit is enabled and an uncorrelated account triggers an `exact-match` (auto-merge), re-fetch the target identity via `IdentityService.fetchIdentityById`, re-assemble the `FusionAccount` with the new layer, re-evaluate definitions, and emit the updated `ISCAccount` to `res.send()`.
- **Reason**: Keeps memory strictly minimal during the sweep without maintaining a secondary local cache. In standard runs, auto-matches represent a small percentage of total accounts (~1–5%).
- **Considered alternatives**:
  - Local disk/temp file scratch cache: Rejected; adds unnecessary file I/O complexity and serialization overhead.
  - Refusing auto-matches in early emit mode: Rejected; breaks core functional equivalence between modes.

### D4: Streaming Output Compatibility
- **Choice**: Emit accounts via `res.send()` as soon as they are assembled when the toggle is enabled; in Phase 5, only accounts that were not previously emitted (such as newly created authoritative non-match accounts) are streamed.
- **Reason**: Re-emitting an updated record for an auto-matched account adheres to standard ISC aggregation last-write-wins semantics per `nativeIdentity`.
- **Considered alternatives**:
  - Delaying output until after matching: Defeats the primary goal of freeing memory before the match sweep.

## Risks / Trade-offs

- [Risk] An aggregation run with early emit enabled experiences an unexpectedly high volume of auto-matches, resulting in many individual `fetchIdentityById` API calls.
  -> Mitigation: The feature is an opt-in Advanced Option with explicit documentation explaining that it is optimized for high-volume identity pools with low-to-moderate auto-match ratios. If heavy auto-matching is expected, the operator leaves the toggle `false`.
- [Trade-off] When early emit is enabled, accounts that are auto-matched are streamed twice in the same aggregation response (once initially, once updated).
  -> Reason for acceptance: ISC aggregation ingestion processes stream records on a last-write-wins basis by `nativeIdentity`.

## Migration Plan

N/A — This change is non-breaking and purely opt-in via connector configuration.

## Open Questions

None.
