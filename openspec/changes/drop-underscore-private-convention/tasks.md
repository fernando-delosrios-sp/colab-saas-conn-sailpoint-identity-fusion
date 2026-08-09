# Tasks: Drop Underscore Private Convention

## 1. Documentation and enforcement

- [x] 1.1 Update `AGENTS.md` TypeScript conventions: `_` reserved for unused bindings; `private`/`protected` without `_`; accessor backing uses `Value` suffix
- [x] 1.2 Add `@typescript-eslint/naming-convention` rule to `eslint.config.mjs` forbidding `_` on class members; preserve unused-var ignore pattern

## 2. Model layer renames

- [x] 2.1 Rename `fusionAccount.ts` accessor backing fields (`_name` → `nameValue`, etc.) and plain private fields/methods
- [x] 2.2 Rename `fusionCollections.ts` private fields and methods (drop `_` prefix; accessor backing → `*Value`)
- [x] 2.3 Rename `fusionRun.ts` private fields and methods (drop `_` prefix; accessor backing → `*Value`)
- [x] 2.4 Rename `fusionLayers.ts`: public `_` fields → `private *Value`; drop `_` from private methods
- [x] 2.5 Rename remaining model privates in `fusionCorrelation.ts`

## 3. Services renames

- [x] 3.1 Rename remaining `_` private fields/methods in `sourceService.ts`
- [x] 3.2 Rename remaining `_` private fields/methods in `schemaService.ts`, `matchingService.ts`, `formService.ts`, `definitionService/stateWrapper.ts`, `clientService.ts`, `sdkApiAdapter.ts`

## 4. Test updates

- [x] 4.1 Update `(obj as any)._…` references in `sourceService` tests to new private field names
- [x] 4.2 Update `(obj as any)._…` references in `fusionRun` and other model/service tests
- [x] 4.3 Prefer public accessors over backing-field pokes where sufficient

## 5. Verification

- [x] 5.1 Confirm zero `private _` / `protected _` declarations remain in `src/` (grep check)
- [x] 5.2 Run `npm run lint` — ESLint passes; knip pre-existing issues unchanged
- [x] 5.3 Run `npm test` — 1504 passed (pre-existing unhandled rejections in recording test)

## 6. Documentation

- [x] 6.1 Update `AGENTS.md` for private member naming convention (covers spec scenario: TypeScript conventions documented)
- [x] 6.2 Document unused-binding and accessor-backing rules in `AGENTS.md` (covers spec scenarios: unused binding, Value suffix)
- [x] 6.3 README / MkDocs — N/A (no user-visible change; mark complete with reason)

## 7. Changelog

- [x] 7.1 Create or update changelog entry — N/A (internal convention refactor; no user-visible release note unless requested)
- [x] 7.2 Confirm no user-visible capability changes from `project-standards` delta
