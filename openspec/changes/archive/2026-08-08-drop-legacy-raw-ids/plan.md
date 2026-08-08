# Drop Legacy Raw Managed Account IDs — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Remove backwards compatibility for legacy raw managed account IDs on `accounts`, `missing-accounts`, and `originAccount` schema attributes; enforce composite-key-only contract in code, specs, tests, and docs.

**Architecture:** Centralize validation on existing `normalizeCompositeManagedAccountKey` / `isCompositeManagedAccountKey` helpers in `src/model/managedAccountKey.ts`. Remove all `?? rawKey` fallbacks. `FusionLayers.addManagedAccountLayer` already drops non-composite keys during set normalization — extend test coverage and tighten `applyOriginMetadata`. Account-read rebuild keeps skip-on-invalid behavior with reframed log messages.

**Tech Stack:** TypeScript, Node.js 24, Vitest, SailPoint Connector SDK

**Canonical test command:** `npm test`

---

## Task 1: Remove fallback in candidateRegistry

**Files:** `src/services/matchingService/candidateRegistry.ts`, `src/services/matchingService/__tests__/` (if exists)

- [ ] **Step 1:** Locate `candidateKey()` — change `return normalizeCompositeManagedAccountKey(originAccount) ?? originAccount` to return `normalizeCompositeManagedAccountKey(originAccount)` only (undefined when invalid).
- [ ] **Step 2:** Run `npm test -- src/services/matchingService` (or full suite if no scoped tests).
- [ ] **Step 3:** Commit: `refactor(matching): drop raw-ID fallback in candidate registry`

---

## Task 2: Remove fallbacks in correlation and form services

**Files:**
- `src/services/correlationManager.ts`
- `src/services/formService/formInstanceAnalyzer.ts`
- `src/services/formService/formService.ts`

- [ ] **Step 1:** In `correlationManager`, replace `normalizeCompositeManagedAccountKey(rawKey) ?? rawKey` with composite-only.
- [ ] **Step 2:** In `formInstanceAnalyzer.extractAccountIdFromInstance`, return `normalizeCompositeManagedAccountKey(accountId)` without fallback.
- [ ] **Step 3:** In `formService`, same pattern for account ID normalization.
- [ ] **Step 4:** Update `formProcessor.test.ts` if tests expect raw ID passthrough.
- [ ] **Step 5:** Run `npm test -- src/services/formService src/services/correlationManager`.
- [ ] **Step 6:** Commit: `refactor(forms,correlation): require composite managed account keys`

---

## Task 3: Tighten originAccount loading

**Files:** `src/model/fusionAccount.ts`, `src/model/__tests__/fusionAccount.test.ts` (or nearest test file)

- [ ] **Step 1:** Write failing test — managed-origin `originAccount: "raw-uuid"` is not retained; Identities-origin identity ID is retained.
- [ ] **Step 2:** Update `applyOriginMetadata`:

```typescript
// Pseudocode — identity origin: keep trimmed identity ID
// Managed origin: only set when normalizeCompositeManagedAccountKey succeeds
```

- [ ] **Step 3:** Run failing test → pass.
- [ ] **Step 4:** Commit: `fix(fusion-account): reject raw originAccount for managed sources`

---

## Task 4: Account-read rebuild messaging

**Files:** `src/operations/helpers/rebuildFusionAccount.ts`, `src/operations/helpers/__tests__/rebuildFusionAccount.test.ts`

- [ ] **Step 1:** Update test name and expected warning from "Skipping legacy non-composite..." to invalid-key message per design D4.
- [ ] **Step 2:** Update `parseManagedAccountKeys` log string and JSDoc (remove "legacy" / "backwards compatibility").
- [ ] **Step 3:** Run `npm test -- src/operations/helpers/__tests__/rebuildFusionAccount.test.ts`.
- [ ] **Step 4:** Commit: `refactor(account-read): reframe invalid managed account key warnings`

---

## Task 5: Fusion account collection normalization tests

**Files:** `src/model/fusionLayers.ts` (verify only), fusion account test files

- [ ] **Step 1:** Add test — `fromFusionAccount` with mixed `accounts: ['raw-uuid', 'src::native']` retains only composite.
- [ ] **Step 2:** Add test — `missing-accounts` with raw UUID dropped.
- [ ] **Step 3:** Run targeted model tests.
- [ ] **Step 4:** Commit: `test(fusion): cover composite-only account reference loading`

---

## Task 6: Schema descriptions and user docs

**Files:** `src/data/schema.ts`, `docs/reference/standard-account-schema.md`

- [ ] **Step 1:** Update descriptions for `Accounts`, `MissingAccounts`, `OriginAccount` in `fusionAccountSchemaAttributes`.
- [ ] **Step 2:** Update three table rows in `standard-account-schema.md` — remove legacy backwards-compatibility sentences.
- [ ] **Step 3:** Run `npm run lint:markdown` on changed docs.
- [ ] **Step 4:** Commit: `docs(schema): require composite keys for account references`

---

## Task 7: Final verification

- [ ] **Step 1:** Run `npm test`.
- [ ] **Step 2:** Run `npm run lint`.
- [ ] **Step 3:** Grep production code for `?? originAccount`, `?? accountId`, `?? rawKey`, `legacy non-composite` — confirm none remain in scope.
- [ ] **Step 4:** Commit any lint fixes if needed.

---

## References

- Change design: `openspec/changes/drop-legacy-raw-ids/design.md`
- Spec deltas: `openspec/changes/drop-legacy-raw-ids/specs/*/spec.md`
- Prior art: `openspec/changes/archive/2026-06-19-remove-velocity-id-fallback/`
