## Why

After claim-only absorb, a later same-run auto-merge (or authorized review merge) can flip a Fusion account to `needsRefresh` and rematerialize only keys still on the work queue. Map then treats a missing Main/Origin snapshot as empty and deletes prior bag values; Define’s `$sources` sees a partial sibling set. Reproduced on `company24509-poc` / recording `nadia` (Nadya Petrova / MelonHRM): correct `givenName`→`firstname` maps wiped to empty and `displayName` became `${firstname} ${lastname}`. Fix before more tenants hit the same claim-only + mid-run blend path.

## What Changes

**Complete live sources after mid-run refresh eligibility**
- From: Claim-only absorb drops Account bodies from `managedAccountsById`; when Process later blends a new key onto that Fusion account, materialization can only copy accounts still on the work queue. Previously linked origin/main snapshots stay absent from `attributeBag.sources`.
- To: Retain claimed managed account attribute bodies on `FusionRun` until work-queue clear. When live sources become required for a Fusion account that was claim-only earlier in the run, rematerialize missing linked keys from that retention before Map and Define.
- Reason: Map and Velocity `$sources` need the full linked snapshot set whenever evaluation runs; the work queue alone cannot supply already-claimed keys.
- Impact: Non-breaking for quiet claim-only rows that never refresh. Mid-run blend / authorized merge onto claim-only-preprocessed accounts become correct. Slightly higher peak memory while retention holds claimed bodies.

**Designated-snapshot unavailable preserves current (Map)**
- From: Main account / Origin account merge (and vanished-key clearing under those strategies) treat a missing designated snapshot as empty and delete `attributeBag.current` when any other live snapshot makes `hasManagedAccountContext` true.
- To: If the designated snapshot key is not present in this invocation’s sources/index at all, Map SHALL NOT delete the existing bag value (no-opinion). If the snapshot is present but the attribute is empty, delete/clear behavior is unchanged.
- Reason: Belt-and-braces if rematerialization regresses; distinguishes “not loaded” from “source dropped the attribute”.
- Impact: Non-breaking for genuine vanishes. Modifies the prior “clearing does not require the selected snapshot to be present” requirement.

**Unchanged**
- Claim-only absorb for rows that stay non-refresh for the whole run
- Match scoring / auto-merge thresholds / attributeMaps configuration
- Definition-owned name preservation rules
- No automatic repair of already-damaged tenant accounts

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `fusion-run`: claimed account retention after `claimAccount`; lookup for rematerialization; clear with work-queue / managed-account state clear
- `fusion-service`: rematerialize missing linked snapshots from retention when live sources become required after prior claim-only absorb; amend “no claim-then-materialize” to allow retention-backed rematerialization
- `mapping-service`: designated snapshot unavailable → preserve current for Main/Origin (explicit and implicit under those merges); revise vanished-key scenario that cleared when main/origin were not fetched
- `ubiquitous-language`: **Designated snapshot unavailable** and **Claimed account retention**

## Impact

- **Code:** `src/model/fusionRun.ts` (retention store + clear); `src/model/fusionLayers.ts` (`claimAccount` path / rematerialize missing linked keys); `src/services/accountAssembly/accountAssembly.ts` and `decisionProcessor` re-entry via `assembleAccount`; `src/services/mappingService/mappingService.ts` + `helpers.ts` (unavailable vs empty); unit tests under `src/model/__tests__/`, `src/services/mappingService/__tests__/`, fusion/decision tests; optional focused scenario covering the Nadia sequence
- **Specs:** deltas for the four capabilities above
- **Docs:** brief note in mapping / defining-attributes reference that Map/Define need complete live snapshots when `needsRefresh` becomes true mid-run
- **Changelog:** PATCH — fix attribute wipe after claim-only absorb followed by same-run merge
- **Migration:** None required; optional tenant re-aggregation restores wiped attributes once the fix ships
