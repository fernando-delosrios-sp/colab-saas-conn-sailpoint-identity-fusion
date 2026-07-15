## Context

Normal attributes currently re-evaluate whenever `needsRefresh` is true (which happens when new source data is processed), even if the `refresh` toggle is false. The user wants to introduce a "Static" option for normal attribute definitions that is mutually exclusive with the `refresh` option. This option will ensure that the attribute is evaluated only if no previous value exists, and kept forever unless a reset is explicitly requested.

## Goals / Non-Goals

**Goals:**
- Provide a way to make normal attributes evaluate exactly once (or on manual reset) regardless of changes in source data.
- Update the connector configuration schema (`connector-spec.json`) to surface this option alongside the existing `refresh` toggle.

**Non-Goals:**
- Altering the behavior of the existing `refresh` toggle.
- Affecting unique attributes or reverse correlation attributes.

## Decisions

### D1: Configuration Schema Updates
- **Choice:** Add a new `static` boolean toggle in the `NormalAttributeDefinition` configuration, and mark it as mutually exclusive with `refresh` if possible via UI/validation (or clarify via descriptions if UI mutual exclusivity isn't natively supported).
- **Reason:** Users need a simple way to opt into static evaluation. A simple toggle is straightforward.
- **Alternative Considered:** Changing `refresh` to a select dropdown (Always, On Change, Never). Rejected because it requires migrating existing connector configurations. Adding a new `static` property is backward-compatible.

### D2: Evaluation Logic Update in `processNormalDefinition`
- **Choice:** Inside `processNormalDefinition`, before evaluating the attribute template, check if `definition.static === true`. If it is true, and the attribute already has a valid value, skip recalculation, bypassing the `needsRefresh` check completely. The only exception should be if `fusionAccount.needsReset` is true.
- **Reason:** This directly fulfills the requirement of "kept forever unless reset is requested".
- **Alternative Considered:** Clearing the `needsRefresh` flag on the account. Rejected because `needsRefresh` applies to the entire account and all other attributes; modifying it would cause side effects.

## Risks / Trade-offs

[Risk] Users might enable both `refresh` and `static` if the UI doesn't enforce mutual exclusivity natively.
→ Mitigation: Document the behavior clearly in `helpKey`. In the code, give precedence to `static` if both are true, or treat them as mutually exclusive logic.

## Migration Plan

N/A — This change only adds a new optional configuration parameter. Existing configurations will not have `static: true` and will continue to operate exactly as before.

## Open Questions

- Does the ISC UI natively support mutually exclusive toggles via `connector-spec.json` validation, or should we just handle it gracefully in the backend (e.g. `static` overrides `refresh`)?
