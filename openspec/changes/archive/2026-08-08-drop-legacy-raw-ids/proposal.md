## Why

Identity Fusion NG documents and partially implements backwards compatibility for legacy raw managed account IDs (plain UUIDs without the `sourceId::nativeIdentity` composite form) on the `accounts`, `missing-accounts`, and `originAccount` schema attributes. The canonical contract already requires composite managed account keys everywhere new accounts are created, but tolerance code and documentation still advertise legacy support. This drift confuses operators, hides invalid persisted data, and forces every lookup path to carry `?? rawKey` fallbacks. Removing the feature makes the contract honest and simplifies maintenance.

## What Changes

**Schema attribute contract (`accounts`, `missing-accounts`, `originAccount`)**
- From: Non-composite managed account IDs are tolerated — silently dropped, skipped with "legacy" warnings, or passed through via normalization fallbacks.
- To: Only composite managed account keys (`sourceId::nativeIdentity`) are valid for managed-source references. Identity IDs remain valid for `originAccount` when `originSource` is `Identities`.
- Reason: Align runtime behavior with the documented canonical form and ubiquitous language.
- Impact: **Breaking** for tenants with persisted raw IDs until attributes are migrated.

**Production code fallbacks**
- From: `normalizeCompositeManagedAccountKey(value) ?? value` patterns in candidate registry, correlation, form processing, and origin metadata loading.
- To: Composite key or reject — no raw-ID fallback.
- Reason: Stop re-introducing invalid keys into lookups after normalization.
- Impact: Non-breaking for tenants already on composite keys.

**Account-read rebuild**
- From: Dedicated "legacy non-composite managed account keys are skipped with warning" behavior framed as backwards compatibility.
- To: Composite-only key parsing; invalid values logged as invalid managed account keys and skipped without failing the read.
- Reason: Same resilience, honest contract.
- Impact: Log message wording change only for compliant tenants.

**Documentation**
- From: `docs/reference/standard-account-schema.md` and schema attribute descriptions mention legacy raw ID support.
- To: Composite-key-only descriptions.
- Reason: Docs must match behavior.
- Impact: Non-breaking documentation correction.

## Capabilities

### New Capabilities

_(None — behavior tightening maps to existing capabilities.)_

### Modified Capabilities

- `account-read-operation`: Replace legacy-skip scenario with composite-only managed account key requirement during rebuild.
- `fusion-service`: Require composite keys for persisted `accounts` and `missing-accounts` references; tighten `originAccount` validation for managed-source origins.
- `schema-service`: Update standard attribute descriptions to composite-key-only contract.

## Impact

- `src/model/fusionAccount.ts` — `applyOriginMetadata` originAccount loading
- `src/model/fusionLayers.ts` — managed account key normalization (already drops non-composite; verify no re-entry)
- `src/operations/helpers/rebuildFusionAccount.ts` — key parsing and log messages
- `src/services/matchingService/candidateRegistry.ts`
- `src/services/correlationManager.ts`
- `src/services/formService/formInstanceAnalyzer.ts`
- `src/services/formService/formService.ts`
- `src/data/schema.ts` — attribute descriptions
- `docs/reference/standard-account-schema.md`
- Tests: `rebuildFusionAccount.test.ts`, `managedAccountKey.test.ts`, form/fusion tests referencing raw-ID fallbacks
- Spec deltas under this change's `specs/` directory
