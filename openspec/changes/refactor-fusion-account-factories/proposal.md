## Why

`FusionAccount` construction is currently split between a wide shared initializer (`initializeBasicProperties`) and direct field mutations inside each static factory method. `initializeBasicProperties` is flagged as a complexity hotspot and accepts a config bag wide enough that its contract is hard to reason about. The factory methods — especially `fromFusionAccount` — mix validation, key resolution, attribute hydration, origin restoration, and status setup in one block. This makes the construction flow hard to follow and increases the risk that future changes touch internal state inconsistently.

A previous change (`refactor-fusion-account-helpers`) already fixed a latent `_missingAccountIds` initialization bug. This change continues that cleanup by restructuring how `FusionAccount` builds its internal state.

## What Changes

- Decompose `initializeBasicProperties` into focused, void internal builder methods:
  - `initializeCoreState` — scalar fields only, with a tightened config shape
  - `initializeSources` — source set initialization
  - `initializeAttributeState` — attribute bag seeding and collection-set hydration
- Add class-specific internal builder methods for construction steps that mutate `FusionAccount` state:
  - `setOrigin(sourceName, accountId)` — managed-origin creation paths
  - `markIdentityOrigin(accountId)` — keeps `originSource === 'Identities'` and `baseline` status in sync
  - `restoreOriginMetadata(account)` — persisted origin source/account restoration for `fromFusionAccount`; calls `ensureBaselineForIdentityOrigin()` to keep restored identity-origin records in sync
  - `restoreIdentityLinkage(account)` — `identityId` fallback from persisted attributes
  - `restorePersistedCollections(account)` — previous account IDs and history import
  - `ensureBaselineForIdentityOrigin()` — defensive baseline re-assertion
- Refactor the four static factory methods (`fromFusionAccount`, `fromIdentity`, `fromManagedAccount`, `fromFusionDecision`) into thin orchestrators that call the new internal builders in sequence.
- Keep reusable cross-cutting logic in existing external utilities (e.g., `buildIdentityInfo`, `buildManagedAccountKey`, `resolveCompositeManagedKeyFromFusionRecord`) and add only tiny new static helpers if needed (e.g., deriving the baseline source set from persisted statuses).
- Update `src/model/__tests__/fusionAccount.test.ts` to preserve existing coverage and add any missing assertions for restored state.

## Capabilities

### New Capabilities
- `fusion-account-construction`: documents how `FusionAccount` factory methods build and restore internal state.

### Modified Capabilities
- (None — no behavior contract changes)

## Impact

- **Affected code:** `src/model/fusionAccount.ts` and `src/model/__tests__/fusionAccount.test.ts`.
- **Impact:** Improved readability of `FusionAccount` construction, a narrower and more explicit initialization contract, and centralized internal state mutation. No public API or runtime behavior changes.
