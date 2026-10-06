## Scope

In: when `SchemaService.getFusionAttributeSubset` builds the attribute bag on the ISC account that `FusionService.getISCAccount` returns, omit a schema attribute whose emitted value is a blank string or an empty array. Drop blank string elements from a multi-valued value first; omit the attribute when nothing remains. Always emit the schema identity attribute (`id`) and display attribute (`name`) when their emitted value is a blank string. Keep boolean `false` and numeric `0`. Leave the internal attribute bag unchanged. Replace the current rule that an empty multi-valued array must be sent.

Out: omitting `null` or `undefined` (already required), changing cast rules, a configuration toggle, mutating `FusionAccount` attribute bags, and `FusionAccount.toISCAccount` (test-only; it is not the path that sends accounts to ISC).

## Language

**ISC account** (canonical — reuse):
Any account object from Identity Security Cloud. Here, the payload `getISCAccount` returns.

**Fusion account** (canonical — reuse):
The consolidated account whose attribute bag is filtered down to schema attributes before that payload is built.

**Blank string** (`draft`):
A string with no characters, or only whitespace. Not promoted — ordinary language, not a new domain noun.
_Avoid_: "empty attribute" as a synonym for the attribute itself; "null" (already a separate omission rule).

**Empty array** (`draft`):
A multi-valued schema attribute value with no elements left after blank string elements are removed. Not promoted.
_Avoid_: "empty account" (that is the `deleteEmpty` processing-control behavior, which deletes Fusion accounts, not attributes).

## Decisions

Context: `getFusionAttributeSubset` already skips `null` and `undefined` and still emits `""`, whitespace-only strings, and `[]`. The schema-service spec requires empty arrays to be retained. Every platform send (`accountList`, `accountRead`, `accountCreate`, `accountUpdate`, `accountEnable`, `accountDisable`) goes through `getISCAccount` → `getFusionAttributeSubset`.

Q1: What counts as empty?
Chosen: **Blank strings and empty arrays.** A blank string is `""` or whitespace-only. An empty array is `[]`, including a multi-valued value that becomes `[]` after its blank string elements are removed. A mixed array keeps its non-blank elements. Boolean `false` and numeric `0` stay. The identity attribute `id` and the display attribute `name` stay when the emitted value is a blank string. `null` and `undefined` stay omitted, including on `id` and `name`.

Q2: Where does the filter run?
Chosen: **Inside `getFusionAttributeSubset`, on the value after schema cast.** Same single pass as the nullish skip. The input bag is not mutated; filtered arrays are new arrays. Judging emptiness after cast means a blank string on a numeric or boolean attribute still follows today's cast (`0` or `false`) and is kept, because the emitted value is not a blank string or an empty array. Most Fusion schema attributes are strings, so that edge does not change the string and array cases this change targets.

Q3: Is there a setting?
Chosen: **No.** Always omit. The previous change rejected a toggle for nullish keys for the same reason.

## Open questions

None.

## Scenarios discussed

- Single-valued string `""` or `"   "` is omitted; `"Finance"` and `"0"` are kept
- Multi-valued `[]` is omitted; `[""]` and `["", "  "]` are omitted; `["ok", ""]` is sent as `["ok"]`; `["a", "b"]` is unchanged
- Boolean `false` and numeric `0` are kept
- `id: ""` and `name: "   "` are still sent; `id: null` is still omitted
- The input attribute bag, including a `reviews: []` array, is not mutated
- Other required attributes are not exempt — only `id` and `name`
