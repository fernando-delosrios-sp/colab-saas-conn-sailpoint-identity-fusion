## Why

Refresh still re-absorbs leftover previous-run and missing managed account keys as uncorrelated whenever they sit on the work queue. If that managed account now belongs to another Fusion identity, this identity either steals it (processes first) or keeps a ghost link after prune-deleted (the other identity claimed it, inventory still lists it). Operators then see the same managed source account contributing to two Fusion identities. Exclusive ownership should win: drop this identity’s link and treat the account as gone here.

## What Changes

**Uncorrelated previous-run lookup vs foreign Fusion identity**

- From: Previous and missing keys found on the work queue are marked uncorrelated, absorbed, and claimed. Keys still in inventory but already claimed by another Fusion identity are kept.
- To: If a previous/missing key is a **foreign-owned managed account**, drop the local link with prune-deleted refresh/orphan bookkeeping and do **not** claim the work-queue entry. Remaining contributors are remapped; a managed-origin account that loses its last contributor becomes orphan without a needless refresh. Identity-matched absorb for this Fusion identity is unchanged. Keys with no other Fusion identity still re-absorb as uncorrelated.
- Reason: A managed source account must not stay blended into two Fusion identities after the source (or an earlier Refresh visit) assigned it to one of them.
- Impact: Non-breaking for ISC APIs. Fusion accounts that listed a now-foreign-owned key lose that link and remap. The owning Fusion identity can still claim the account this run.

**Live-source materialization**

- From: Remaining live keys materialize when prune-deleted would remove a tracked key (inventory miss).
- To: Foreign-owned drop also requires live-source materialization for remaining live linked keys on that Fusion account (same as prune-deleted).
- Reason: Dropping a contributing account is a blend change; Map/`$accounts` need the remaining snapshots.
- Impact: Rows that drop a foreign-owned link refresh remaining snapshots; quiet rows with no foreign-owned keys stay claim-only.

**Unchanged**

- Identity matcher for this Fusion identity’s `identityId`
- Prune-deleted when the key is absent from `managedAccountInventory`
- Correlated-sweep skip-linked and Match `resolveAccountBeforeScoring`
- Work-queue claim of keys this identity still owns

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `fusion-service`: previous/missing uncorrelated lookup drops foreign-owned keys without claiming; remaining live keys materialize like prune-deleted
- `ubiquitous-language`: **Foreign-owned managed account**

## Impact

- **Code:** `src/model/fusionLayers.ts` (`processPreviousRunMatchedAccounts`, prune/`computeRequireLiveSourceSnapshots`); possibly a small FusionRun helper to test Fusion identity ownership without scanning every Fusion account per key; tests in `src/model/__tests__/fusionAccount.test.ts` / `fusionLayers*.test.ts`
- **Docs:** Glossary entry for foreign-owned managed account; no operator setting
- **Changelog:** PATCH note that Refresh drops previous/missing links when the managed account belongs to another Fusion identity
- **Migration:** None — next aggregation corrects stale dual links
