## Context

During Phase 2 (Fetch), `IdentityService.fetchIdentities` paginates the ISC Search API (`/v3/search/identities`) using `paginateSearchApiGenerator`. Each `IdentityDocument` returned by ISC contains a rich JSON representation:
- `attributes`: 50–120 key-value pairs representing all identity profile attributes configured in the tenant.
- `accounts`: An array of account summary objects representing every account linked to this identity across all ISC sources.

In enterprise tenants with 100k+ identities, this results in millions of redundant objects loaded into V8 heap. These documents remain resident in `FusionRun.identityMap` throughout Phase 2, Phase 3, and the first half of Phase 4 until `identities.clear()` is called.

The connector already implements attribute pruning for managed source accounts (`pruneManagedAccountAttributes` in `referencedAttributeSet.ts`), where unreferenced attributes are dropped on ingest. This design extends the pruning pattern to `IdentityDocument`s.

## Goals / Non-Goals

**Goals:**
- Eliminate unreferenced attributes and unmanaged account references from `IdentityDocument` payloads upon arrival.
- Reduce `FusionRun.identityMap` memory footprint by 60–80%.
- Maintain 100% functional equivalence for identity layer construction, correlation checks, and reviewer display name resolution.
- Apply pruning consistently across bulk fetch (`fetchIdentities`) and single on-demand hydration (`fetchIdentityById`).

**Non-Goals:**
- Altering the upstream Search API query structure or queryResultFilter.
- Modifying managed source account pruning (which already functions correctly).

## Decisions

### D1: Prune at the Ingestion Page Boundary
- **Choice**: Execute pruning inside `IdentityService` within the `forEachChunked` page iteration loop, prior to registering the document in `FusionRun.addIdentity`.
- **Reason**: Discards unneeded strings and nested objects immediately so they become eligible for young-generation garbage collection before the next page is fetched.
- **Considered alternatives**:
  - Pruning lazily when building `FusionAccount`: Rejected; leaves the full raw JSON resident in memory during the entire Fetch and Refresh phases.

### D2: Attribute Filtering Strategy
- **Choice**: Filter `identity.attributes` against the run's `ReferencedAttributeSet`. Always retain standard identity keys: `displayName`, `email`, `name`, `id`, `firstname`, `lastname`, `uid`, `cloudLifecycleState`.
- **Reason**: `ReferencedAttributeSet` already computes the complete union of schema attributes, mapping inputs, Velocity template references, and matching rule attributes. Retaining standard fields ensures display label resolvers and email notification formatters function without missing fields.
- **Considered alternatives**:
  - Hardcoding a fixed list of identity attributes: Rejected; would break custom Velocity templates or mappings that reference tenant-specific identity attributes.

### D3: Linked Account Filtering Strategy
- **Choice**: Filter `identity.accounts` to keep only accounts where:
  1. `account.source?.id === fusionSourceId`, OR
  2. `account.source?.name` matches a configured managed source name.
  For matching accounts, prune fields to `{ id, nativeIdentity, name, disabled, source: { id, name } }`.
- **Reason**: The connector only inspects `identity.accounts` for two purposes: checking if the identity already has an account on the Fusion source (for orphan / conflict checks), and identifying accounts on configured managed sources. Accounts on third-party sources (e.g. ServiceNow, AWS, Slack) are never accessed.
- **Considered alternatives**:
  - Dropping `identity.accounts` entirely: Rejected; breaks `buildFromIdentity` and duplicate Fusion account detection.

## Risks / Trade-offs

- [Risk] A custom Velocity expression accesses an obscure identity attribute not discovered in `ReferencedAttributeSet`.
  -> Mitigation: `buildReferencedAttributeSet` scans all Velocity template texts with regex to extract referenced variable names; ensuring the identity attribute set includes all referenced variables prevents omissions.
- [Trade-off] Additional microtask CPU time per page to filter attributes and accounts.
  -> Reason for acceptance: Filtering takes negligible CPU (<5ms per 250-item page) and saves hundreds of megabytes of heap, dramatically reducing GC pause times.

## Migration Plan

N/A — Purely internal memory optimization with no public API or configuration changes.

## Open Questions

None.
