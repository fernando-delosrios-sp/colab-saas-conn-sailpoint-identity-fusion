## Why

The spec drift audit flagged **Correlated action Remove** because `correlateAction.ts` honors Remove as "platform housekeeping" while `fusion-service` states the `correlated` entitlement is a derived outcome of the missing-accounts set — not independently revocable. User-confirmed intent: correlated reflects whether all managed accounts are linked in the Fusion identity; Remove via account-update must not strip it. Current code and the account-update spec (added in `2026-07-31-harden-operation-specs-gherkin`) implement the wrong model, allowing correlated to disappear from the response while the identity remains fully correlated.

## What Changes

**Correlate action Remove on provisioning paths**
- From: Remove clears the entitlement and account-update skips correlation-status recompute
- To: Remove fails with message `Correlated entitlement cannot be removed: <value>`
- Reason: Correlated is derived state, not a revocable grant like `fusion` or `reviewer:src-a`
- Impact: Breaking for callers that relied on successful Remove (likely incorrect platform usage)

**Account-update pipeline**
- From: `shouldSkipCorrelationStatusRecompute()` suppresses `updateCorrelationStatus()` after correlate Remove
- To: Machinery removed; output always recomputes correlation status from missing-accounts
- Reason: Remove path no longer succeeds
- Impact: Internal cleanup; no behavioral change once Remove rejects

**Living specs**
- From: account-update documents "skip recompute on correlate Remove"
- To: account-update documents reject-with-error; fusion-service and UL clarify non-revocable derived entitlement
- Reason: Align specs with domain model and code
- Impact: Spec-only documentation alignment

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `account-update-operation`: Replace skip-recompute-on-Remove requirement with reject-on-Remove requirement and observable error scenario
- `fusion-service`: Clarify correlated entitlement is derived and not revocable via entitlement Remove on provisioning paths
- `ubiquitous-language`: Clarify correlated entitlement vs correlate action (Add only); Remove is invalid on provisioning paths

## Impact

- **Code**: `src/operations/actions/correlateAction.ts`, `src/operations/helpers/accountUpdateHelpers.ts`, `src/services/fusionService/fusionService.ts` (comment only if stale), tests under `src/operations/actions/__tests__/` and `src/operations/__tests__/`
- **Specs**: `openspec/specs/account-update-operation/spec.md`, `openspec/specs/fusion-service/spec.md`, `openspec/specs/ubiquitous-language/spec.md`
- **Verification**: `npm test` for affected test files; `openspec validate --all --json`
- **Risk**: ISC automated flows that send Remove after correlate Add will fail explicitly (intentional)
