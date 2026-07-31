## Why

Eight connector operation specs are generic placeholders that do not describe real provisioning behavior (attribute-operation modes, action entitlements, cascade aggregation, conditional test-connection checks). fusion-service lacks a contract for derived `correlated` entitlement and reverse-correlation attribute lifecycle. This undermines spec-driven development and opsx verify.

## What Changes

- Replace placeholder Gherkin in provisioning and support operation specs with code-accurate scenarios
- ADD fusion-service requirements for correlate/correlated (derived outcome) and reverse-correlation attribute management
- Duplicate summary action-entitlement scenarios in account-create and account-update
- Normalize failure scenarios to observable message patterns

**No runtime connector code changes.** account-list-operation untouched.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `fusion-service` — derived correlated entitlement, correlate action (direct PATCH), reverse-correlation attribute lifecycle
- `account-create-operation` — full provisioning contract + action entitlement summaries
- `account-update-operation` — pipeline contract + action entitlement summaries
- `account-read-operation` — REFRESH rebuild + optional cascade
- `account-enable-operation` — preprocess + RESET asymmetry
- `account-disable-operation` — REFRESH + preserve unique values
- `test-connection-operation` — conditional validation scenarios
- `entitlement-list-operation` — type-split status vs action catalog
- `account-discover-schema-operation` — dynamic schema build (fix malformed scenario header)

## Impact

- **Specs only:** `openspec/specs/` via archive merge
- **Tests:** cross-check against existing operation tests; no new test requirement
- **Ubiquitous language:** candidate terms queued for one-by-one review before addition
