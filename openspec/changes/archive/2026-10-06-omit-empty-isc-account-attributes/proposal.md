## Why

ISC account output already drops null and missing schema attributes, but it still sends blank strings and empty arrays. Those keys are written onto the Fusion account in Identity Security Cloud and inflate every streamed account. The schema-service spec currently requires empty arrays to be kept. Omitting blank strings and empty arrays at the existing output filter keeps the payload sparse. The identity and display attributes still go out when they are blank, so ISC still receives `id` and `name`.

## What Changes

**Platform attribute subset**
- From: `getFusionAttributeSubset` omits `null` and `undefined`, and still emits `""`, whitespace-only strings, and `[]` (including multi-valued arrays whose only elements are blank strings).
- To: After schema cast, omit a schema attribute whose emitted value is a blank string or an empty array. Drop blank string elements from a multi-valued value first; omit the attribute when nothing remains. Always emit `id` and `name` when their emitted value is a blank string. Keep boolean `false` and numeric `0`. Leave the input attribute bag unchanged.
- Reason: Empty schema attributes should not be sent back to ISC. `id` and `name` stay so the account remains identifiable.
- Impact: Breaking relative to the current schema-service requirement that empty arrays must be retained. No configuration change. Internal Fusion account bags are unchanged.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `schema-service`: Remove the requirement that keeps empty arrays. Add a requirement that the subset omits blank strings and empty arrays, with `id` and `name` exempt when blank, and still omits null and undefined.

## Impact

- `src/services/schemaService/schemaService.ts` — `getFusionAttributeSubset`
- `src/services/schemaService/__tests__/schemaService.test.ts` — replace the empty-array retention test and add blank-string, whitespace, mixed-array, `false`/`0`, and `id`/`name` cases
- `openspec/specs/schema-service/spec.md` — requirement wording (via this change's delta; sync at archive)
- Callers of `getISCAccount` (`accountList`, `accountRead`, `accountCreate`, `accountUpdate`, `accountEnable`, `accountDisable`) send fewer attribute keys. No signature change.
- `CHANGELOG.md` — note that empty arrays are no longer emitted
