# Discovery — optimize-normal-definition-refresh

## Scope

**In:** Honor per-definition `refresh` flag in Normal Define during Refresh; stop forcing Define for every Fusion account when any definition has `refresh: true`; reuse Velocity render context per account to avoid per-evaluation full caller-context copy; cache Datefns format regex; tests aligned with `docs/use-guides/configuration/defining-attributes.md`.

**Out:** Unique attribute generation; Map snapshot index (already optimized); raising Refresh concurrency; changing static/immutable display rules.

## Language terms

| Term | Status |
|------|--------|
| **Normal attribute definition** | promote |
| **Refresh on each aggregation** | promote — maps to `definition.refresh === true` |
| **Static attribute** | promote — `definition.static` |
| **Define** | promote |

## Decisions

- **Bug/perf:** `anyNormalDefinitionRefresh` forces `refreshNormalAttributes` for all accounts when any definition refreshes (`definitionService.ts:132-137`), and `processNormalDefinition` ignores `definition.refresh` (`644-716`). Docs say refresh=No means recalculate only when underlying source data changes (`defining-attributes.md:66-69`).
- **Allocator:** `evaluateVelocityTemplate` calls `copyVelocityCallerContext` on every definition evaluation (`formatting.ts:84`), duplicating work after `buildVelocityContext` already uses prototype-based caller context.
- **Dependency:** Apply after instrumentation to measure `normalDefineMs` and `definitionsEvaluated` delta.

## Open questions

_(none)_

## Scenarios discussed for specs

- refresh=No skips evaluation when needsRefresh false and value exists
- refresh=Yes still runs every aggregation for that definition
- forceAttributeRefresh and needsReset override skip rules
- Sequential definition visibility preserved
