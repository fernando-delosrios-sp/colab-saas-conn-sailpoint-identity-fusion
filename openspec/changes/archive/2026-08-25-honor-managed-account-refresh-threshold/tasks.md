## 1. Characterization tests (red first)

- [x] 1.1 In `src/model/__tests__/fusionAccount.test.ts`, add a describe `managed-account modified vs fusion modified` using the file’s existing `FusionAccount.configure` (`fusionAccountRefreshThresholdInSeconds: 3600`). Pattern: `addManagedAccountLayer merges managed account` (queue + `previousAccountIds` from persisted `attributes.accounts`). Put ISO `modified` on the Fusion ISC account and on the queued managed account. Do not use `undefined` as the Fusion timestamp in assertions.
- [x] 1.2 Cases (Fusion `modified` = `2024-06-01T12:00:00.000Z` unless noted):
  - (a) persisted `accounts: ['src-a::keep-1']`, managed `modified` `2024-01-01T00:00:00.000Z` (older) → after `addManagedAccountLayer`, `needsRefresh` is `false`; key claimed from queue
  - (b) same correlation, managed `modified` `2024-06-01T14:00:00.000Z` (2 hours later, exceeds 3600s) → `needsRefresh` is `true`
  - (c) same correlation, managed `modified` `2024-06-01T12:30:00.000Z` (30 minutes later, within 3600s) → `needsRefresh` is `false`
  - (d) Fusion from `fromIdentity` (no previous ids), managed on identity index → `needsRefresh` is `true` even if managed `modified` is older than now
  - (e) persisted Fusion **without** `modified`, previously correlated managed with `modified` `2024-06-01T14:00:00.000Z` → timestamp path does not set `needsRefresh` (`false` if no new blend / prune)
- [x] 1.3 Optional: in `src/utils/__tests__/date.test.ts`, add `isNewerThan` cases with `thresholdMs = 60_000`: T vs T+30s false; T vs T+90s true. Do not change `src/utils/date.ts`.
- [x] 1.4 Run tests — expect RED on 1.2(a), 1.2(c), and 1.2(e) while `setManagedAccount` still passes `undefined` as the reference.

**Verify:** `npx vitest run src/model/__tests__/fusionAccount.test.ts` — new cases (a)(c)(e) fail; existing prune/orphan `needsRefresh` tests still pass.

## 2. Wire Fusion modified into setManagedAccount (green)

- [x] 2.1 Thread the `modified` parameter of `FusionLayers.addManagedAccountLayer` into `setManagedAccount` (new arg, e.g. `fusionModified?: string`). Update `processIdentityMatchedAccounts`, `processDeclaredAccountIds`, and `processPreviousRunMatchedAccounts`.
- [x] 2.2 Replace `isNewerThan(account.modified, undefined, thresholdMs)` with: if `fusionModified` is a non-empty string, `isNewerThan(account.modified, fusionModified, thresholdMs)`; else skip the timestamp check.
- [x] 2.3 Keep `isNewAccount` → `needsRefreshValue = true` and prune-deleted / orphan-clear logic unchanged.
- [x] 2.4 `buildFromManagedAccount` / other `setManagedAccount` callers: omit `fusionModified` or pass account modified; new-blend path must still set `needsRefresh`.
- [x] 2.5 Re-run 1.x — GREEN.

**Verify:** `npx vitest run src/model/__tests__/fusionAccount.test.ts src/model/__tests__/fusionLayers.refreshLookup.test.ts src/model/__tests__/fusionLayers.test.ts src/utils/__tests__/date.test.ts` exit 0.

**Grep:** `rg "isNewerThan\\(account\\.modified, undefined" src/model/fusionLayers.ts` matches nothing.

## 3. Verification

- [x] 3.1 `npx vitest run src/model/__tests__/fusionAccount.test.ts src/model/__tests__/fusionLayers.refreshLookup.test.ts src/services/mappingService/__tests__/mapService.test.ts src/services/definitionService/__tests__/defineService.test.ts src/services/fusionService/__tests__/fusionService.aggregation.test.ts`
- [x] 3.2 `npm run typecheck` exit 0
- [x] 3.3 `npm run lint` exit 0
- [x] 3.4 Confirm no files outside design.md Scope in `git status`

## 4. Documentation

- [x] 4.1 Invoke **changelog-generator**. PATCH Improvement under `## 2026-08-25 · v2.2.0`: Fusion accounts no longer treat every managed account with a real `modified` date as dirty; Refresh-off Map/Define run when the managed account is newer than the Fusion account beyond the grace window, or on new blend / delete / force refresh. Do not name the internal config key. Do not add Unreleased.
- [x] 4.2 Optional: one sentence in `docs/use-guides/configuration/defining-attributes.md` under Refresh-off that underlying source change is a new or removed managed account, or a managed-account `modified` newer than the Fusion account by more than a short grace period. If you edit that file, `npm run lint:docs-guides` and `npm run lint:markdown`.

## STOP conditions

- Drift vs `41781ad` on in-scope files
- `isNewerThan` threshold meaning is not `iso > reference + thresholdMs`
- Green requires keeping `undefined` as the timestamp reference
- Identity-layer or definitionService changes appear required
- Orphan prune test needs `needsRefresh` true to pass after this fix

## Suggested executor toolkit

- **tdd** for sections 1 → 2
- **changelog-generator** for section 4
- Do not implement unique-register lock removal (deferred finding)
