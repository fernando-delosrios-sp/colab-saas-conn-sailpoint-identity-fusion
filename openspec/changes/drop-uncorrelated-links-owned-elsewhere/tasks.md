## 1. Characterization tests (red first)

- [x] 1.1 In `src/model/__tests__/fusionAccount.test.ts` or `src/model/__tests__/fusionLayers.test.ts`, add a describe `foreign-owned previous/missing keys`. Seed two Fusion identities on `FusionRun` (`hasFusionIdentity`), a work queue, and `managedAccountInventory` with `identityId`.
- [x] 1.2 Queue hit: this Fusion account lists key in `previousAccountIds` or `missingAccountIds` and has another managed link; queued Account `identityId` is the other Fusion identity. After `addManagedAccountLayer`, key is gone from this account’s collections, `needsRefresh` is true, key remains on the work queue (`claimAccount` not used).
- [x] 1.3 Already claimed last link: key absent from queue, still in inventory with the other Fusion identity’s `identityId`, prune-deleted enabled. After layer, this managed-origin Fusion account no longer lists the key, is orphan, and has `needsRefresh` false.
- [x] 1.4 Not foreign-owned (uncorrelated, no other Fusion identity): previous-run key still absorbed and claimed.
- [x] 1.5 This Fusion identity’s `identityId` matches the queued account: identity matcher absorbs and claims; key is not dropped as foreign-owned.
- [x] 1.6 Sibling materialize: one foreign-owned previous/missing key plus one stale previously correlated key still on the queue. Remaining live account is materialized; foreign-owned key is dropped without claim.
- [x] 1.7 Run the new tests — expect RED until previous/missing lookup ignores Fusion identity ownership.

**Verify:** `npx vitest run src/model/__tests__/fusionAccount.test.ts src/model/__tests__/fusionLayers.test.ts src/model/__tests__/fusionLayers.refreshLookup.test.ts`

## 2. Foreign-owned detection and drop (green)

- [x] 2.1 Add an O(linked-keys) helper (FusionRun or beside `isManagedAccountLinkedInFusion`) that answers foreign-owned relative to **this** Fusion account’s identity id (D1, D6). Do not scan all Fusion accounts per key. Do not treat this identity as foreign. Do not treat a NonMatched Fusion account as owner by itself.
- [x] 2.2 In the previous/missing uncorrelated lookup, after identity matching, drop foreign-owned keys with prune-deleted bookkeeping and do **not** `claimAccount` (D2, D3). Keep targeted `FusionRun.get(key)` lookups (no full-queue scan).
- [x] 2.3 Treat a pending foreign-owned drop as `requireLiveSourceSnapshots` **before** any claim, same as prune-deleted inventory miss (D4).
- [x] 2.4 Reuse prune-deleted history wording (`Removed managed account missing reference: {key}`); no per-account INFO (D5).
- [x] 2.5 Re-run 1.x — GREEN. Existing claim-only, prune-deleted, and targeted-lookup tests still pass.

**Verify:** same vitest command as 1.7 exit 0.

## 3. Verification

- [x] 3.1 Confirm canonical test command: `npm test` (global Vitest; do not pipe to `tail`). Focused files above are the apply loop.
- [x] 3.2 All delta spec scenarios covered by named automated tests (queue drop without claim, inventory ghost drop, non-foreign absorb, identity-matched keep, sibling materialize, claim-only unchanged when no foreign-owned key).
- [x] 3.3 `npm run typecheck` exit 0
- [x] 3.4 `npm run lint` exit 0

## 4. Documentation

- [x] 4.1 Add **Foreign-owned managed account** to `docs/glossary.md` to match the ubiquitous-language delta. Keep `docs/concepts/glossary.md` as the existing redirect-only router.
- [x] 4.2 JSDoc on the ownership helper naming Fusion identity (not NonMatched Fusion account, not prune-deleted inventory miss).

## 5. Changelog

- [x] 5.1 Create or update changelog entry for this change via **changelog-generator** during apply (PATCH Improvement). Refresh drops previous/missing managed account links when the account belongs to another Fusion identity; the owning identity can still claim it. Do not add Unreleased.
- [x] 5.2 Confirm the entry covers the user-visible exclusive-ownership behavior from proposal Capabilities.
