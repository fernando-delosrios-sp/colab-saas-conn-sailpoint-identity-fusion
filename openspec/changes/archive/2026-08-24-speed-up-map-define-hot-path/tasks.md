## 1. Characterization tests (behavior lock)

- [x] 1.1 Run existing mapping tests (must be green before edits): `npx vitest run src/services/mappingService/__tests__/mapService.test.ts src/services/mappingService/__tests__/helpers.test.ts`
- [x] 1.2 Run existing define/velocity tests: `npx vitest run src/services/definitionService/__tests__/defineService.test.ts src/services/definitionService/__tests__/formatting.test.ts src/services/definitionService/__tests__/templateEvaluator.test.ts`
- [x] 1.3 In `src/services/mappingService/__tests__/helpers.test.ts`, add a case that `buildAttributeMappingConfig('employeeId', maps, 'first')` returns `lookupAttributeNames` equal to unique `existingAttributes` then `employeeId` (deduped). This test **fails** until `AttributeMappingConfig` and `buildAttributeMappingConfig` are updated (red is expected).
- [x] 1.4 In `src/services/mappingService/__tests__/mapService.test.ts`, add **`does not replace current bag object when needsRefresh is false and history is empty`**: build a managed Fusion account, set `fusionAccount.setNeedsRefresh(false)` (or equivalent `layers.needsRefresh = false` if that is the public API — use `setNeedsRefresh` as in `fusionService.ts`), capture `const before = fusionAccount.attributeBag.current`, call `mapAttributes`, expect `fusionAccount.attributeBag.current === before`. Fails until MappingService skip-clone lands.

**Verify**: 1.1–1.2 exit 0. 1.3–1.4 fail because `lookupAttributeNames` is missing and current is cloned — not because of fixture errors.

## 2. MappingService plan + index (green)

- [x] 2.1 In `src/services/definitionService/types.ts`, add `lookupAttributeNames: string[]` to `AttributeMappingConfig` with a one-line JSDoc: unique source attribute names plus target name, construction-time.
- [x] 2.2 In `src/services/mappingService/helpers.ts` `buildAttributeMappingConfig`, set `lookupAttributeNames: Array.from(new Set([...(attributeMap.existingAttributes || [attributeName]), attributeName]))` in both the attributeMap and default branches (default branch is `[attributeName]`).
- [x] 2.3 Replace every `Array.from(new Set([...config.sourceAttributes, config.attributeName]))` in `processAttributeMapping` / `processSingleValueMerge` / `processMultiValueMerge` with `config.lookupAttributeNames`. Do not change Main/Origin single-snapshot control flow.
- [x] 2.4 In `MappingService`, cache `sourceOrder` from `this.sourceConfigs.map((sc) => sc.name)` at construction (private field). When identity origin needs `IDENTITIES_SOURCE_NAME`, copy then push — never mutate the cached array. Cache mapping target names the same way `getAttributeMappingTargetNames` does today (`attributeMaps` `newAttribute` unique list); call that once when building `cachedAttributeMappingConfig`.
- [x] 2.5 Replace `findAccountByIdInSourceMap` usage inside `mapAttributes` with a function `buildSnapshotIndex(sourceAttributeMap)` local to the file or private method: iterate `sourceAttributeMap.values()` then each account; for each, `key = getManagedAccountSnapshotKey(account)` and `id = trimStr(account?._id)`; `if (key && !index.has(key)) index.set(key, account)` and same for `id`. Lookup origin/main via `index.get(id)`. After `mainAccount` is written, `prioritizedAccount = mainAccountId ? index.get(mainAccountId) : undefined` (try snapshot key and trimmed id — store both keys at index build). Delete `findAccountByIdInSourceMap` if unused.
- [x] 2.6 No-op clone: only shallow-copy current when `(needsRefresh && sourceAttributeMap.size > 0)` **or** `fusionAccount.history.length > 0`. If mapping runs, keep writing into a working object then assign `attributeBag.current = attributes` as today (including deletes). If mapping does not run and history is empty, return after ensuring empty source arrays (existing `for (const source of fusionAccount.sources)` loop may stay). If mapping does not run and history is non-empty, set `attributeBag.current[FusionAttribute.History] = [...fusionAccount.history]` without cloning.
- [x] 2.7 Re-run mapping tests. Origin pin test `pins Origin account merge to originAccount rather than the first account on its source` must still pass. New 1.3–1.4 tests must pass.

**Verify**: `npx vitest run src/services/mappingService/__tests__/mapService.test.ts src/services/mappingService/__tests__/helpers.test.ts` exit 0.

## 3. DefinitionService context + sync loop + debug (green)

- [x] 3.1 In `DefinitionService` constructor, set `private readonly anyNormalDefinitionRefresh = this.normalDefinitions.some((def) => def.refresh)`. In `refreshNormalAttributes`, use that field instead of `.some` per account. Keep `forceAttributeRefresh` and `needsReset` or-ed as today.
- [x] 3.2 Change `processNormalDefinition` to a synchronous `private processNormalDefinition(...): void`. Remove `async`/`await` on its body. In `refreshNormalAttributes` and `refreshAllAttributes`, call it without `await`. Keep try/catch.
- [x] 3.3 Rewrite `buildVelocityContext` to `const context: Record<string, any> = Object.create(fusionAccount.attributeBag.current)` then assign `name` (if identity alias and `context.name === undefined` — this reads through the prototype, same as spread), `identity`, `accounts`, `previous`, `sources`, `account`, `originSource`, `originAccount`. Do not `{ ...current }`. Keep `getOrderedAccountsForContext` / `resolveOriginAccountObjectForVelocity` logic.
- [x] 3.4 Wrap `this.log.debug` in `refreshNormalAttributes` and the value-assignment debug in `processNormalDefinition` with `if (this.log.getLogLevel() === 'debug')`. Do not wrap `this.log.error`.
- [x] 3.5 In `formatting.ts` `evaluateVelocityTemplate`, delete the `logger.debug` calls for evaluating, compiled, and result. Keep the empty-string debug **only if** it is similarly gated; preferred: delete it too (empty result still returns `undefined`). Keep `logger.error` in `truncateResultToMaxLength`. If `logger` is then unused in `evaluateVelocityTemplate`, keep the `logger` import for truncate errors.
- [x] 3.6 Add tests in `defineService.test.ts`: (a) two Normal definitions where the second expression is `$first` and the first writes `Ada` — expect `full`/`second` is `Ada`; (b) `current.identity` is a string but identity bag `{ name: 'Jane' }` and expression `$identity.name` yields `Jane`. Add in `formatting.test.ts` (or a small new `evaluateVelocityTemplate.debug.test.ts` next to it): spy `logger.debug` from `@sailpoint/connector-sdk` if the module is already mocked in this suite; if spying is brittle, assert only that `$firstName` still renders `John` and existing `$constructor` tests pass — do not spend more than one attempt on a logger spy.
- [x] 3.7 Re-run define/velocity tests including the clearing describe block.

**Verify**: `npx vitest run src/services/definitionService/__tests__/defineService.test.ts src/services/definitionService/__tests__/formatting.test.ts src/services/definitionService/__tests__/templateEvaluator.test.ts` exit 0.

## 4. Verification

- [x] 4.1 `npx vitest run src/services/mappingService/__tests__/mapService.test.ts src/services/mappingService/__tests__/helpers.test.ts src/services/definitionService/__tests__/defineService.test.ts src/services/definitionService/__tests__/formatting.test.ts src/services/definitionService/__tests__/templateEvaluator.test.ts src/services/accountAssembly/__tests__/accountAssembly.test.ts`
- [x] 4.2 `npm run typecheck`
- [x] 4.3 `npm run lint` (do not pipe to `tail`)
- [x] 4.4 `git diff --stat` must **not** include `src/services/logService/`, `src/services/matchingService/`, `src/utils/safeVelocityCompile.ts`, `src/services/accountAssembly/accountAssembly.ts`, or `src/services/fusionService/__tests__/fusionService.aggregation.test.ts`

Expected: typecheck and lint exit 0.

## 5. Documentation

- [x] 5.1 Do not edit use-guides. If `docs/reference/match-flow.md` or `docs/operations/` claims Map/Define logs every template evaluation, delete that sentence only. Otherwise no docs file changes.
- [x] 5.2 Invoke **changelog-generator**. PATCH-class improvement: Fusion account Map/Define during assembly (and Match `assembleManagedAccount`) does less per-account copying, snapshot scanning, and debug work; mapped values and Velocity results unchanged. Merge into today’s `CHANGELOG.md` date section (`## 2026-08-24` or new date if apply is later). No Unreleased heading. No new config key.

**Verify**: `npm run lint:markdown` only if a `docs/**/*.md` file changed; `CHANGELOG.md` has a dated Improvements (or equivalent 🔧) bullet.

## 6. Suggested executor toolkit

- Use **tdd**: 1.3–1.4 red, then section 2 green, then section 3 green.
- Use **changelog-generator** in section 5.
- Do not invoke **apply-code-changes** from inside itself; this `tasks.md` is the apply input.
