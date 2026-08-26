## 1. Characterization tests (red first)

- [x] 1.1 In `src/model/__tests__/fusionAccount.test.ts` (or `fusionLayers.refreshLookup.test.ts` if that file owns layer absorb cases), add a describe `claim-only vs source snapshot materialization`. Reuse existing `FusionAccount.configure` / queue + `previousAccountIds` from persisted `attributes.accounts`. Put distinct attributes on the queued managed account that are **not** already on `attributeBag.current`.
- [x] 1.2 Stale previously correlated (Fusion `modified` set, managed `modified` older or within threshold, no force, no Always recalculate): after `addManagedAccountLayer`, `needsRefresh` is false, key is gone from the work queue, and `attributeBag.sources` does **not** contain a snapshot copied from that managed account’s attributes.
- [x] 1.3 New blend (key not in `previousAccountIds`): `needsRefresh` true, snapshot **is** materialized, key claimed.
- [x] 1.4 Two previously correlated keys on the queue; only one over-threshold newer: `needsRefresh` true and **both** live accounts are materialized on `attributeBag.sources`.
- [x] 1.5 Tracked key absent from inventory (prune-deleted) plus one stale live key on the queue: `needsRefresh` true and the live key is materialized.
- [x] 1.6 Same setup as 1.2 with `forceAttributeRefresh` / layer option equivalent true: snapshots **are** materialized and keys claimed.
- [x] 1.7 Same setup as 1.2 with an eligible Always recalculate Normal definition: snapshots **are** materialized.
- [x] 1.8 Run the new tests — expect RED while `setManagedAccount` always spreads attributes.

**Verify:** `npx vitest run src/model/__tests__/fusionAccount.test.ts src/model/__tests__/fusionLayers.refreshLookup.test.ts src/model/__tests__/fusionLayers.test.ts` — 1.2 fails; existing timestamp/`needsRefresh` cases still pass.

## 2. Decide-before-claim + claim-only absorb (green)

- [x] 2.1 Extend `AddManagedAccountOptions` with caller flags needed for D4 (`forceAttributeRefresh`, rebuild `refreshMapping` / `refreshDefinition` / `resetDefinition`, and/or a single `requireLiveSourceSnapshots` prelude bit). Do not claim before the row-level decision.
- [x] 2.2 In `FusionLayers.addManagedAccountLayer`, compute row-level `requireLiveSourceSnapshots` (D2): OR prelude flags with new-blend, over-threshold `modified`, and prune-deleted (inventory vs tracked keys) **before** any `claimAccount`.
- [x] 2.3 Split `setManagedAccount` (or a sibling) so claim-only absorb updates keys, uncorrelated/status, and `managedAccountInfo` without spreading `account.attributes` onto `attributeBag.sources`. Full materialization remains the existing spread when the row requires live sources.
- [x] 2.4 Identity / declared / previous-run matchers all honor the same row-level flag (whole row, not per key).
- [x] 2.5 Re-run 1.x — GREEN.

**Verify:** same vitest command as 1.8 exit 0.

**Grep:** claim paths in `fusionLayers.ts` do not call `managedAccountsById.delete` (via `claimAccount`) before the row-level materialize decision.

## 3. Wire `processFusionAccount` / AccountAssembly (D4)

- [x] 3.1 Compute force / rebuild AttributeOperations / eligible Always recalculate **before** `addManagedAccountLayer` in `FusionService.processFusionAccount` (and any `AccountAssembly` options pass-through). Eligible Always recalculate MUST reuse the same eligibility as `refreshNormalAttributes` (`definition.refresh` and not skipped static).
- [x] 3.2 Keep the existing post-layer `setNeedsRefresh(... || force || rebuild flags)` so Map/Define gates stay aligned; snapshots must already be present when those flags are true.
- [x] 3.3 Add or update a fusionService/accountAssembly test: force attribute refresh on a stale correlated row still has source snapshots before `applyAttributeProcessing`.
- [x] 3.4 Update tests that assumed `attributeBag.sources` is always filled after Refresh on unchanged rows.

**Verify:** `npx vitest run src/services/fusionService/__tests__/fusionService.aggregation.test.ts src/services/accountAssembly/__tests__/accountAssembly.test.ts src/services/definitionService/__tests__/defineService.test.ts`

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` (global Vitest; do not pipe to `tail`). Focused files above are the apply loop; full `npm test` before handoff if time allows.
- [x] 4.2 All delta spec scenarios covered by named automated tests (claim-only, new blend, sibling materialize, prune, force, Always recalculate, targeted lookup still O(keys) not O(queue)).
- [x] 4.3 `npm run typecheck` exit 0
- [x] 4.4 `npm run lint` exit 0

## 5. Documentation

- [x] 5.1 Add **Source snapshot materialization** and **Claim-only absorb** to `docs/glossary.md` to match `openspec/specs/ubiquitous-language` (after archive sync, the change-folder delta is the source during apply).
- [x] 5.2 Optional: one sentence in `docs/use-guides/configuration/defining-attributes.md` that Always recalculate / `needsRefresh` still read this run’s managed snapshots (`$accounts` / `$sources`); unchanged rows may not copy those snapshots. If that file is edited, `npm run lint:docs-guides` and `npm run lint:markdown`.
- [x] 5.3 JSDoc on `AddManagedAccountOptions` / absorb helpers naming claim-only absorb vs source snapshot materialization.

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via **changelog-generator** during apply (PATCH Improvement). Quiet aggregations skip copying managed source attributes onto Fusion rows when source data did not change; Always recalculate and force attribute refresh still copy. Do not add Unreleased.
- [x] 6.2 Confirm entry covers user-visible Capabilities (`fusion-service` claim-only absorb; glossary terms).
