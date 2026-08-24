## Context

Planned at git `185f89d` (2026-08-24). Drift check (run first):

```bash
git diff --stat 185f89d..HEAD -- \
  src/services/mappingService/mappingService.ts \
  src/services/mappingService/helpers.ts \
  src/services/mappingService/types.ts \
  src/services/definitionService/types.ts \
  src/services/definitionService/definitionService.ts \
  src/services/definitionService/formatting.ts \
  src/services/accountAssembly/accountAssembly.ts
```

If any of those files disagree with the excerpts below, STOP.

Working tree at plan time also had an unrelated dirty file `src/services/fusionService/__tests__/fusionService.aggregation.test.ts`. Do not stage or “fix” it as part of this change.

### Call chain (why this is the Fusion-account build hot path)

`AccountAssembly.applyAttributeProcessing` (`src/services/accountAssembly/accountAssembly.ts`):

```102:106:src/services/accountAssembly/accountAssembly.ts
    public async applyAttributeProcessing(fusionAccount: FusionAccount): Promise<void> {
        this.deps.mappingService.mapAttributes(fusionAccount, this.deps.run)
        await this.deps.definitionService.refreshNormalAttributes(fusionAccount)
        this.deps.definitionService.refreshReverseCorrelationAttributes(fusionAccount)
    }
```

Callers: `assembleAccount`, `assembleManagedAccount` (Match), and `FusionService` after layering (`fusionService.ts` around the `applyAttributeProcessing` call after `setNeedsRefresh`). Unique Define is **not** in this recipe (`refreshUniqueAttributes` is later / separate). Do not move Unique into this loop.

### MappingService today

```33:110:src/services/mappingService/mappingService.ts
    mapAttributes(fusionAccount: FusionAccount, _run: FusionRun, options?: MapAttributesOptions): void {
        if (fusionAccount.type === FusionAccountKind.Identity) return

        const { attributeBag, needsRefresh } = fusionAccount
        const attributes = { ...attributeBag.current }
        // ...
        if (needsRefresh && sourceAttributeMap.size > 0) {
            // sourceOrder rebuilt; origin/main resolved via findAccountByIdInSourceMap
            const mappingTargets = this.getAttributeMappingTargetNames()
            for (const attribute of mappingTargets) {
                // processAttributeMapping per target
            }
        }
        if (fusionAccount.history.length > 0) {
            attributes[FusionAttribute.History] = [...fusionAccount.history]
        }
        attributeBag.current = attributes
    }
```

`findAccountByIdInSourceMap` (same file ~167–179) nested-loops all snapshots. `processAttributeMapping` rebuilds `Array.from(new Set([...config.sourceAttributes, config.attributeName]))` on every target (`helpers.ts` ~74, ~102, ~171). `AttributeMappingConfig` lives in `src/services/definitionService/types.ts` (re-exported from `mappingService/types.ts`).

Honor `mapping-service`: Main/Origin merge read a single snapshot; identity-type accounts skip mapping; `onlyTargets`; stateless service (no cross-account snapshot cache on `this`).

### DefinitionService today

`refreshNormalAttributes` (`definitionService.ts` ~124–148) computes `this.normalDefinitions.some((def) => def.refresh)` **per account**, builds context, then `await this.processNormalDefinition` per definition.

`buildVelocityContext` (~465–499) starts with `{ ...fusionAccount.attributeBag.current }`.

`processNormalDefinition` (~626–696) is `async` but only calls synchronous `evaluateAttributeTemplate`. Clearing on falsy/error must remain (`definition-service` “clears normal attributes on falsy or failed evaluation”). Static skip and display-attribute override must remain.

`evaluateVelocityTemplate` (`formatting.ts` ~54–88):

```54:73:src/services/definitionService/formatting.ts
export const evaluateVelocityTemplate = (
    expression: string,
    context: RenderContext,
    maxLength?: number
): string | undefined => {
    const renderContext = Object.assign(Object.create(null), context, contextHelpers) as RenderContext
    logger.debug(`Evaluating velocity template - expression: ${expression}`)
    let velocity = templateCache.get(expression)
    if (!velocity) {
        const template = velocityjs.parse(expression)
        velocity = new SafeCompile(template)
        templateCache.set(expression, velocity)
        logger.debug(`Compiled and cached new velocity template: ${expression}`)
    }
```

Do **not** drop `Object.create(null)` or invert assign order (helpers must override context). Do **not** replace `SafeCompile`.

### Conventions the executor must match

- TypeScript strict, ESM imports in `.ts`, Prettier 120 / 4-space / single quotes / no semicolons (`openspec/specs/project-standards/spec.md`, `AGENTS.md`).
- `_` prefix only for unused bindings; private members use `private` without `_` (`project-standards`).
- Tests: Vitest globals, `*.test.ts` under `__tests__/` next to the code (`openspec/specs/testing/spec.md`). Pattern: `src/services/mappingService/__tests__/mapService.test.ts` (construct `MappingService` + `FusionAccount.fromManagedAccount`) and `src/services/definitionService/__tests__/formatting.test.ts` (direct `evaluateVelocityTemplate`).
- Domain terms: MappingService, DefinitionService, Fusion account, managed source account, Main account, Origin account — not AttributeService, consolidated account, raw account (`openspec/specs/ubiquitous-language/spec.md`).
- Error handling: do not introduce `ConnectorError` on this path; keep existing log-and-clear for Normal definition failures.

### Vocabulary / spec constraints (do not re-litigate)

- `mapping-service`: merge strategies including Main/Origin; identity skip; selective `onlyTargets`; no mutable service state between invocations.
- `definition-service`: Velocity null prototype + helper merge; transform order trim → case → spaces → normalize → maxLength; clear on falsy/failed Normal eval; core-schema safe defaults.
- `account-assembly`: Map & Define stay inside `applyAttributeProcessing`; do not fork a second recipe.

C4: not used. No new container or runtime process; this is in-process CPU.

## Goals / Non-Goals

**Goals:**

- Reduce per-account allocation and snapshot scans in Map and Normal Define without changing mapping results or Velocity outputs
- Keep security invariants of `evaluateVelocityTemplate` (null proto, `SafeCompile`)
- Keep characterization tests green; add tests that lock the new structural contracts (index first-hit, no clone on no-op Map, lookup names on config)

**Non-Goals:**

- Faster Unique generation, lock granularity, or UUID loops
- Skipping Define on Match assembly
- Global LogService debug elision
- Mapping attributes that are only in the schema and not in `attributeMaps`
- Timing assertions in CI (flaky)

## Decisions

### D1: Snapshot-key index is local to `mapAttributes`

Not a field on `MappingService`. Build after `sourceAttributeMap` is complete (including Identities identity bag when `originSource === IDENTITIES_SOURCE_NAME`). First write wins so order matches current `for (const accounts of sourceAttributeMap.values())` + `accounts.find`.

### D2: `lookupAttributeNames` on `AttributeMappingConfig`

Add `lookupAttributeNames: string[]` — unique, `sourceAttributes` then `attributeName`, same as today’s `Array.from(new Set([...sourceAttributes, attributeName]))`. Compute in `buildAttributeMappingConfig` only. `processAttributeMapping` must use `config.lookupAttributeNames` and must not allocate a new Set per call.

### D3: Prototype context vs mutating current for Velocity

Use `Object.create(fusionAccount.attributeBag.current)` as the context base, then set own properties `identity`, `accounts`, `previous`, `sources`, `account`, `originSource`, `originAccount`, and optional `name`. Writes during Define continue to set `fusionAccount.attributes[name]` and `context[name]` (own property). Do not use the current bag object itself as the context root (would pollute current with `accounts` / `identity` / `isUnique`).

### D4: Remove per-render SDK debug, gate DefinitionService value debug

Delete the three `logger.debug(...)` calls in `evaluateVelocityTemplate` (expression, compiled, result). They run on every Normal/Unique/scoring template and interpolate PII-capable values. For `processNormalDefinition` / `refreshNormalAttributes` debug lines, wrap with `this.log.getLogLevel() === 'debug'` so the template string and `JSON.stringify` do not run at default info level. Do not change `LogService.log`.

### D5: `processNormalDefinition` becomes sync

Change signature to `private processNormalDefinition(...): void`. `refreshNormalAttributes` and `refreshAllAttributes` call it without `await`. Keep those public methods `async` so existing `await definitionService.refreshNormalAttributes` call sites stay valid.

## Scope

**In scope:**

- `src/services/mappingService/mappingService.ts`
- `src/services/mappingService/helpers.ts`
- `src/services/definitionService/types.ts` (`AttributeMappingConfig`)
- `src/services/definitionService/definitionService.ts`
- `src/services/definitionService/formatting.ts`
- Tests listed in tasks.md
- `CHANGELOG.md` (today’s dated section)
- This change folder’s spec deltas

**Out of scope:**

- `src/services/accountAssembly/accountAssembly.ts` (call order stays)
- `src/services/matchingService/**` except existing tests must still pass
- `src/services/definitionService/contextHelpers/**`
- `src/utils/safeVelocityCompile.ts`
- Unique registration plan / record unique path (already selective Map)
- `src/services/logService/logService.ts`
- `src/services/fusionService/__tests__/fusionService.aggregation.test.ts` (dirty unrelated)
- connector-spec, use-guides, C4

## STOP conditions

- Drift: in-scope files no longer match excerpts (especially Main/Origin merge in `helpers.ts` or falsy-clear in `processNormalDefinition`)
- A mapping test for Origin/Main/first/source/list/concatenate fails after the index or `lookupAttributeNames` change
- Velocity tests in `formatting.test.ts` fail (especially `$constructor` / helper accessibility)
- Define clearing tests in `defineService.test.ts` (`DefinitionService.refreshNormalAttributes clearing`) fail
- Prototype context causes `$accounts` / `$identity` / `$account` templates to read attribute-bag keys instead of the special objects (if `current` contains those names, today’s spread also overwrites them — only STOP if behavior diverges from pre-change tests)
- Fix appears to need `assembleManagedAccount` to skip Define, or LogService rewrite
- `npm test` or `npm run lint` fails twice after a reasonable fix

## Git workflow

- Branch: `perf/speed-up-map-define-hot-path` from the operator’s current branch, or commit on the current branch if the operator already created one for this change
- Commits: conventional, e.g. `perf(mapping): index snapshots and cache lookup names` then `perf(definition): avoid current-bag copy and hot-path debug` — match `git log` (`perf(matching):`, `perf(fetch):`)
- Do not push or open a PR unless asked
- Do not commit the unrelated dirty aggregation test file

## Risks / Trade-offs

- Prototype Velocity context: templates that mutate a top-level current attribute as a `#set` on the **caller** context (not renderContext) could theoretically differ; Velocity render uses a separate `renderContext` copy, so `#set` stays on the render object. Sequential definitions still write both current and context.
- Removing evaluateVelocityTemplate debug: operators with debug logging lose per-expression traces. Acceptable; compile cache still works; DefinitionService still logs errors.
- Snapshot index first-hit: if two snapshots share a key, same as today’s `find` (first in map iteration).

## Maintenance notes

- If `attributeMaps` become mutable after MappingService construction, the cached mapping config would go stale — they are constructor-only today.
- If a future change puts Velocity helpers on a prototype, it must update `definition-service` null-prototype scenarios first.
- Follow-up (not this change): LogService early-return when `level` is below configured; optional split of Map/Define off Match scoring concurrency (already noted in archived parallelize-uncorrelated-outcome-dispatch discovery).
- Reviewer: confirm Main/Origin still pin a single snapshot; confirm no `Object.create(contextHelpers)` as render prototype; confirm Unique path still uses the same `evaluateVelocityTemplate`.
