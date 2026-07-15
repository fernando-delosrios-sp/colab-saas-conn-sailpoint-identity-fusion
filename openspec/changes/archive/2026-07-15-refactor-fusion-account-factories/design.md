## Context

`FusionAccount` in `src/model/fusionAccount.ts` uses a private constructor and four static factory methods to enforce proper initialization. The shared initializer `initializeBasicProperties` currently handles scalar fields, source sets, attribute-bag seeding, and collection-set hydration in one method with a wide config bag. After initialization, the factory methods directly mutate internal fields (`_originSource`, `_originAccount`, `_statuses`, `_sources`, `previousAccountIds`, `_history`) to finish construction.

This design evolved as restoration logic accumulated in `fromFusionAccount`. The result is that construction concerns are not clearly separated, and `initializeBasicProperties` has become a complexity hotspot.

## Goals / Non-Goals

**Goals:**
- Split `initializeBasicProperties` into small, single-responsibility internal builder methods.
- Tighten the initialization config so it only includes fields relevant to each builder.
- Move class-specific construction logic into private instance methods with descriptive names.
- Keep the factory methods as readable orchestration recipes.
- Preserve all existing behavior and public API.

**Non-Goals:**
- No new public API.
- No behavior changes (e.g., no changes to status/action derivation, origin semantics, or attribute resolution).
- No fluent builder pattern or separate builder class — builders are void instance methods.
- No new dependencies.

## Decisions

### 1. Decompose `initializeBasicProperties`

Replace the single wide initializer with three focused private methods:

```typescript
private initializeCoreState(config: {
    type: FusionAccountKind
    nativeIdentity: string
    name: string | null | undefined
    sourceName: string | null | undefined
    disabled?: boolean
    needsRefresh?: boolean
    identityInfo?: IdentityInfo
    iscAccountId?: string | null
    modified?: string
}): void
```

- Removes `displayName` (unused by all callers).
- Removes `sources` and `attributes` (moved to their own builders).
- Keeps explicit `undefined` checks for booleans so `false` values are preserved.

```typescript
private initializeSources(sources: string[] | Set<string> | undefined): void
```

```typescript
private initializeAttributeState(
    attributes: Attributes | null | undefined,
    kind: FusionAccountKind,
    nativeIdentity?: string
): void
```

- Seeds `_attributeBag.current`.
- Seeds `_attributeBag.previous` only for `FusionAccountKind.Fusion` with a native identity.
- Hydrates `_missingAccountIds`, `_reviews`, `_statuses`, `_actions` from persisted attributes.

### 2. Add class-specific internal builders

Extract construction steps that are unique to `FusionAccount` into private instance methods:

- `setOrigin(sourceName, accountId)` — sets `_originSource` and `_originAccount` for managed-origin creation paths.
- `markIdentityOrigin(accountId)` — sets `_originSource = 'Identities'`, `_originAccount`, and `baseline` status in one place so the identity-origin signal and entitlement cannot drift apart.
- `restoreOriginMetadata(account)` — restores and normalizes persisted origin metadata in `fromFusionAccount`; calls `ensureBaselineForIdentityOrigin()` so restored identity-origin records stay in sync.
- `restoreIdentityLinkage(account)` — restores `identityId` from persisted `attributes.identityId` when the SDK Account does not expose it.
- `restorePersistedCollections(account)` — restores `previousAccountIds` and imports history.
- `ensureBaselineForIdentityOrigin()` — defensively re-asserts baseline status and `Identities` source for identity-origin records.

Existing helpers like `setUncorrelatedStatus`, `setUncorrelatedAccount`, `setBaseline`, and `setManagedAccount` continue to be used.

### 3. Factory methods become orchestrators

Each factory method validates inputs, creates the instance, and calls builders in sequence. For example:

- `fromIdentity` calls `initializeCoreState`, `initializeSources`, `initializeAttributeState`, `markIdentityOrigin`, `setIdentityIdAttribute`.
- `fromFusionAccount` calls the restoration builders plus the shared attribute/state builders.
- `fromManagedAccount` and `fromFusionDecision` call the creation builders plus uncorrelated-state setup.

### 4. Reusable logic stays in helpers

Existing utility functions (`buildIdentityInfo`, `buildManagedAccountKey`, `getManagedAccountKeyFromAccount`, `resolveCompositeManagedKeyFromFusionRecord`, `attributeToSet`, etc.) remain unchanged. If needed, one tiny static helper may be added for deriving the baseline source set from persisted `statuses`.

## Risks / Trade-offs

- **Indirection vs. readability:** More private methods means readers may need to jump more. Mitigation: name each builder after the *concept* it represents, not the fields it sets, and keep each method small enough to fit on screen.
- **Private method testing:** The new builders are private and will be exercised through existing public factory tests. No dedicated unit tests for private methods are planned.
- **Regression risk:** The refactor touches the construction path for all `FusionAccount` instances. Mitigation: preserve the existing test suite and verify it passes without modification.
