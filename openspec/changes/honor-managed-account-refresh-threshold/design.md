## Context

Planned at git `41781ad` (2026-08-25). Drift check (run first):

```bash
git diff --stat 41781ad..HEAD -- \
  src/model/fusionLayers.ts \
  src/model/fusionAccount.ts \
  src/utils/date.ts \
  src/model/__tests__/fusionAccount.test.ts \
  src/model/__tests__/fusionLayers.refreshLookup.test.ts \
  openspec/specs/fusion-service/spec.md \
  docs/use-guides/configuration/defining-attributes.md
```

If any in-scope file differs from the excerpts below, STOP and report.

Related landed work (do not redo): `perf(definition): honor per-definition refresh on Define` (`134af63`), `perf(fusion): look up previous and missing accounts by key` (`bd26bb3`). Those gates only help when `needsRefresh` is false.

### Current bug

`addManagedAccountLayer` receives Fusion `modified` and does not use it:

```155:165:src/model/fusionLayers.ts
    addManagedAccountLayer(
        workQueue: FusionRun,
        attributeBag: { current: Attributes; sources: Map<string, Attributes[]>; sourceAccountContexts: Attributes[] },
        identityInfo: IdentityInfo | undefined,
        modified?: string,
        iscAccountId?: string,
        ...
```

Caller already passes it:

```371:379:src/model/fusionAccount.ts
    addManagedAccountLayer(
        workQueue: FusionRun,
        options: AddManagedAccountOptions = {}
    ): void {
        this.layers.addManagedAccountLayer(
            workQueue,
            this.attributeBagValue,
            this.identityInfoValue,
            this.modifiedValue,
```

`setManagedAccount` compares against `undefined`:

```328:332:src/model/fusionLayers.ts
        if (!this.needsRefreshValue) {
            const thresholdMs = this.fusionAccountRefreshThresholdInSeconds * 1000
            if (isNewerThan(account.modified, undefined, thresholdMs)) {
                this.needsRefreshValue = true
            }
        }
```

### Why epoch is wrong

```19:24:src/utils/date.ts
export const isNewerThan = (
    isoString: string | undefined | null,
    reference: string | Date | undefined | null,
    thresholdMs = 0
): boolean => {
    return toEpochMs(isoString) > toEpochMs(reference) + thresholdMs
}
```

Empty reference → `toEpochMs` 0. Default threshold is 60s (`src/data/config/internal/fusionService.ts` `fusionAccountRefreshThresholdInSeconds: 60`). Any real ISC `modified` wins.

Identity layer already compares against Fusion `modified` (leave unchanged):

```134:136:src/model/fusionLayers.ts
        if (!this.needsRefreshValue && isNewerThan(identity.modified, modified)) {
            this.needsRefreshValue = true
        }
```

New blend still correct (`isNewAccount` → `needsRefreshValue = true` at `fusionLayers.ts:318-319`).

### Downstream cost (do not change in this package)

- Map runs when `needsRefresh && sourceAttributeMap.size > 0` (`mappingService.ts` `mappingRuns`).
- Refresh-off Define evaluates when `needsRefresh` (`definition-service` requirement **Normal definitions honor the refresh flag per definition**).
- Output Unique refresh when `account.needsRefresh` (`fusionService.ts` `processOutputBatch`).

### Spec vocabulary (honor, do not invent terms)

From `openspec/specs/ubiquitous-language/spec.md`:

- **FusionLayers** — owns `needsRefresh`.
- **Refresh on each aggregation** — Refresh-off definitions evaluate when underlying source data changes (`needsRefresh`), on reset, or force attribute refresh.

From `openspec/specs/definition-service/spec.md` requirement **needsRefresh triggers refresh false definitions**: `needsRefresh: true` because underlying managed source data changed.

From `docs/use-guides/configuration/defining-attributes.md`: Static No / Refresh No → recalculated only when underlying source data changes.

### Exemplar tests

- `src/model/__tests__/fusionAccount.test.ts` — `beforeAll` `FusionAccount.configure` with `fusionAccountRefreshThresholdInSeconds: 3600`; `addManagedAccountLayer` + `FusionRun` queue (see `addManagedAccountLayer merges managed account` and prune/`needsRefresh` cases around lines 84–95 and 734–749).
- `src/model/__tests__/fusionLayers.refreshLookup.test.ts` — keyed previous/missing lookups; do not weaken those assertions.
- `src/utils/__tests__/date.test.ts` — `isNewerThan` without threshold; optional extra cases for `thresholdMs`.

### Repo conventions

- Prettier: 120 char, 4-space tabs, single quotes, no semicolons.
- Tests: Vitest `globals: true`; `*.test.ts` beside code; no `_` prefix except unused bindings.
- Commits: conventional, e.g. `perf(fusion): look up previous and missing accounts by key`.
- Node 24 (`.nvmrc`). Commands: `npx vitest run <file>`, `npm run typecheck`, `npm run lint`. Do **not** pipe test output to `tail`.
- TDD: failing tests first (repo **tdd** skill if present).
- Changelog: **changelog-generator** skill; PATCH under today’s `## 2026-08-25 · v2.2.0` Improvements; no Unreleased section.

## Goals / Non-Goals

**Goals:**

- Timestamp-based `needsRefresh` uses Fusion account `modified` as `isNewerThan` reference.
- Previously correlated accounts whose managed `modified` is not newer than Fusion `modified` by more than the threshold keep `needsRefresh` false (unless new blend, prune, identity layer, or force refresh).
- Tests with ISO timestamps catch a regression back to `undefined`.

**Non-Goals:**

- Identity-layer threshold or attribute hashing.
- Unique-register lock removal.
- Skipping `processFusionAccounts` for stale rows.
- Changing `isNewerThan` empty-reference = epoch for other callers.
- Publishing `fusionAccountRefreshThresholdInSeconds` in connector-spec.

## Decisions

### D1: Pass Fusion `modified` into `setManagedAccount`

**Choice:** Add a `fusionModified?: string` argument (or equivalent) to `setManagedAccount` and pass `modified` from `addManagedAccountLayer` through `processIdentityMatchedAccounts`, `processDeclaredAccountIds`, and `processPreviousRunMatchedAccounts`.

**Rejected:** Reading a new field on `FusionLayers` — `modified` already flows in. Comparing to `new Date()` — that would mean “changed in the last N seconds,” not “newer than last Fusion write.”

### D2: `isNewerThan(account.modified, fusionModified, thresholdMs)`

**Choice:** Same helper, third-arg grace: true only when managed `modified` is strictly after Fusion `modified` plus threshold.

With threshold 3600s (test file default): Fusion `2024-01-15T10:00:00.000Z`, managed `2024-01-15T10:30:00.000Z` → false; managed `2024-01-15T12:00:00.000Z` → true.

**Rejected:** `Date.now() - threshold` as reference.

### D3: Missing Fusion `modified`

**Choice:** If `fusionModified` is null/undefined/empty, do not call `isNewerThan` with a missing reference. Leave `needsRefresh` unchanged from the timestamp check.

**Rejected:** Epoch fallback.

### D4: Call sites of `setManagedAccount` outside the layer walk

`buildFromManagedAccount` already sets `needsRefresh = true` and `needsReset = true` before `setManagedAccount`. New-account path still sets `needsRefresh` via `isNewAccount`. Do not change factory semantics. If that call omits `fusionModified`, timestamp check is skipped (D3) or `isNewAccount` already true — either is fine.

## Scope

**In scope:**

- `src/model/fusionLayers.ts`
- `src/model/__tests__/fusionAccount.test.ts` (primary)
- Optional: `src/utils/__tests__/date.test.ts` threshold examples; `src/model/__tests__/fusionLayers.refreshLookup.test.ts` only if a lookup test would assert `needsRefresh`
- `openspec/changes/honor-managed-account-refresh-threshold/specs/fusion-service/spec.md` (already in this package)
- `CHANGELOG.md`
- Optional one sentence: `docs/use-guides/configuration/defining-attributes.md`

**Out of scope:**

- `src/services/definitionService/**` — skip logic stays; this only makes `needsRefresh` truthful
- `src/services/mappingService/**`
- `src/services/fusionService/fusionService.ts` `setNeedsRefresh` OR with force flags
- Identity-layer comparison
- `src/utils/date.ts` implementation (tests only if adding threshold examples)
- `src/data/config/internal/fusionService.ts` default 60

## Git workflow

- Branch: current feature branch is fine (`2.2.0/preview` or `advisor/honor-managed-account-refresh-threshold` if applying isolated).
- Commit example: `perf(fusion): compare managed modified to fusion timestamp`
- Do not push or open a PR unless asked.
- Do not skip hooks.

## STOP conditions

- Drift check shows in-scope files no longer match excerpts.
- `isNewerThan` third argument is not “reference + thresholdMs” (inverted semantics).
- Tests require treating every managed account with `modified` as dirty to pass (that is the bug).
- Fix appears to need definitionService or mappingService changes.
- Identity-layer tests fail unless you also add a threshold there — do not; report.
- Prune-deleted / orphan `needsRefresh` false test (`fusionAccount.test.ts` “clears needsRefresh when a managed-origin account becomes orphan”) fails.

## Risks / Trade-offs / Maintenance

- **False negatives:** Managed attributes can change without `modified` moving (unusual on ISC). Accepted; same as any timestamp dirty flag.
- **False negatives within threshold:** Updates less than N seconds after Fusion `modified` are ignored. Default N is 60s; tests in `fusionAccount.test.ts` use 3600s — pick dates that match **that file’s** configure value, not 60, unless you reconfigure in a nested `describe`.
- **Reviewer:** Grep `isNewerThan(account.modified` — second arg must not be `undefined`. Confirm new-blend and prune tests still pass.
- **Follow-up (not this change):** identity `modified` without threshold; unique-register locks.
