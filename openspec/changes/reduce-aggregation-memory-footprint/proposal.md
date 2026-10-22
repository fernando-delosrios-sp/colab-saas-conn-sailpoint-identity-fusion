## Why

Large aggregations exhaust the ~4GB connector runtime heap because every managed source account body and the raw Fusion account fetch cache stay fully resident from Fetch through Output. Managed source accounts arrive with wide attribute payloads, yet only config-referenced attributes are ever read; claimed account retention inherits those wide bodies; and the raw Fusion account cache sits unused after Refresh rebuilds the derived Fusion accounts. Pruning unreferenced attributes at ingest and clearing the raw Fusion cache after Refresh cuts peak heap without changing aggregation behavior.

## What Changes

**Managed source account attribute pruning at Bulk ingest**
- From: Fetch registers managed source accounts into the work queue with the full `attributes` payload returned by the ISC Accounts API.
- To: Fetch prunes each managed source account's `attributes` to the **referenced attribute set** (Fusion schema names, `attributeMaps[].existingAttributes`, attribute names referenced in Define/unique/form Velocity templates, match rule attribute names) during Bulk ingest, after Accounts API filter, Accounts JMESPath filter, and machine-account discard. System fields (`id`, `name`, `nativeIdentity`, `sourceId`, `sourceName`, `identityId`, `isMachine`, `modified`, `disabled`, `uncorrelated`) are never pruned. Work queue, claimed account retention, and source snapshot materialization all inherit the pruned body.
- Reason: unreferenced attributes are never read by Map, Define, Match, or output, but are paid for per account and amplified into `attributeBag.sources` snapshots.
- Impact: non-breaking for ISC account output; pruning is **enforced** (no configuration surface) on the condition of zero functionality loss — correctness rests on the conservative referenced attribute set, which keeps any attribute name textually present in any config template string. Recordings still capture raw pages at the client layer.

**Raw Fusion account fetch cache cleared after Refresh**
- From: `fusionAccountsByNativeIdentity` (raw SDK account bodies) stays resident until after the report epilogue, though its only accountList reader is Refresh.
- To: the cache is cleared at the end of Refresh (after `processFusionAccounts`), except in record mode; the existing late clear remains as the record-mode safeguard.
- Reason: after Refresh, every consumer works on derived Fusion accounts, the unique-value registry, FusionRun maps, or `managedAccountInventory` — including Output-time JIT unique attribute refresh and report account-id resolution.
- Impact: non-breaking; single-account operations fetch their own raw copy and are unaffected.

**Unchanged**
- Derived Fusion accounts live until Output (updates from Match still apply)
- Claim-only absorb and deferred rematerialization semantics
- Filter behavior (Accounts API filter, JMESPath filter, machine discard) — all evaluate before pruning
- Record-mode capture fidelity at the client layer

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `source-service`: managed source account attribute pruning during Bulk ingest (enforced, no opt-out)
- `account-list-operation`: raw Fusion account fetch cache cleared after Refresh (non-record mode)
- `ubiquitous-language`: **Attribute pruning** and **Referenced attribute set**

## Impact

- **Code:** `src/services/sourceService/managedAccountFetcher.ts` (prune at registration), `src/services/sourceService/sourceService.ts` (single-account fetch paths, early clear wiring), new referenced-attribute-set builder (sourceService or a small helper module), `src/operations/helpers/accountListPhases.ts` (clear after Refresh)
- **Tests:** new pruning tests under `src/services/sourceService/__tests__/` (incl. bracket/quoted template reference styles); aggregation test proving JIT unique refresh + report id resolution survive the early clear; record-mode exemption tests
- **Docs:** `docs/concepts/glossary.md` mirror of the two new terms; configuration/mapping guide note that managed source account attributes outside the referenced attribute set are pruned at Fetch and that dynamic computed attribute access in Velocity templates is unsupported
- **Changelog:** PATCH improvement note during apply via changelog-generator
- **Migration:** none
