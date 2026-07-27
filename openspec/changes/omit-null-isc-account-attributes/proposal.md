## Why

ISC account output currently emits explicit `"attributeName": null` for every schema-defined attribute that has no value. On sparse Workday POC deployments with many mapped attributes, this inflates every streamed account payload during accountList and adds noise to dry-run reports. Internal mapping logic already preserves nulls until output (see mapping test comment "filtered at output stage"), but that filter was never implemented. Omitting null keys at serialization reduces payload size with negligible CPU cost (~50 µs/account output budget unchanged).

## What Changes

**ISC account attribute serialization**
- From: `getFusionAttributeSubset` assigns every schema attribute, including keys whose cast value is `null`
- To: Schema subset omits keys when the cast output is `null` or `undefined`; non-null values unchanged
- Reason: Smaller platform payloads; align output with documented mapping intent
- Impact: Non-breaking for aggregation — omitted key means "no value." Empty arrays still emitted.

## Capabilities

### New Capabilities

<!-- none — reuse existing schema-service capability -->

### Modified Capabilities

- `schema-service`: Add requirement that fusion attribute subsetting omits nullish cast values from platform output

## Impact

- `src/services/schemaService/schemaService.ts` — `getFusionAttributeSubset` loop
- `src/services/schemaService/__tests__/` — new/updated unit tests
- Downstream consumers of `getFusionAttributeSubset` (`getISCAccount`, ReplayAdapter harness) — output shape has fewer keys; no API signature change
