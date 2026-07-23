# Brainstorm: Shrink managed-account inventory lifetime

## Background

Advisor plan 003 identified that `managedAccountsAllById` retains every full `Account` object until `outputPhase`, while `managedAccountsById` (the work queue) is depleted during matching and form processing. Two parallel maps hold identical `Account` references, inflating peak RSS when 90%+ of accounts have already been claimed from the work queue.

Current readers of `managedAccountsAllById`:
1. `fusionLayers.ts` — `_pruneDeletedManagedAccounts` (`.has()` only) and `_preserveMissingAccountContext` (needs `sourceName`, `nativeIdentity`)
2. `formService.ts` — `managedAccountExists` (`.has()`), `extractAccountInfoOverride` (fallback after queue removal)
3. `reportService.ts` — display name and ISC account URL resolution (needs `name`, `id`)
4. `sourceService.ts` — `resolveIscAccountIdForManagedKey` (needs `id`)
5. Snapshot/restore — serializes full Account map

Code readability review found the original advisor plan would:
- Add redundant `managedAccountKeySet` alongside `managedAccountInfoCache`
- Use `as any` at the form-service fallback
- Switch fusion layers to the **depleted work queue** (incorrect — prune/preserve need full run inventory, not current queue state)
- Miss `reportService` and `resolveIscAccountIdForManagedKey`

## Decision chain

**Q1: How should consumers access post-queue-depletion account data?**

Options considered:
- A) Keep `managedAccountsAllById` full Account map (status quo — high memory)
- B) Split into `managedAccountKeySet` + `managedAccountInfoCache` (original plan — redundant structures)
- C) Single `managedAccountInventory` map of lightweight `ManagedAccountInfo` + accessor methods on FusionRun (chosen)

**Choice: C** — one domain concept ("inventory"), one write path in `setManagedAccount`, typed accessors hide internal storage.

**Q2: Should fusion layers use the work queue instead of the snapshot map?**

**No.** `_pruneDeletedManagedAccounts` checks `allAccountsById.has(accountId)` for every tracked account ID. If another fusion identity already claimed an account from the work queue, using `managedAccountsById` would falsely treat it as deleted. Fusion layers MUST use the full run inventory (key presence + lightweight metadata), not the mutable work queue.

**Q3: How do form/report consumers look up accounts?**

Migrate to FusionRun accessors:
- `hasManagedAccount(key)` — existence (replaces `.has()` on AllById)
- `getManagedAccountInfo(key)` — lightweight metadata
- `getManagedAccountFromQueue(key)` — full Account when still in work queue (for `claimAccount` with `identityId`)

**Q4: What about snapshot/restore?**

Replace `managedAccountsAllById` in snapshot with `managedAccountInventory` (serialized `ManagedAccountInfo` records). Smaller snapshots; replay restores inventory, not full Account objects. Work queue is rebuilt from managed account fetch on replay — existing pattern.

## Agreed approach

1. Introduce `ManagedAccountInfo` type and `managedAccountInventory` on FusionRun
2. Populate inventory only in `setManagedAccount`; remove all direct `managedAccountsAllById.set()` calls
3. Add accessor methods: `hasManagedAccount`, `getManagedAccountInfo`, `clearManagedAccountState`
4. Migrate formService, reportService, sourceService.resolveIscAccountIdForManagedKey, fusionLayers
5. Remove `allAccountsById` parameter from `addManagedAccountLayer` chain; fusion layers read inventory via FusionRun methods
6. Delete `managedAccountsAllById`; update snapshot/restore
7. Document the two-structure model (work queue vs inventory) once on FusionRun

## Design trade-offs

| Trade-off | Acceptance |
|-----------|------------|
| Inventory is a partial Account projection | Accepted — fields enumerated in `ManagedAccountInfo`; extend type if new consumer needs more |
| More FusionRun methods vs raw map access | Accepted — readability and encapsulation win |
| Snapshot no longer stores full Account objects | Accepted — inventory has fields needed for replay consumers |
| Fusion layer signature simplification | Accepted — removes confusing `allAccountsById` threading |

## Out of scope

- Changing matching/scoring algorithms
- Worker-thread or parallel fetch changes
- Resurrecting full Account snapshot for new consumers without design review
