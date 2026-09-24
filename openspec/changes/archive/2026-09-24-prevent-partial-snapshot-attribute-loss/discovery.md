## Scope

In: when a Fusion account becomes refresh-eligible mid-run after a prior **claim-only absorb**, rematerialize live source snapshots for already-linked managed accounts before Map and Define; and when Main account / Origin account merge cannot find its designated snapshot in `attributeBag.sources`, preserve the current bag value instead of deleting. Out: changing Match scoring, auto-merge thresholds, attribute map configuration UI, force-attribute-refresh defaults, or repairing already-damaged tenant data.

## Language

**Source snapshot materialization** (canonical — reuse):
Copying a managed source account’s attributes onto `attributeBag.sources` during FusionLayers absorb so Map and Velocity `$accounts` / `$sources` can read this run’s live snapshots.

**Claim-only absorb** (canonical — reuse):
Absorbing a work-queue managed account by claiming it and updating Fusion account bookkeeping without source snapshot materialization.

**Main account merge** / **Origin account merge** / **origin snapshot** (canonical — reuse):
Map strategies that read a single designated snapshot. Empty result today deletes from `attributeBag.current` (except definition-owned / identity-bag / no-managed-context preservation).

**Vanished snapshot key** (canonical — reuse):
An attribute name in `attributeBag.current` that no live snapshot carries this Map invocation. Clearing remains correct when the designated snapshot **was** loaded and simply lacks the attribute.

**Designated snapshot unavailable** (`draft` → `promote`):
A Main account or Origin account merge whose chosen snapshot key is not present in this invocation’s `attributeBag.sources` (or the per-invocation snapshot index) at all — distinct from “snapshot present but attribute empty”.
_Avoid_: “vanished snapshot key” (that term means the attribute name is absent from every loaded snapshot); “missing managed account” (collides with `missing-accounts` correlation state).

**Claimed account retention** (`draft` → `promote`):
Keeping managed account attribute bodies after `claimAccount` removes them from the work queue, long enough that a later mid-run rematerialization can copy them onto `attributeBag.sources`.
_Avoid_: “re-fetch” (implies another ISC API call); “inventory” (lightweight metadata without attributes).

## Decisions

Context: Reproduced on tenant `company24509-poc` / recording `recordings/company24509-poc/nadia` step-10 (2026-09-24T10:40Z). Fusion account `nadya.petrova [MelonHRM]` entered Refresh with MEL0011 already linked; claim-only absorb claimed MEL0011 without materializing. Process auto-merged MEL0010 onto the same Fusion account via `decisionProcessor` → `assembleAccount`, which set `needsRefresh` and materialized only MEL0010 (the only linked key still on the work queue). Map then ran Main-account merges (`givenName`→`firstname`, `familyName`→`lastname`, and all implicit keys under global `attributeMerge: mainAccount`) against a missing origin/main snapshot, deleted the prior bag values, and Define saw `$sources.MelonHRM[0]` as MEL0010 (`employeeId` flipped to `MelonHRM-MEL0010`; `displayName` became the unevaluated template `${firstname} ${lastname}`). Attribute maps themselves are correct — MelonHRM publishes `givenName`/`familyName`.

Q1: Is the root cause Map config or incomplete live sources?
Chosen: **Incomplete live sources after mid-run refresh eligibility.** Maps and Define behaved as currently specified given a partial `attributeBag.sources`.

Q2: Primary fix — rematerialize or only harden Map deletes?
Chosen: **Rematerialize first** (complete snapshot set before Map/Define). Hardening Map alone would stop deletion but leave Define’s `$sources` partial (wrong `employeeId` / Velocity views). Both protections ship in this change.

Q3: Where do rematerialized attributes come from after claim?
Chosen: **Claimed account retention on `FusionRun`.** `claimAccount` removes bodies from `managedAccountsById` today; inventory has no attributes; re-fetching ISC is out of scope. Retain claimed Account attribute bodies until work-queue clear / Output so `addManagedAccountLayer` (and `assembleAccount` re-entry) can materialize missing linked keys when live sources become required.

Q4: Does this reverse “SHALL NOT claim first and materialize later”?
Chosen: **Amend, not reverse.** Pre-claim decision remains once-per-layer-invocation. Mid-run rematerialization is allowed **from the retention cache** when live sources become required after a prior claim-only absorb on the same Fusion account in the same run. Still SHALL NOT expect the work queue alone to hold already-claimed keys.

Q5: Defensive Map behavior when designated snapshot is unavailable?
Chosen: **Preserve `attributeBag.current` (no-opinion).** Distinguish unavailable designated snapshot from “snapshot present, attribute absent” (still empty → delete / vanished-key clear). This **modifies** the prior `clear-vanished-snapshot-attributes` scenario that cleared when main/origin were not fetched but another live snapshot existed.

Q6: Does claim-only absorb itself start materializing again?
Chosen: **No.** Unchanged Fusion accounts that never flip to `needsRefresh` keep claim-only + skip Map. Retention is for correctness if eligibility changes later in the run.

## Open questions

None — scope locked against the Nadia recording and tenant account state.

## Scenarios discussed

- Prior claim-only linked origin account; later same-run auto-merge blends a second managed account → both snapshots present before Map/Define; `firstname`/`lastname`/`city` preserved; `employeeId` stays on origin employee id when Define uses `$sources.get($originSource)[0]`
- Main account merge: designated snapshot loaded but attribute missing → still empty → delete (genuine vanish)
- Main account merge: designated snapshot unavailable, sibling snapshot present → preserve current (no-opinion)
- Origin account merge: same unavailable vs absent-attribute distinction
- Implicit candidates under global `mainAccount` merge follow the same unavailable guard
- Definition-owned names unchanged (already non-deleting on empty)
- `shouldPreserveCurrentWithoutContext` when no snapshots at all unchanged
- Fusion account that stays claim-only for the whole run: Map still skipped; no behavior change
- Authorized merge via review form onto a claim-only-preprocessed Fusion account: same rematerialization path as automatic merge
- `onlyTargets` Map invocations inherit the unavailable-designated-snapshot preserve rule for explicit Main/Origin targets
