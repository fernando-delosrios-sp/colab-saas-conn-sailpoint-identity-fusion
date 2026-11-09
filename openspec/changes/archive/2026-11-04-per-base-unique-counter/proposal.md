## Why

Today an incremental unique attribute has one counter for every account, so the sequence ignores the text around `$counter`. Tenants need each base value to count on its own, producing values such as `ab1`, `ab2`, `bb1`, and `ab3` from one expression. The base is that expression rendered with `$counter` empty, so a conditional may omit the counter and still share a sequence. The option stays off unless the incremental counter is already on, so current definitions keep their single sequence.

## What Changes

- Add **Per base value counter?** (`counterPerBase`) to a unique attribute definition. Default `false`. The field is shown only when **Use incremental counter?** is on, and the connector ignores it when that toggle is off.
- When the option is on, persist one counter per base value in `connectorAttributes.fusionState`, using the readable base value as the key. A new base starts at **Counter start value**. Issued numbers are not reused.
- Derive the base value by rendering the expression with `$counter` empty, applying trim, case, spaces, and normalize, then cutting it so a configured maximum length still has room for **Minimum counter digits**.
- **Incremental counter expression**
  - From: an incremental expression that never mentions `$counter` retries until **Maximum attempts**, then returns no value.
  - To: the operation ends at startup when an incremental expression does not reference `$counter`, `${counter}`, `$!counter`, or `$!{counter}`.
  - Reason: incremental mode does not append `$counter` on its own, so the retry burns counter values.
  - Impact: breaking for an incremental definition whose expression omits `$counter`. Collision-based definitions are unchanged.
- **Per-base collision**
  - From: an incremental collision retries with the next number.
  - To: when per-base counting is on, a rendered value that is already registered ends the operation with a short message. It does not try the next number.
  - Reason: that result means the expression hid the counter, state was lost, another source already holds the value, or truncation merged two bases.
  - Impact: breaking only for definitions that turn the new option on.
- **Counter width**
  - From: a counter may grow past **Minimum counter digits**.
  - To: when per-base counting and maximum length are both set, a counter wider than **Minimum counter digits** ends the operation and names that setting. Without a maximum length, the counter may still grow.
  - Reason: the base is cut by a fixed width so two bases cannot truncate into the same value.
  - Impact: breaking only when the option and maximum length are both on and the sequence outgrows the configured digits.
- **Saved state shape**
  - From: each incremental attribute stores one number.
  - To: per-base counting stores a map of base value to number. A saved number while the option is on, or a saved map while it is off, ends the operation at startup.
  - Reason: using the other shape would reissue values already on accounts.
  - Impact: an admin who flips the option must switch it back or reset Fusion state.
- Keep the single attribute counter, including raising it from a kept value's trailing digits, when the option is off. Do not seed per-base counters from existing values.
- Update the defining-attributes guide, the glossary, and the connector-spec help.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-service`: Per-base incremental counters, base-value derivation, startup checks, and the per-base collision failure.
- `ubiquitous-language`: Add **Base value** and **Per base value counter**. Extend **Incremental counter** and **$counter** so they distinguish the single attribute counter from per-base counting.

## Impact

- `UniqueAttributeDefinition`, `connector-spec.json`, and `uniqueAttributeDefinitionsSettings.ts` gain `counterPerBase`.
- `DefinitionService` and `StateWrapper` read and write a nested counter map, lock per base value (`counter:<attribute>:<base>`), and fail the operation with `ConnectorError` for the cases above.
- `connectorAttributes.fusionState` grows by one entry per distinct base value. The saved text is the base value itself, which may contain names. No new runtime dependency.
- Guides: `docs/use-guides/configuration/defining-attributes.md` and `docs/glossary.md`.
- Tests in `src/services/definitionService/__tests__/`.
