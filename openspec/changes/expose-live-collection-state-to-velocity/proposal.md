## Why

Attribute definitions cannot branch on what the current aggregation has decided about a Fusion account. `buildVelocityContext` inherits `statuses`, `actions`, and `reviews` from `attributeBag.current`, which holds the copy written at the *previous* run's output — and nothing at all for an account created this run.

For reviewer-driven configurations the staleness is a deadlock rather than a lag. A Unique `id` definition that emits a value only for reviewers renders empty on a brand-new reviewer account, `skipAccountsWithMissingId` suppresses that account, so it is never persisted and never acquires the `reviewer` status that the next run would need to read. The live values already exist on `FusionAccount`; Define simply cannot see them.

## What Changes

**Velocity caller context**
- From: `statuses`, `actions`, and `reviews` resolve through the prototype chain to `attributeBag.current` — the persisted collection snapshot from the previous aggregation, absent on newly created accounts.
- To: `buildVelocityContext` sets all three as own properties from the `FusionAccount.statuses` / `.actions` / `.reviews` getters, shadowing the inherited snapshot with live **FusionCollections** state.
- Reason: definitions must be able to test this run's decisions, and the deadlock above has no configuration workaround.
- Impact: non-breaking for expressions that do not reference these names. An expression already reading `$statuses` starts seeing current values instead of last run's; `$previous.statuses` remains the documented way to read the prior snapshot.

Additions:

- Documentation of the `velocityjs` array-method caveat in the Velocity context reference: `contains()` and `isEmpty()` do not resolve on array values, while `includes()`, `indexOf()`, `size()`, and `#foreach` do.
- A reviewer-only account recipe in the attribute definition guide, pairing the live status test with `skipAccountsWithMissingId`.

Explicitly not included: account-id sets, `missing-accounts`, `sources`, and `history` stay out of the context; no reviewer predicate or Velocity helper is added; reviewer-registration ordering is untouched, so Normal definitions on a freshly created global reviewer account remain one aggregation behind.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-service`: the caller-context requirement gains `statuses`, `actions`, and `reviews` as own properties sourced from live collection state rather than the inherited attribute bag, with scenarios covering unique-definition evaluation at creation and reset, shadowing of the persisted snapshot, absence of write-back into `fusionAccount.attributes`, and the documented Normal-definition timing gap for newly created global reviewers.

## Impact

- `src/services/definitionService/definitionService.ts` — `buildVelocityContext` only.
- `src/services/definitionService/__tests__/defineService.test.ts` — new scenarios; existing context assertions reviewed for collisions on the three names.
- `docs/reference/velocity-context.md`, `docs/use-guides/configuration/defining-attributes.md` — new context rows, engine caveat, reviewer-only recipe.
- No configuration surface, no schema change, no API change. Every Define entry point (`accountList`, `accountRead`, `accountCreate`, `accountEnable`) inherits the fix through the shared context builder.
- Persisted attributes are untouched: `syncCollectionAttributesToBag` keeps sole ownership of writing collection state into the bag at output.
