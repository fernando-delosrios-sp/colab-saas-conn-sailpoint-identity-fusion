## Context

Planned at git `866a683` (2026-08-25). Drift check:

```bash
git diff --stat 866a683..HEAD -- \
  src/model/fusionLayers.ts \
  src/model/fusionRun.ts \
  src/model/fusionAccountFactories.ts \
  src/services/fusionService/fusionService.ts
```

### Current hot path

```442:467:src/model/fusionLayers.ts
    private processPreviousRunMatchedAccounts(
        queue: FusionRun,
        attributeBag: { sources: Map<string, Attributes[]> },
        addBlendHistory: boolean,
        skipBlendHistoryForManagedKeys?: ReadonlySet<string>,
        onBlend?: (account: Account) => void
    ): void {
        if (this.collections.previousAccountIds.size === 0 && this.collections.missingAccountIds.size === 0) return

        for (const [id, account] of queue.entries()) {
            if (!this.collections.previousAccountIds.has(id) && !this.collections.missingAccountIds.has(id))
                continue

            this.collections.statuses.setUncorrelatedAccount(id)
            this.uncorrelatedValue = true
            this.collections.statuses.add(StatusEntitlement.Uncorrelated)
            this.collections.removeActionSilent('correlated')
            const blended = this.setManagedAccount(
                account,
                addBlendHistory,
                skipBlendHistoryForManagedKeys,
                attributeBag
            )
            if (blended && onBlend) onBlend(account)
            queue.claimAccount(id, account.identityId)
        }
    }
```

Earlier in `addManagedAccountLayer`, keys are normalized via `normalizeCompositeManagedAccountKey` into `previousAccountIds`, `missingAccountIds`, and `accountIds` sets (`fusionLayers.ts:182-190`).

Identity-matched path already uses targeted lookup:

```377:394:src/model/fusionLayers.ts
        const matchedIds = queue.getKeysForIdentity(identityId)
        // ...
        for (const id of matchedIds) {
            const account = queue.get(id)
```

### Expected behavior equivalence

For each `[id, account]` pair where `previousAccountIds.has(id) || missingAccountIds.has(id)`, the new loop must:
1. Run the same status/uncorrelated/correlated-action mutations
2. Call `setManagedAccount` with same args
3. Call `onBlend` when blended
4. Call `queue.claimAccount(id, account.identityId)`

Keys in previous/missing sets that are **not** in the queue: today skipped silently in full scan — must remain skipped.

Keys in queue but **not** in previous/missing: today skipped — must remain skipped (full scan relied on filter).

### Conventions

- Composite keys: `sourceId::nativeIdentity` (`ubiquitous-language`: managed account key)
- Non-composite keys dropped at factory hydration (`fusion-service`: persisted reference collections)
- Tests: Vitest, pattern from `src/model/__tests__/` or fusion layer tests if present

## Goals / Non-Goals

**Goals:**

- Replace O(queue) scan with O(|previous| + |missing|) lookups per fusion account
- Preserve all side effects per matched key
- Add regression test proving large queue + few keys does not iterate entire queue (spy `queue.entries` — must not be called from this method after change)

**Non-Goals:**

- Optimizing `processDeclaredAccountIds` / `hasSourceSnapshot` nested scan (separate follow-up)
- Re-normalizing keys differently than `addManagedAccountLayer` already does
- Parallelizing Refresh beyond existing batch cap

## Decisions

### D1: Iterate union of sets

```typescript
const candidateIds = new Set([
    ...this.collections.previousAccountIds,
    ...this.collections.missingAccountIds,
])
for (const id of candidateIds) {
    const account = queue.get(id)
    if (!account) continue
    // existing body
}
```

Do not iterate `missing` only or `previous` only separately — union avoids double-processing if key appears in both (sets dedupe).

### D2: onQueueScan reports |candidateIds|

If `options.onQueueScan` exists (from instrumentation package), call with `candidateIds.size` not `queue.size`.

### D3: Test strategy

Create `src/model/__tests__/fusionLayers.refreshLookup.test.ts`:
- Build mock `FusionRun` with Map of 10_000 dummy queue entries
- Fusion account with 2 previous keys pointing at real entries
- Spy: `queue.entries` should not be called when processing previous-run matches
- Assert blended count = 2, claim called twice

Use existing `FusionAccount.configure` minimal config pattern from `defineService.test.ts`.

## Scope

**In scope:**

- `src/model/fusionLayers.ts` — `processPreviousRunMatchedAccounts` only
- New test file as above
- Optional: update instrumentation callback call site

**Out of scope:**

- `processDeclaredAccountIds`, `hasSourceSnapshot`
- `FusionRun.entries()` implementation
- Documentation beyond changelog

## STOP conditions

- Any test asserting blend history, missing-account preservation, or claim semantics fails — STOP and diff behavior before/after on failing scenario
- Spy shows `queue.entries()` still invoked from `processPreviousRunMatchedAccounts`
- Production profile (via instrumentation package) shows no `queueEntriesScanned` reduction — report; may indicate previous/missing sets are nearly full queue (data issue, not code bug)
- `npm test` / `npm run lint` fail twice

## Git workflow

- Branch: `perf/index-refresh-managed-account-lookups`
- Commit: `perf(fusion): target previous/missing keys in Refresh blend`
- Apply after `instrument-account-list-refresh` is DONE (for measurement comparison)

## Risks / Trade-offs

- If persisted keys are malformed and normalization emptied sets, behavior unchanged (no blends) — same as today
- Order of processing changes from queue iteration order to Set iteration order — must not affect final collections (sets are unordered; claim is per-key idempotent)

## Maintenance notes

- If a future change adds queue-wide reconciliation, do not reintroduce full scan without feature flag
- Declared-account snapshot scan (`hasSourceSnapshot`) remains a separate perf finding
