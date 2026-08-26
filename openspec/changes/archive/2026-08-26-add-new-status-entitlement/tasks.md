## 1. Catalog contract tests (red)

- [x] 1.1 In `src/model/__tests__/statusEntitlement.test.ts`, change the member count assertion from eleven to twelve and expect `StatusEntitlement.New` / `'new'` among enum values and `statuses` ids.
- [x] 1.2 Run `npx vitest run src/model/__tests__/statusEntitlement.test.ts` — expect RED until the enum and catalog are updated.

## 2. Factory tests (red)

- [x] 2.1 In `src/model/__tests__/fusionAccount.test.ts` Factory Methods: `fromIdentity`, `fromManagedAccount`, and `fromFusionDecision` `statuses` SHALL contain `'new'` (keep existing `baseline` / `uncorrelated` assertions).
- [x] 2.2 Add `fromFusionAccount` cases: persisted `attributes.statuses` includes `'new'` → reconstructed `statuses` does not contain `'new'`; persisted statuses without `'new'` still omit `'new'`.
- [x] 2.3 Run `npx vitest run src/model/__tests__/fusionAccount.test.ts` — expect RED on the new assertions.

## 3. Catalog + factory implementation (green)

- [x] 3.1 Add `StatusEntitlement.New = 'new'` in `src/model/statusEntitlement.ts`.
- [x] 3.2 Add the catalog row in `src/data/status.ts`: id from the enum, name `New`, description that the Fusion account was created in this aggregation (and is removed when reconstructed from a previous Fusion account).
- [x] 3.3 After existing status hydrate in `fromIdentity`, `fromManagedAccount`, and `fromFusionDecision`, add `StatusEntitlement.New` via collections (enum only, no string literal).
- [x] 3.4 After `fromFusionAccount` hydrate (including identity-origin baseline repair), remove `StatusEntitlement.New`.
- [x] 3.5 Re-run 1.2 and 2.3 — GREEN. Update any other tests that snapshot exact first-time `statuses` arrays so they include `'new'` only for first-time factories.

**Grep:** production adds/removes of `new` use `StatusEntitlement.New`, not `'new'`.

## 4. Identity reuse (does not add new)

- [x] 4.1 Add or extend an `IdentityProcessor` / fusionService aggregation test: existing Fusion account from `fromFusionAccount` reused for a recreated identity MUST NOT gain `'new'`.
- [x] 4.2 Confirm reuse of a same-run first-time account still has `'new'` (created this run, not reconstructed).
- [x] 4.3 Run the focused identity-processor / aggregation file — GREEN without adding `new` in the reuse path.

## 5. Verification

- [x] 5.1 Confirm canonical test command: `npm test` (global Vitest; do not pipe to `tail`). Apply loop uses the focused files above.
- [x] 5.2 All delta spec scenarios covered by named automated tests (`New` wire value, twelve members, three first-time factories, strip on `fromFusionAccount`, identity reuse).
- [x] 5.3 `npm test` exit 0
- [x] 5.4 `npm run lint` exit 0

## 6. Documentation

- [x] 6.1 Add **New** / `new` to the status entitlements table in `docs/glossary.md` (created this aggregation; removed when reconstructed from a previous Fusion account).
- [x] 6.2 Mention `new` in `docs/reference/standard-account-schema.md` status-entitlements search tip.
- [x] 6.3 If those files are edited, `npm run lint:markdown`. JSDoc on `StatusEntitlement.New` if the enum file already documents members.

## 7. Changelog

- [x] 7.1 Create or update changelog entry for this change via **changelog-generator** during apply (PATCH Improvement). Fusion accounts created this aggregation carry the `new` status until the next aggregation reconstructs them from the previous Fusion account. Do not add Unreleased.
- [x] 7.2 Confirm entry covers user-visible Capabilities (`new` status entitlement; glossary).
