## 1. Configuration surface

- [x] 1.1 Add `counterPerBase` to `UniqueAttributeDefinition` and the unique-attribute initial values, defaulting to false
- [x] 1.2 Add **Per base value counter?** to `connector-spec.json`, shown only when **Use incremental counter?** is on, with help text that states the default and the dependency
- [x] 1.3 Document `counterPerBase` on the `UniqueAttributeDefinition` JSDoc

## 2. Counter state

- [x] 2.1 Extend `StateWrapper` so an attribute counter is either one number or a map of base value to number, and lock increments per base (`counter:<attribute>:<base>`)
- [x] 2.2 Fail counter initialization with `ConnectorError` when the saved shape does not match **Per base value counter?** The error names the attribute and tells the admin to switch the option back or reset Fusion state
- [x] 2.3 Persist readable base values through the existing `fusionState` save path

## 3. Per-base generation

- [x] 3.1 Derive the base value by rendering with `$counter` empty, applying trim, case, spaces, and normalize, and cutting to `maxLength - digits` only when a maximum length is set
- [x] 3.2 Generate independent sequences (`ab1`, `ab2`, `bb1`, `ab3`) and ignore `counterPerBase` when the incremental counter is off or the field is omitted
- [x] 3.3 Honor a conditional that omits `$counter` when it equals 0, so a start value of 0 renders the bare base and the next value includes 1
- [x] 3.4 Do not seed a per-base counter from a kept value. Keep trailing-digit seeding for the single attribute counter
- [x] 3.5 Fail initialization when an incremental expression does not reference `$counter`, `${counter}`, `$!counter`, or `$!{counter}`. Accept those four forms. Do not treat `$UUID` as a counter reference
- [x] 3.6 Fail the operation when a per-base render is already in the attribute registry or the customizer store. Do not try another number. The error names the attribute, the value, and the four causes from the spec
- [x] 3.7 Share one counter across bases that match after the width cut, and fail when the next number is wider than the minimum digits or the maximum length cannot hold the counter

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` and `npm run lint`
- [x] 4.2 Add definition-service tests named for each delta scenario: omitted option, option ignored when incremental is off, independent sequences, counter omitted at zero, next number printed, no per-base seed, kept value raises the single counter, missing counter reference, formal and quiet references, registered value, shared width, counter wider than digits, maximum length shorter than the counter, shape mismatch in both directions, and concurrent different bases

## 5. Documentation

- [x] 5.1 Update `docs/use-guides/configuration/defining-attributes.md` for **Per base value counter?**, the base value, the zero comparison, the width rule, and the startup failures
- [x] 5.2 Update `docs/glossary.md` for **Base value**, **Per base value counter**, **Incremental counter**, and **$counter**
- [x] 5.3 Add **Base value** and **Per base value counter** to the Canonical Terms table in `openspec/specs/ubiquitous-language/spec.md`, and update the **Incremental counter** and **$counter** rows to match the delta
- [x] 5.4 Run `npm run lint:docs-guides` and `npm run lint:markdown`

## 6. Changelog

- [x] 6.1 Create or update the changelog entry for this change via the changelog-generator skill during apply
- [x] 6.2 Confirm the entry covers the user-visible definition-service and glossary changes from the proposal
