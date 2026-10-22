## 1. Characterization tests (red first)

- [x] 1.1 Add `src/services/sourceService/__tests__/attributePruning.test.ts`: build a referenced attribute set from fixture config (schema names, `attributeMaps[].existingAttributes`, a Define template reading `$sources.get(...)[0].department`, match rule attributes); assert a managed account with 50 attributes registers with only referenced ones + system fields.
- [x] 1.2 Implicit-merge parity: unmapped managed attribute whose name matches a Fusion schema attribute survives pruning; non-schema unmapped attribute not referenced by any template is dropped.
- [x] 1.3 Ordering: JMESPath filter referencing a non-kept attribute still filters correctly; machine-account discard runs before pruning.
- [x] 1.4 Reference styles: attributes read via dot, bracket, and quoted Velocity reference styles (`$sources.get('AD')[0].department`, `$accounts[0]['custom-attr']`, `$account.employeeNumber`) are all kept — pruning is enforced, so every static reference style must work.
- [x] 1.5 Record mode: client capture fixture contains raw pages; work-queue bodies are pruned.
- [x] 1.6 Early clear: accountList aggregation test asserting `sources.fusionAccountsByNativeIdentity` is cleared entering Process (non-record), retained in record mode.
- [x] 1.7 JIT unique survival: aggregation with a unique definition where an account needs Output-time refresh produces identical values with the early clear in place (extend `fusionService.aggregation.test.ts` or `accountList.test.ts`).
- [x] 1.8 Report id resolution after early clear: aggregation-report path resolves the same account ids as before (reportAccountResolver coverage).
- [x] 1.9 Run new tests — expect RED on 1.1–1.6 (pruning and early clear not yet implemented); 1.7–1.8 SHOULD pass pre-implementation as characterization guards.

## 2. Referenced attribute set + pruning (green)

- [x] 2.1 Implement the referenced-attribute-set builder (small helper module under `src/services/sourceService/`): union of schema names, `attributeMaps[].existingAttributes`, textual attribute references extracted from Define/unique/form Velocity templates (dot, bracket, and quoted styles), and match rule attribute names. Computed once per run.
- [x] 2.2 Apply pruning in `managedAccountFetcher` page registration after JMESPath/machine filtering, and in the single-account fetch paths (`fetchManagedAccount`, `fetchSourceAccountByNativeIdentity`). Pruning is enforced — no configuration surface.
- [x] 2.3 Re-run 1.1–1.5 — GREEN.

**Verify:** `npx vitest run src/services/sourceService/__tests__`

## 3. Early clear of the raw Fusion account fetch cache

- [x] 3.1 In `refreshPhase` (`src/operations/helpers/accountListPhases.ts`), call `sources.clearFusionAccounts()` after `processFusionAccounts` when `!sources.run.isRecordMode`, with a DETAIL line.
- [x] 3.2 Keep the existing post-epilogue clear in `accountList.ts` as the record-mode safeguard (no-op in normal runs).
- [x] 3.3 Re-run 1.6–1.8 — GREEN.

**Verify:** `npx vitest run src/operations/__tests__/accountList.test.ts src/services/fusionService/__tests__/fusionService.aggregation.test.ts`

## 4. Verification

- [x] 4.1 `npm test` (global suite; do not pipe to `tail`) — exit 0
- [x] 4.2 `npm run test:scenario` — exit 0 (replay parity incl. pruning at registration)
- [x] 4.3 `npm run lint` — exit 0
- [x] 4.4 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)

## 5. Documentation

- [x] 5.1 Add **Attribute pruning** and **Referenced attribute set** to `docs/concepts/glossary.md` mirroring the ubiquitous-language delta.
- [x] 5.2 Document attribute pruning in the mapping/define configuration guides: managed source account attributes outside the referenced attribute set are pruned at Fetch; dynamic computed attribute access in Velocity templates (e.g. `$account[$name]`) is unsupported.
- [x] 5.3 JSDoc on the set builder and pruning call sites naming the canonical terms.
- [x] 5.4 If docs under `docs/` were edited: `npm run lint:markdown` (and `npm run lint:docs-guides` if `docs/use-guides/` was touched).

## 6. Changelog

- [x] 6.1 Create or update changelog entry via **changelog-generator** during apply (PATCH improvement: lower peak memory for large aggregations via enforced managed-account attribute pruning and earlier release of the raw Fusion account cache). Do not add Unreleased.
- [x] 6.2 Confirm entry covers user-visible Capabilities (source-service pruning, account-list cache lifetime, glossary terms).
