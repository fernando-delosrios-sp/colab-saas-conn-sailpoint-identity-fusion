## Scope

Add an off-by-default **Per base value counter?** option on incremental unique attribute definitions, so each distinct base value keeps its own persistent counter (for example `ab1`, `ab2`, `bb1`, `ab3`).

Out of scope: changing collision-based disambiguation, hashing base values in saved state, seeding per-base counters from existing account values, and letting a per-base counter skip past an already registered value.

## Language

**Base value** (`promote`):
The unique-attribute expression rendered with `$counter` empty, after trim, case, spaces, and normalize, then cut so a configured maximum length still has room for the counter.
_Avoid_: prefix, stem, root, sequence key

**Per base value counter** (`promote`):
An incremental counter whose saved number is stored per base value instead of once for the whole attribute. The option is **Per base value counter?** (`counterPerBase`). It applies only when **Use incremental counter?** is on, and it defaults to off.
_Avoid_: bound counter, restart counter, sequence scope

**Incremental counter** (`conflicts-with-canonical`):
The glossary says this is one persistent counter for the attribute, controlled by **Use incremental counter?** and **Counter start value**. This change adds **Per base value counter?** and makes a registered result end the operation.
_Avoid_: —

**$counter** (`conflicts-with-canonical`):
The glossary describes `$counter` as empty on the first collision attempt. In incremental mode it is always the next padded number, including when a conditional expression omits it for zero.
_Avoid_: —

## Decisions

- **Context**: `generateWithIncrementalCounter` keeps one number per attribute in `connectorAttributes.fusionState`. Callers need `ab1`, `ab2`, `bb1`, `ab3` from the same expression. The base is not a fixed prefix: the expression may be `$firstname.$lastname`, `$firstname.$lastname$counter`, or a conditional that prints `$counter` only when it is not zero.
- **Q1: How is the counter persisted?**
  - *Hashed key per base*: rejected. A hash clash skips a number, and operators cannot read the state.
  - *Derive the next number from existing accounts each run*: rejected. Deleted accounts would reuse numbers.
  - *Readable base text as the key*: **chosen**. `fusionState` stores `{ "<attribute>": { "<base value>": <last number> } }` when the option is on, and the existing `{ "<attribute>": <last number> }` when it is off.
- **Q2: What happens when the rendered value is already registered?**
  - *Always end the operation, with a short message*: **chosen**. Causes named in the message: the expression hides `$counter`, Fusion state was lost or reset, the value comes from a managed source or the customizer store, or truncation merged two base values.
  - *Skip only customizer and managed-source clashes*: rejected.
- **Q3: How does maximum length interact with the base value?**
  - *Key on the untruncated render*: rejected. Two bases that truncate to the same text would collide and end the operation even when the expression is valid.
  - *Reject maximum length together with the option*: rejected. It blocks fixed-width identifiers such as `sAMAccountName`.
  - *Key on the base cut to leave `digits` characters for the counter*: **chosen**. If maximum length is set and the counter needs more characters than **Minimum counter digits**, the operation ends and tells the admin to raise that setting.
- **Q4: What if the expression never references `$counter`?**
  - *Keep today's retry until maximum attempts*: rejected. Incremental mode never appends `$counter` itself, so the loop burns counter values and then returns no value.
  - *End the operation once, before accounts are processed*: **chosen**. The check accepts `$counter`, `${counter}`, `$!counter`, and `$!{counter}`. It applies to every incremental definition, whether or not per-base counting is on.
- **Q5: Should existing values raise the counter?**
  - *Keep today's trailing-digit seed for the single attribute counter*: **chosen**.
  - *Also seed per-base counters*: rejected. A trailing number cannot be assigned to the right base value without rendering that account's inputs again.
- **Q6: Name and default.**
  - **Chosen**: label **Per base value counter?**, key `counterPerBase`, default off, shown and honored only when **Use incremental counter?** is on.

## Open questions

None. State-shape mismatch is resolved: if the saved value for an attribute is a number while per-base counting is on, or a map of base values while it is off, the operation ends at startup and tells the admin to switch the option back or reset Fusion state.

## Scenarios discussed

- Expression `$firstname.$lastname` with per-base counting on and no `$counter` reference: the operation ends at startup.
- Expression `#if($counter == 0)...#else...$counter#end`: an empty counter renders the base value with the counter omitted. A later non-zero counter renders the number. `#if($counter)` does not omit a zero, because the padded string `"0"` is truthy.
- `ab` and `bb` are different base values, so each starts at **Counter start value**. The next `ab` continues `ab`'s own number.
- Maximum length 4 and minimum digits 1: bases `abcd` and `abce` both key as `abc` and share one counter, so they cannot both render `abc1`.
- Maximum length set, digits 1, counter reaches 10: the operation ends and names **Minimum counter digits**.
- The same attribute with per-base counting off keeps one number and still raises it from a kept value's trailing digits.
- Turning the option on or off against saved state of the other shape ends the operation before any value is generated.
- A per-base render that matches a registered Fusion account, a managed source account, or the customizer store ends the operation. It does not try the next number.
