## 1. Decompose `initializeBasicProperties`

- [x] 1.1 Replace `initializeBasicProperties` with `initializeCoreState`, `initializeSources`, and `initializeAttributeState`.
- [x] 1.2 Tighten the `initializeCoreState` config: remove `displayName`, `sources`, and `attributes`; make `type` and `nativeIdentity` required.
- [x] 1.3 Ensure boolean handling preserves `false` values for `disabled` and `needsRefresh`.
- [x] 1.4 Ensure `initializeAttributeState` still seeds `_attributeBag.previous` only for `FusionAccountKind.Fusion` with a native identity.

## 2. Add class-specific internal builders

- [x] 2.1 Add `setOrigin(sourceName, accountId)` for managed-origin creation-path assignment.
- [x] 2.2 Add `markIdentityOrigin(accountId)` to keep `originSource === 'Identities'` and `baseline` status in sync for identity-origin creation.
- [x] 2.3 Add `restoreOriginMetadata(account)` for persisted origin source/account restoration; have it call `ensureBaselineForIdentityOrigin()` so restored identity-origin records stay in sync.
- [x] 2.4 Add `restoreIdentityLinkage(account)` for `identityId` fallback from persisted attributes.
- [x] 2.5 Add `restorePersistedCollections(account)` for previous account IDs and history import.
- [x] 2.6 Add `ensureBaselineForIdentityOrigin()` for defensive baseline re-assertion.

## 3. Refactor factory methods

- [x] 3.1 Rewrite `fromFusionAccount` as an orchestrator of the new builders.
- [x] 3.2 Rewrite `fromIdentity` as an orchestrator of the new builders.
- [x] 3.3 Rewrite `fromManagedAccount` as an orchestrator of the new builders.
- [x] 3.4 Rewrite `fromFusionDecision` as an orchestrator of the new builders.
- [x] 3.5 Remove the old `initializeBasicProperties` method once all callers are migrated.

## 4. Tests and verification

- [x] 4.1 Run the existing `fusionAccount.test.ts` suite and confirm all tests pass without changes.
- [x] 4.2 Add tests for any restored-state edge cases not already covered (e.g., persisted `missing-accounts`, history import, identityId fallback).
- [x] 4.3 Run the full test suite to ensure no regressions in dependent modules.
