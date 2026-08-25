## Context

Planned at git `866a683` (2026-08-25). Drift check:

```bash
git diff --stat 866a683..HEAD -- \
  src/services/definitionService/definitionService.ts \
  src/services/definitionService/formatting.ts \
  src/services/definitionService/contextHelpers/dateUtils.ts \
  src/services/definitionService/templateEvaluator.ts \
  docs/use-guides/configuration/defining-attributes.md
```

Note: archived `2026-08-24-speed-up-map-define-hot-path` already landed prototype caller context, sync `processNormalDefinition`, and removed evaluateVelocityTemplate debug logs. **This package does not redo those.**

### Account-level gate today

```129:137:src/services/definitionService/definitionService.ts
    public async refreshNormalAttributes(fusionAccount: FusionAccount): Promise<void> {
        if (this.normalDefinitions.length === 0) return

        const forceRefresh =
            this.forceAttributeRefresh ||
            fusionAccount.needsReset ||
            this.anyNormalDefinitionRefresh
        const shouldRefresh = fusionAccount.needsRefresh || forceRefresh
        if (!shouldRefresh) return
```

Constructor caches `anyNormalDefinitionRefresh = normalDefinitions.some((def) => def.refresh)` at line 70.

### Per-definition loop ignores refresh flag

```644:684:src/services/definitionService/definitionService.ts
    private processNormalDefinition(
        definition: NormalAttributeDefinition,
        fusionAccount: FusionAccount,
        context: Record<string, any>
    ): void {
        // ... static skip, immutable skips ...
        const result = evaluateAttributeTemplate(definition, context)
```

No branch on `definition.refresh`.

### Documented semantics

From `docs/use-guides/configuration/defining-attributes.md`:

| Static | Refresh | Behavior |
| No | No | Recalculated only when underlying source data changes |
| No | Yes | Recalculated every aggregation |

Underlying source data change is modeled by `fusionAccount.needsRefresh` (set when new managed accounts blend or modified threshold exceeded — `fusionLayers.ts:315-329`).

### Render context copy today

```78:95:src/services/definitionService/formatting.ts
export const evaluateVelocityTemplate = (
    expression: string,
    context: RenderContext,
    maxLength?: number
): string | undefined => {
    const renderContext = Object.assign(copyVelocityCallerContext(context), contextHelpers) as RenderContext
    // ...
    let result = velocity.render(renderContext)
```

`buildVelocityContext` already uses prototype (`definitionService.ts:469-470`):

```typescript
const context: Record<string, any> = Object.create(fusionAccount.attributeBag.current)
```

### Exemplar tests

- `src/services/definitionService/__tests__/defineService.test.ts` — static, clearing, context inheritance
- `src/services/definitionService/__tests__/formatting.test.ts` — `$constructor`, helpers

## Goals / Non-Goals

**Goals:**

- Align runtime with refresh=No / refresh=Yes guide table
- Reduce Define CPU on unchanged Fusion accounts (skip refresh=No defs)
- Eliminate per-evaluation full context copy during Normal Define refresh pass
- Cache Datefns regex compilation

**Non-Goals:**

- Skipping Map when needsRefresh false (already skipped in mappingService)
- Changing falsy-clear, static, or immutable display rules
- Unique attribute paths
- Microbenchmarks in CI

## Decisions

### D1: Per-definition skip condition

In `processNormalDefinition`, after immutable/static checks, add:

```typescript
const shouldEvaluate =
    definition.refresh ||
    definition.static === false && (
        fusionAccount.needsRefresh ||
        fusionAccount.needsReset ||
        this.forceAttributeRefresh ||
        !hasExistingValue
    )
```

Refine: **Static** existing path already returns early for existing fusion accounts. For refresh=No with existing value and no account-level refresh triggers, **return early** before `evaluateAttributeTemplate`.

`definition.static === true` without existing value still evaluates (first-time fill).

### D2: Account-level gate

Change to:

```typescript
const shouldRefresh =
    fusionAccount.needsRefresh ||
    fusionAccount.needsReset ||
    this.forceAttributeRefresh
if (!shouldRefresh) return
```

Remove `anyNormalDefinitionRefresh` from `forceRefresh`. Keep field on constructor only if still used — if unused, delete field and constructor assignment.

When account has `needsRefresh=false` but has refresh=Yes definitions, **still enter** `refreshNormalAttributes` — add:

```typescript
const hasRefreshableDefinitions = this.normalDefinitions.some(
    (d) => d.refresh && !this.isSkippedStatic(d, fusionAccount)
)
if (!shouldRefresh && !hasRefreshableDefinitions) return
```

Where `isSkippedStatic` mirrors static early-return for existing rows.

### D3: Render context reuse

Add `createRenderContextFromCaller(callerContext: RenderContext): RenderContext` in `formatting.ts`:
- `const renderContext = Object.create(null)`
- `Object.assign(renderContext, contextHelpers)` — helpers as own properties
- Set prototype of a **wrapper** OR use `Object.assign(renderContext, copyVelocityCallerContext(callerContext))` once per account

**Preferred approach:** In `refreshNormalAttributes`, after `buildVelocityContext`, call once:

```typescript
const baseRenderContext = createRenderContextFromCaller(context)
```

Pass `baseRenderContext` to `evaluateAttributeTemplate` / new overload. After each successful definition write, set `baseRenderContext[definition.name] = result.value` (own property shadows prototype chain for subsequent renders).

Change `evaluateVelocityTemplate` signature to accept optional prebuilt render context OR add `evaluateVelocityTemplateWithRenderContext(renderContext, expression, maxLength)`.

**Security:** render context MUST remain `Object.getPrototypeOf(renderContext) === null` after helper assign (`definition-service` requirement).

### D4: Datefns cache

In `dateUtils.ts`, module-level `const formatRegexCache = new Map<string, { regex: RegExp; matchedTokens: string[] }>()`.

### D5: Instrumentation hook

If instrumentation package added stats callback, increment `definitionsSkipped` when per-definition skip triggers.

## Scope

**In scope:**

- `definitionService.ts`
- `formatting.ts`
- `templateEvaluator.ts` (if wraps evaluateVelocityTemplate)
- `contextHelpers/dateUtils.ts`
- `defineService.test.ts`, `formatting.test.ts`
- Delta spec `definition-service`
- CHANGELOG

**Out of scope:**

- `mappingService.ts`
- `fusionLayers.ts` needsRefresh logic
- connector-spec help text (already describes refresh toggle)

## STOP conditions

- Any existing test in `defineService.test.ts` clearing/static/display blocks fails
- `$identity.name` / sequential `$first` tests fail — sequential visibility broken
- `$constructor` / prototype pollution tests in `formatting.test.ts` fail
- Instrumentation shows `definitionsEvaluated` unchanged on unchanged accounts — gate logic wrong; STOP and fix before merge
- Attempt to skip refresh=Yes definitions when account needsRefresh false

## Git workflow

- Branch: `perf/optimize-normal-definition-refresh`
- Commits: `perf(definition): honor per-definition refresh flag` then `perf(definition): reuse Velocity render context per account`
- Apply after instrumentation DONE; may parallel with index package after instrumentation

## Risks / Trade-offs

- **Behavior change:** Tenants depending on refresh=No defs updating every run without source change will stop — **intended**, matches docs
- Render context reuse: templates mutating render context keys could affect later defs — same as today with copy model; sequential writes to own properties mitigate
- Map still runs when needsRefresh true only — refresh=Yes defs on needsRefresh false account still need Define entry without Map if attributes unchanged — Map skipped when needsRefresh false; refresh=Yes defs read `$previous` / current bag via context — OK

## Maintenance notes

- Add spec scenarios to `definition-service` for refresh flag matrix
- If connector-spec help for refresh toggle contradicts implementation after apply, fix help in separate docs PR
