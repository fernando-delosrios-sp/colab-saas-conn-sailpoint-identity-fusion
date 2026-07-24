## Why

The current `hydrateCorrelatedManagedAccountIdentities` pass runs at the end of fetchPhase and hydrates every correlated managed account. That is too early (no Fusion accounts exist yet, so the apply loop never runs) and too broad (linked correlated accounts and existing Fusion rows do not need out-of-scope identity documents). The only consumer is the Fusion display-attribute override, which writes the **identity alias** to new Fusion accounts created from correlated managed sources. Those accounts are the correlated **orphans** processed in the correlated account sweep — managed accounts correlated on the source but not linked to any loaded Fusion row.

## What Changes

**Hydration scope**

- From: all fetched managed accounts with a non-empty `identityId` at end of fetchPhase.
- To: correlated managed accounts still on the work queue after refresh (`uncorrelated === false`) that will produce a new Fusion account in the correlated sweep.
- Reason: identity alias override applies only to new managed-origin Fusion accounts, not existing persisted Fusion rows.
- Impact: fewer out-of-scope identity API calls; correct targeting for display-attribute behavior.

**Hydration timing**

- From: end of fetchPhase (before fusion accounts are built).
- To: processPhase, immediately before the correlated account sweep (after `initializeManagedAccountProcessing`).
- Reason: refresh must claim linked correlated accounts off the queue first; orphans are created during the sweep.
- Impact: non-breaking pipeline reorder within account-list.

**Identity layer application**

- From: apply loop over `_fusionAccountMap` in the hydration helper (no-op today).
- To: apply `addIdentityLayer` in the correlated orphan path of `MatchOutcomeDispatcher` when assembling a new Fusion account from a correlated managed account.
- Reason: orphans are not registered until the sweep runs; this is the single creation site.
- Impact: identity alias available before first `getISCAccount` for orphan-derived accounts.

**Remove incorrect fetch-phase call**

- From: `fetchPhase` invokes hydration after form processing.
- To: fetchPhase no longer performs correlated identity hydration.
- Reason: wrong phase and scope.
- Impact: fetch-phase log line removed; process-phase log added.

## Capabilities

### New Capabilities

_(none — behavior fits existing domain specs)_

### Modified Capabilities

- `fusion-run`: Narrow correlated-identity hydration requirement to orphan-derived Fusion accounts; update timing to before correlated sweep.
- `account-list-operation`: Document hydration step placement in process phase before correlated sweep.

## Impact

- `src/operations/helpers/accountListPhases.ts` — remove fetch-phase call; add pre-sweep call.
- `src/operations/helpers/accountListPhases.ts` (helper) — narrow collection filter; remove ineffective apply loop or relocate apply to dispatcher.
- `src/services/matchingService/matchOutcomeDispatcher.ts` — apply identity layer for correlated orphan branch.
- `src/operations/helpers/__tests__/hydrateCorrelatedManagedAccountIdentities.test.ts` — update scope and timing tests.
- `openspec/specs/fusion-run/spec.md` — requirement text corrected via delta.
