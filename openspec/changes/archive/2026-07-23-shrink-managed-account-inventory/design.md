## Context

Each aggregation run loads managed source accounts into `FusionRun.managedAccountsById` (work queue) and mirrors every entry into `managedAccountsAllById` (full `Account` snapshot). The work queue shrinks via `claimAccount` during matching and form processing; the snapshot persists until `SourceService.clearManagedAccounts()` at output phase. Peak memory therefore holds two references to every managed account plus full Account object retention for the snapshot lifetime.

Consumers after queue depletion need only:
- Key existence (form deletion when account no longer in run)
- Display metadata: `name`, `id`, `sourceName`, `sourceId`, `nativeIdentity`
- Fusion layer prune/preserve: `.has(key)` and lightweight field lookup — **not** the current work queue state

The original advisor plan proposed `managedAccountKeySet` + `managedAccountInfoCache` and routing fusion layers to `workQueue.managedAccountsById`. Code review rejected that: redundant structures, `as any` casts, missed consumers (`reportService`, `resolveIscAccountIdForManagedKey`), and a correctness bug (work queue ≠ full inventory).

## Goals / Non-Goals

**Goals:**
- Replace `managedAccountsAllById` with `managedAccountInventory: Map<string, ManagedAccountInfo>`
- Centralize population in `setManagedAccount`; expose `hasManagedAccount`, `getManagedAccountInfo`, `clearManagedAccountState`
- Migrate all non-test consumers to accessors
- Remove `allAccountsById` parameter from `addManagedAccountLayer` call chain
- Update snapshot/restore to serialize inventory instead of full Accounts
- Preserve identical form, report, fusion layer, and matching behavior

**Non-Goals:**
- Changing matching algorithms or work-queue claim semantics
- Storing full Account objects in inventory for new consumers without explicit design
- Performance benchmarks in CI
- Ubiquitous-language spec updates (optional follow-up)

## Decisions

### D1: Inventory shape — single map vs key set + cache

- **Choice:** Single `managedAccountInventory: Map<string, ManagedAccountInfo>`
- **Reason:** `.has()` and `.get()` on one map; no redundant parallel structure
- **Considered alternatives:** Separate `managedAccountKeySet` — rejected (duplicate keys, two clear paths)

### D2: ManagedAccountInfo type

- **Choice:** Named exported type with fields: `id`, `name`, `sourceName`, `sourceId?`, `nativeIdentity?`
- **Reason:** Same shape `extractAccountInfoOverride` returns; typed end-to-end, no `as any`
- **Considered alternatives:** Reuse partial `Account` — rejected (misleading type, encourages attribute access)

### D3: Fusion layer inventory source

- **Choice:** `_pruneDeletedManagedAccounts` accepts `ReadonlySet<string>` from `run.managedAccountInventory.keys()`; `_preserveMissingAccountContext` accepts `ReadonlyMap<string, ManagedAccountInfo>` from inventory
- **Reason:** Prune needs full run key set; preserve needs metadata fields — neither can use depleted work queue
- **Considered alternatives:** Pass `workQueue.managedAccountsById` — rejected (false deletions when accounts claimed by other identities)

### D4: Form service queue vs inventory lookup

- **Choice:** Try `managedAccountsById.get(key)` first for full Account (needed for `claimAccount` with `identityId`); fall back to `getManagedAccountInfo(key)` for metadata-only path
- **Reason:** Preserves existing claim semantics without storing `identityId` in inventory unless needed later
- **Considered alternatives:** Store `identityId` in inventory — deferred (only needed when claiming from inventory fallback)

### D5: Accessor encapsulation

- **Choice:** Public methods on FusionRun; inventory map is `readonly` but accessed via methods in consumer code
- **Reason:** Documents lifecycle in one JSDoc block; prevents new direct `.managedAccountsAllById` references
- **Considered alternatives:** Public map field — rejected (grepability without discipline)

### D6: Snapshot field rename

- **Choice:** Replace snapshot field `managedAccountsAllById` with `managedAccountInventory`
- **Reason:** Aligns serialized shape with runtime; smaller snapshots
- **Considered alternatives:** Keep old field name with new shape — rejected (confusing)

### D7: Lifecycle cleanup

- **Choice:** `clearManagedAccountState()` clears work queue + inventory + identity index (existing clear behavior consolidated)
- **Reason:** One method name for output-phase teardown
- **Considered alternatives:** Separate clears in SourceService — rejected (scattered lifecycle)

## Risks / Trade-offs

- [Risk] New consumer needs full Account after queue depletion → Mitigation: extend `ManagedAccountInfo` or plumb Account directly; do not restore full snapshot map without opsx change
- [Risk] Snapshot replay code expects full Account in restored state → Mitigation: update ReplayAdapter and fusionRun tests; verify record mode paths
- [Risk] `identityId` needed when claiming from inventory-only path → Mitigation: add optional `identityId` to inventory if form tests reveal gap
- [Trade-off] Partial projection vs full Account convenience → Accepted: explicit field list documents memory contract
- [Trade-off] MODIFIED requirements across fusion-run and source-service specs → Accepted: spec truth must match implementation

## Migration Plan

N/A — internal refactor with no operator config changes. Deploy via normal connector bundle update.

**Rollout:** Ship after `npm run typecheck`, `npm test`, and `npm run lint` pass. Monitor aggregation RSS in environments with large managed account counts.

**Rollback:** Revert commit; restores dual-map model.

## Open Questions

- None blocking. Optional: add `identityId` to `ManagedAccountInfo` proactively if form claim path ever hits inventory-only fallback in production traces.
