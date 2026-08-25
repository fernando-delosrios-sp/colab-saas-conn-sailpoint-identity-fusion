## 1. Characterization tests — refresh flag matrix (red first)

- [x] 1.1 In `src/services/definitionService/__tests__/defineService.test.ts`, add describe `refresh flag semantics`:
  - (a) `refresh: false`, existing value, `needsRefresh: false` → spy `evaluateAttributeTemplate` not called
  - (b) `refresh: true`, existing value, `needsRefresh: false` → called
  - (c) `refresh: false`, existing value, `needsRefresh: true` → called
  - (d) `forceAttributeRefresh: true` with refresh false → called
- [x] 1.2 Add test: all definitions `refresh: false`, account `needsRefresh: false` → `refreshNormalAttributes` returns immediately (no loop)
- [x] 1.3 Run tests — expect RED.

**Verify:** `npx vitest run src/services/definitionService/__tests__/defineService.test.ts` fails on new cases only.

## 2. Per-definition and account-level gates (green)

- [x] 2.1 Remove `this.anyNormalDefinitionRefresh` from account-level `forceRefresh` / `shouldRefresh` in `refreshNormalAttributes`.
- [x] 2.2 Add entry condition: enter loop when `needsRefresh || needsReset || forceAttributeRefresh || hasEligibleRefreshTrueDefinition(fusionAccount)`.
- [x] 2.3 In `processNormalDefinition`, after static/immutable checks, skip when `!definition.refresh && !needsRefresh && !needsReset && !forceAttributeRefresh && hasExistingValue`.
- [x] 2.4 Remove unused `anyNormalDefinitionRefresh` field if no longer referenced; else keep with comment if used elsewhere.
- [x] 2.5 Wire instrumentation `definitionsSkipped` increment if callback exists.
- [x] 2.6 Re-run 1.x tests — GREEN.

**Verify:** `npx vitest run src/services/definitionService/__tests__/defineService.test.ts` exit 0.

## 3. Render context reuse

- [x] 3.1 Add `createRenderContextForPass(callerContext: RenderContext): RenderContext` in `formatting.ts` — null prototype, helpers assigned once, caller properties copied once via existing `copyVelocityCallerContext`.
- [x] 3.2 Add overload or sibling `evaluateVelocityTemplateWithContext(renderContext, expression, maxLength?)` that renders without re-copying caller.
- [x] 3.3 In `refreshNormalAttributes`, create render context once per account; pass to `evaluateAttributeTemplate` / update internal path; after each write, set own property on render context.
- [x] 3.4 Ensure `formatting.test.ts` `$constructor` and helper tests still pass; add spy test that `copyVelocityCallerContext` called once per refresh pass with 3 definitions (mock or module spy).

**Verify:** `npx vitest run src/services/definitionService/__tests__/formatting.test.ts src/services/definitionService/__tests__/defineService.test.ts` exit 0.

## 4. Datefns regex cache

- [x] 4.1 In `contextHelpers/dateUtils.ts`, cache `buildFormatRegex` results by format string.
- [x] 4.2 Add unit test in existing dateUtils or defineService test file: two parses same format reuse cache (spy RegExp constructor optional — prefer behavior test only).

**Verify:** relevant tests exit 0.

## 5. Verification

- [x] 5.1 `npx vitest run src/services/definitionService/__tests__/defineService.test.ts src/services/definitionService/__tests__/formatting.test.ts src/services/definitionService/__tests__/templateEvaluator.test.ts src/services/accountAssembly/__tests__/accountAssembly.test.ts`
- [x] 5.2 `npm run typecheck`
- [x] 5.3 `npm run lint`
- [x] 5.4 With instrumentation: on tenant-like config (17 refresh true, 5 false), compare `definitionsEvaluated` and `normalDefineMs` on Refresh before/after — expect lower evaluated count on unchanged accounts.

## 6. Documentation

- [x] 6.1 Invoke **changelog-generator**. PATCH: Normal Define honors per-definition refresh flag and reduces Velocity context copying during Refresh. `CHANGELOG.md` dated section.
- [x] 6.2 No use-guide edit unless review finds guide/code mismatch after fix (expected: aligned).

## STOP conditions

- Sequential definition visibility test fails
- Static / immutable / falsy-clear tests fail
- refresh=Yes definitions skipped when needsRefresh false
- `$constructor` security test fails
- Removing anyNormalDefinitionRefresh causes Define to never run for refresh=Yes-only configs — fix entry condition before proceeding

## Suggested executor toolkit

- Use **tdd** sections 1 → 2 → 3
- Apply after `instrument-account-list-refresh` DONE
- May apply in parallel with `index-refresh-managed-account-lookups` after instrumentation
