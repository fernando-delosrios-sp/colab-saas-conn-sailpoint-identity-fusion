# Brainstorm: Omit null ISCAccount attributes at output

## Context

`getISCAccount` serializes Fusion accounts for the ISC platform via `SchemaService.getFusionAttributeSubset`. That method iterates every schema-defined attribute name and assigns a value — including explicit `null` when the source bag has no value or `castAttributeValue` receives null/undefined.

Current flow:

1. `FusionAccount.syncCollectionAttributesToBag()` — full internal attribute bag
2. `getFusionAttributeSubset()` — schema subset with type casting
3. Return `{ key, attributes, disabled }` to platform via `res.send`

Dry-run evidence (company23128 POC, 18,875 accounts):

- Output phase: **949 ms** (~50 µs/account) — ~1.4% of total run time
- Refresh/Fetch dominate; output is not the bottleneck

Mapping tests already note intent: list-merge preserves nulls internally with comment "filtered at output stage" — but output stage filtering is **not implemented** today.

## Problem

Emitted ISC accounts include many `"attributeName": null` entries for sparse mapped attributes. This:

- Inflates serialized payload size on every accountList/accountRead/accountUpdate response
- Clutters dry-run reports and debugging output
- Wastes property writes in the output object (minor CPU)

Performance analysis: in-loop skip adds negligible overhead (~0 ms at POC scale); may be slightly faster by avoiding null property assignments.

## Q1: What should be omitted?

**Decision:** Omit attributes whose **cast output value** is `null` or `undefined`. Do not emit the key at all.

**Rationale:** Matches "no value" semantics for aggregation output. Internal bags retain nulls for mapping/merge logic; only the platform-facing subset changes.

**Out of scope for v1:** Omitting empty strings, empty arrays, or whitespace-only strings — those have distinct semantics (especially multi-valued entitlements like `reviews: []`).

## Q2: Where should filtering happen?

**Options considered:**

| Approach | Pros | Cons |
|---|---|---|
| A. Skip in `getFusionAttributeSubset` loop | Single pass, zero extra iteration, aligns with existing cast loop | Couples omission to schema subsetting |
| B. Post-filter in `getISCAccount` after subset | Keeps subsetter pure | Second pass over keys; extra object churn |
| C. Filter in SDK send layer | Transparent to services | Wrong layer; affects all operations inconsistently |

**Decision:** **A — in-loop skip inside `getFusionAttributeSubset`**. One branch per attribute; skip assign when casted value is nullish. Early-continue before cast when input is nullish saves cast work.

## Q3: Semantic risk — missing key vs explicit null on update?

**Concern:** ISC accountUpdate may treat omitted keys as "unchanged" vs explicit null as "clear attribute."

**Decision:** This change targets **aggregation output** (`accountList` streaming via `forEachISCAccount`) and read paths that rebuild from source state. For `accountUpdate`, the connector rebuilds the full attribute bag from sources before serializing — omitted nulls reflect "no value from sources," not "preserve platform value." Document this in design/spec.

**Mitigation:** Add spec requirement that accountUpdate output continues to include all attributes that have non-null cast values after rebuild; no reliance on platform-side null clearing for sparse attrs.

## Q4: Multi-valued attributes?

**Decision:** If `castAttributeValue` returns an empty array `[]`, **keep emitting it** (not null). Only omit when cast result is strictly `null` or `undefined`. Multi-valued attrs already filter null elements via `compact()` inside cast.

## Design trade-offs summary

- **YAGNI:** No config flag to toggle behavior — always omit nulls at output subset.
- **Performance:** Negligible CPU impact; primary benefit is smaller payloads.
- **Scope:** One method change + tests; no new public API surface.
- **Risk:** Low — behavior change is output shape only; internal state unchanged.

## Recommended design (approved for opsx artifacts)

1. Modify `getFusionAttributeSubset` to skip assignment when input is nullish OR casted value is nullish.
2. Add/update unit tests in schemaService tests asserting omitted keys, not null values.
3. Update fusionService getISCAccount tests if they assert null keys.
4. Add spec delta under fusion-service or schema-service capability.
