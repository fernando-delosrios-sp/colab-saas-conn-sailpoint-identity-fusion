## Why

Managed accounts with open Fusion review forms must be removed from the managed-account work queue so Match does not attempt to create duplicate form definitions. This behavior existed on the `fernando` branch via `FormService.extractAccountInfoOverride` during Fetch (`processFetchedFormData`). After the managed-account inventory refactor (`19397b7`), queue removal only runs when the account is still present in `managedAccountsById` at claim time (`shouldRemoveAccountFromMap && queueAccount`), which can fail when form account keys do not align with work-queue keys or when pending forms are not processed before Match. Operators see API errors such as `400.1.409: another form definition with the same name already exists` and accounts incorrectly re-enter Match scoring.

## What Changes

**Fetch-phase queue depletion (primary path)**

- From: claim only when `shouldRemoveAccountFromMap && queueAccount`.
- To: when `shouldRemoveAccountFromMap` and the account is in run inventory (`hasManagedAccount`), call `run.claimAccount` using work-queue account when present, otherwise inventory metadata (including optional `identityId`).
- Reason: restore pre-inventory behavior where pending-review processing always depletes the work queue when the managed account is known to this run.
- Impact: Match sweep no longer sees accounts awaiting reviewer decision.

**Same-run depletion after form creation (secondary path)**

- From: `handlePartialMatch` creates a review form but leaves the managed account on the work queue until the next aggregation Fetch.
- To: after successful `createFusionForm`, claim the managed account from the work queue (mirroring deferred-match behavior).
- Reason: closes the gap between form creation and the next Fetch pass within a single `accountList` run.
- Impact: no duplicate form work in later phases of the same aggregation.

**Form definition reuse hardening (symptom mitigation)**

- From: `getOrCreateFormDefinition` creates when exact-name search returns nothing, failing with 409 if the definition already exists.
- To: on create conflict for duplicate name, re-fetch by exact name and reuse the existing definition.
- Reason: defensive recovery when ISC search lags or filter/pagination misses an existing definition.
- Impact: partial-match path degrades gracefully instead of failing the account.

**Managed account key normalization**

- From: form account id and work-queue key compared as raw strings.
- To: normalize form-extracted account ids via `normalizeCompositeManagedAccountKey` before lookup and claim.
- Reason: prevents silent skip when legacy or alternate key shapes differ only by formatting.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `form-service`: Require work-queue depletion for pending Fusion review forms during `processFetchedFormData`; document analyze/claim rules.
- `matching-service/match-outcome-dispatch`: Require work-queue claim after successful partial-match form creation.
- `fusion-run`: Optional `identityId` on `ManagedAccountInfo` to support inventory-only claim paths.

## Impact

- `src/services/formService/formService.ts` — `extractAccountInfoOverride`, `getOrCreateFormDefinition`, optional account-id normalization at extraction sites.
- `src/services/matchingService/matchOutcomeDispatcher.ts` — `handlePartialMatch` claims account after successful form creation.
- `src/model/fusionRun.ts` — extend `ManagedAccountInfo` / `toManagedAccountInfo` with optional `identityId`.
- `src/services/formService/__tests__/formService.test.ts` — pending-review queue skip and 409 recovery cases.
- `src/services/matchingService/__tests__/matchOutcomeDispatcher.test.ts` — partial-match claim behavior.
- `openspec/specs/form-service/spec.md`, `openspec/specs/matching-service/match-outcome-dispatch/spec.md`, `openspec/specs/fusion-run/spec.md` — requirement deltas synced on archive.
