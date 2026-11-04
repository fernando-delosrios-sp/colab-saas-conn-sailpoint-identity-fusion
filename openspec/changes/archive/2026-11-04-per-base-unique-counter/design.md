## Context

`DefinitionService.generateWithIncrementalCounter` stores one number per unique attribute in `StateWrapper`. The map is loaded from `connectorAttributes.fusionState` at startup and patched back onto the Fusion source at the end of a persistent run. The counter lock is `counter:<attribute>`. The in-memory unique registry and the customizer store stay per attribute.

Incremental mode does not call `buildEffectiveExpression`, so an expression without `$counter` burns attempts and returns no value. `seedIncrementalCounterFromExistingValue` raises the single counter from the trailing digits of a kept value. It runs only for accounts that are already being reprocessed and that keep the value.

Per-base counting is a child of that incremental path. Collision-based disambiguation is unchanged.

```
expression + $counter=""
        |
        v
 trim, case, spaces, normalize
        |
        v
 cut to (maxLength - digits)     only when maxLength is set
        |
        v
 base value  --->  fusionState[attribute][base value]  --->  next number
        |
        v
expression + padded $counter
        |
        v
 already registered?  --yes--> ConnectorError
                      --no --> register and return
```

## Goals / Non-Goals

**Goals:**

- Give each base value its own persistent counter when **Per base value counter?** is on.
- Leave the single attribute counter in place when the option is off or when **Use incremental counter?** is off.
- Fail fast when the expression cannot show the counter, when saved state has the other shape, when the counter no longer fits the reserved width, or when a per-base result is already registered.
- Keep the extra work to one Velocity render per generated value, using the existing template cache.

**Non-Goals:**

- Hashing base values, or rebuilding counters by scanning existing accounts.
- Seeding a per-base counter from a kept value.
- Changing collision-based disambiguation, including its automatic `$counter` suffix.
- Stopping the single attribute counter from retrying after a collision.

## Decisions

### D1: Option gate

- **Choice**: `counterPerBase` defaults to `false`. The connector spec shows it only when `useIncrementalCounter` is true, using the same parent field as **Counter start value**. Generation uses per-base counting only when both are true.
- **Reason**: Existing incremental definitions keep one sequence. A raw `true` with the incremental toggle off must not change collision-based disambiguation.
- **Considered alternatives**: A counter-scope dropdown. Rejected. The admin named a toggle, **Per base value counter?**.

### D2: Base value

- **Choice**: Render the configured expression with `context.counter = ''`, then apply trim, case, spaces, and normalize, in that order. Do not apply counter-aware maximum-length truncation on this render. If `maxLength` is set, keep only the first `maxLength - digits` characters. That string is the base value, including the empty string.
- **Reason**: `#if($counter == 0)` is true for `''`, so a conditional that omits the counter at zero produces the base the admin sees. `#if($counter)` does not, because the padded string `"0"` is truthy. The guide must say to compare with zero.
- **Considered alternatives**: Strip a literal `$counter` token from the expression text. Rejected. It cannot see a conditional, and it treats `$counter` as part of the base when the admin placed it in the middle.

### D3: Readable keys in fusionState

- **Choice**: When per-base counting is on, `fusionState[<attribute>]` is an object whose keys are base values and whose values are the last issued number. A missing base is initialized to `counterStart - 1` under the lock `counter:<attribute>:<base>`, then incremented, matching today's single-counter start rule. The single-counter entry stays a number when the option is off.
- **Reason**: The admin chose readable keys over a hash and over deriving the next number from current accounts. Numbers are not reused. The unique-registry lock stays `unique:<attribute>`.
- **Considered alternatives**: Short hash of the base. Rejected during discovery. Deriving the next number each run. Rejected because deleted accounts would reuse numbers.

### D4: Failures are ConnectorError

- **Choice**: End the operation with `ConnectorError` in four cases.
  1. At counter initialization, an incremental expression does not contain `$counter`, `${counter}`, `$!counter`, or `$!{counter}`. `$UUID` does not count. This check runs for every incremental definition.
  2. At counter initialization, the saved value is a number while per-base counting is on, or an object while it is off.
  3. During per-base generation, `maxLength` is set and the decimal form of the next number is longer than `digits`. Also at initialization when `maxLength` is set and `maxLength <= digits`.
  4. During per-base generation, the rendered value is already in the attribute registry or the customizer store. Do not increment again and do not loop to **Maximum attempts**.
- **Reason**: Each case means the next number would not be a new value. The registered-value message stays short and names the expression, lost or reset state, a managed-source or customizer value, and truncation.
- **Considered alternatives**: Retry, as the single attribute counter does. Rejected for per-base counting. The single attribute counter still retries, and it still raises itself from a kept value's trailing digits.

### D5: Shared base after the width cut

- **Choice**: The counter key is the cut base, not the uncut render. `abcd` and `abce` with maximum length 4 and 1 digit both use the key `abc`.
- **Reason**: Keying on the uncut render makes those two renders collide after truncation and fail even when the expression is valid.
- **Considered alternatives**: Forbid maximum length with the option. Rejected. Fixed-width attributes such as `sAMAccountName` need both.

### D6: No per-base seed

- **Choice**: Delete no global behavior. `seedIncrementalCounterFromExistingValue` runs only for the single attribute counter. Per-base generation does not parse trailing digits of existing values.
- **Reason**: The seed only sees accounts that are reprocessed while they keep the value, and a trailing number cannot be assigned to a base without rendering that account again.

## Risks / Trade-offs

- **[Risk]** Readable base values stored on the Fusion source may contain names or other identifiers. -> **Mitigation**: Accepted. Readable keys were chosen so an operator can inspect the counters. Document that `fusionState` holds those strings.
- **[Risk]** State size is one entry per distinct base value, and the whole object is patched at the end of aggregation. -> **Mitigation**: The extra Velocity render is one cached template per generated value and is not the limit. Call out the patch size in the guide when many bases are expected. No separate store in this change.
- **[Risk]** Flipping the option against existing state fails the next operation. -> **Mitigation**: The startup error tells the admin to switch the option back or reset Fusion state. There is no silent conversion.
- **[Trade-off]** With maximum length set and the default of 1 minimum digit, the 10th value for a base ends the operation. -> **Reason for acceptance**: The reserved width has to be fixed so bases can share a counter after the cut. The error tells the admin to raise **Minimum counter digits**.
- **[Trade-off]** The single attribute counter still retries on collision, so a lost `fusionState` can skip numbers until it finds a free value. -> **Reason for acceptance**: That recovery already exists, and this change does not take it away. Per-base counting does not copy it.

## Migration Plan

Existing definitions omit `counterPerBase`. Missing means off, and existing numeric `fusionState` entries stay valid. No source migration runs.

Turning the option on stores a map only after the startup shape check passes. An admin with an existing number resets Fusion state, or leaves the option off. Turning it off again against a saved map also fails until the state is reset or the option is turned back on.

Rollback is reverting the connector. A map written by this change is rejected by the shape check if an older build is not in use; an older build that expects only numbers can fail when it reads a map. Admins who need to roll back should reset Fusion state first. Per-base sequences then start again at **Counter start value** and can collide with values already on accounts until state is reconciled.

Acceptance: the definition-service scenarios for the option gate, separate sequences, the empty-counter conditional, the four `ConnectorError` cases, the shared cut base, and the unchanged single-counter seed.

## Open Questions

None.
