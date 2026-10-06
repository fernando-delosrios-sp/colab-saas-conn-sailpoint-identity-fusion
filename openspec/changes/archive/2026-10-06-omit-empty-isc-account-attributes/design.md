## Context

`FusionService.getISCAccount` is the only path that sends a Fusion account back to ISC. It calls `SchemaService.getFusionAttributeSubset`, which walks every schema attribute name, casts the value, and already skips `null` and `undefined`. Blank strings, whitespace-only strings, and empty arrays are still assigned. The schema-service spec requires that empty arrays be kept. `FusionAccount.toISCAccount` returns the internal bag and is used only by model tests; it is not the send path.

The filter stays in that one method. Account list, read, create, update, enable, and disable all go through `getISCAccount`, so they pick up the new payload without a second pass.

## Goals / Non-Goals

**Goals:**
- Omit blank strings (`""` and whitespace-only) and empty arrays from the platform attribute bag
- Drop blank string elements from a multi-valued value, then omit the attribute when no elements remain
- Keep mixed multi-valued values with only the non-blank elements
- Always emit `id` and `name` when the emitted value is a blank string
- Keep boolean `false` and numeric `0`
- Leave the input attribute bag unmutated
- Keep the existing omission of `null` and `undefined`, including on `id` and `name`

**Non-Goals:**
- A configuration toggle
- Changing `castAttributeValue` / `castScalar`
- Mutating `FusionAccount` attribute bags or collection sync
- Changing `FusionAccount.toISCAccount`
- Sending an explicit clear or delete to ISC for a key that is omitted
- Exempting any required attribute other than `id` and `name`

## Decisions

### D1: Filter inside `getFusionAttributeSubset` after cast

- **Choice**: In the existing loop, after `castAttributeValue`, skip assignment when the emitted value is empty under D2. Build a new array when blank string elements are removed. Do not write back to the input bag.
- **Reason**: One pass already visits every schema attribute. Every platform send uses this method.
- **Considered alternatives**: Post-filter in `getISCAccount` (second walk); filter inside `toISCAccount` (not the send path).

### D2: Emptiness is the emitted value

- **Choice**: A string is blank when `trim()` is empty. An array is empty when, after removing elements that are blank strings, it has no elements. Anything else, including `false` and `0`, is kept. Identity attribute `id` and display attribute `name` are assigned even when the emitted string is blank.
- **Reason**: Matches the chosen rule. Judging after cast leaves numeric and boolean casting unchanged: a blank string on an int or boolean attribute still becomes `0` or `false` and is kept, because that emitted value is not a blank string or an empty array.
- **Considered alternatives**: Treat every falsy value as empty (would drop `false` and `0`); keep empty arrays (rejected — that is the rule this change replaces); exempt every `required: true` attribute (only `id` and `name` were chosen).

### D3: No configuration flag

- **Choice**: Always omit.
- **Reason**: Same as the nullish-omission change. A toggle would preserve the behavior this change exists to stop.
- **Considered alternatives**: Developer setting, default on — extra surface for no requested opt-out.

## Risks / Trade-offs

- [Risk] ISC may keep a previously stored value when the key is absent, instead of clearing it → Mitigation: This change only shapes the payload, the same contract as nullish omission. It does not add a clear/delete call. Account update still rebuilds from sources before serialize.
- [Risk] Entitlement attributes such as `reviews`, `statuses`, and `actions` no longer send `[]` → Mitigation: Accepted. An empty list is an empty schema attribute and is omitted on purpose.
- [Trade-off] A blank string cast to `0` or `false` is still sent → Reason for acceptance: cast behavior is out of scope; the emitted value is not blank.
- [Trade-off] `id: ""` and `name: "   "` are still sent → Reason for acceptance: those two attributes stay even when blank so the account identity and display name are present.

## Migration Plan

N/A — connector code only. No config migration. Rollback is reverting the commit. Acceptance: `getFusionAttributeSubset` unit tests cover blank strings, whitespace, empty and mixed arrays, `false`, `0`, `id`/`name` exemption, and a non-mutated input bag; the schema-service delta no longer requires empty arrays to be retained.

## Open Questions

None.
