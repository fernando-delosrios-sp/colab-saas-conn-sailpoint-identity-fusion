## Why

Normal attribute definitions currently preserve previously stored values when a Velocity template fails or renders empty output. That "skip assignment" behavior keeps stale data when source inputs disappear or a computation becomes invalid — for example a formatted date attribute still showing the old value after `$INACTIVE_DATE` is removed from the source account. Operators expect a failed or empty recalculation to **clear** the attribute so Fusion state reflects that the definition no longer produces a value. The unique-attribute path already deletes keys on failed generation; normal definitions should follow the same contract when evaluation runs and yields no value.

## What Changes

**Normal definition falsy/error output clears stored value**
- From: When `evaluateAttributeTemplate` returns `undefined`/`null` or an error, `processNormalDefinition` leaves the existing attribute unchanged (only applies safe defaults for core schema attrs)
- To: When evaluation runs and returns falsy or error, remove the attribute from `fusionAccount.attributes` and the Velocity context unless `fusionAttributeSafeDefault` applies for `fusionIdentityAttribute` or `fusionDisplayAttribute`
- Reason: Stale computed values must not persist after a definition can no longer produce output
- Impact: **Breaking** for deployments relying on preserve-on-empty; use `$previous` or Static definitions for explicit retention

**Unchanged guard paths**
- Static definitions on existing accounts with a valid value still skip evaluation
- Immutable identity/display attributes on existing fusion rows still skip overwrite
- Unique attribute generation behavior unchanged (already clears on failed output)

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-service`: Normal attribute evaluation SHALL clear stored values when template output is falsy or evaluation fails, except where core-schema safe defaults apply.

## Impact

- `src/services/definitionService/definitionService.ts` — `processNormalDefinition` falsy and error branches
- `src/services/definitionService/__tests__/defineService.test.ts` — regression tests for clear-on-falsy and clear-on-error
- `docs/reference/velocity-context.md` — update empty-output semantics (clear vs preserve)
- `docs/use-guides/configuration/defining-attributes.md` — document clearing behavior and `$previous` retention pattern
- No config schema changes; no new dependencies
