## 1. Velocity context binding

- [x] 1.1 In `DefinitionService.buildVelocityContext`, assign `context.statuses`, `context.actions`, and `context.reviews` from the `FusionAccount.statuses` / `.actions` / `.reviews` getters, alongside the existing own-property assignments (D1, D2, D3)
- [x] 1.2 Add a JSDoc note on `buildVelocityContext` stating that these three keys are live `FusionCollections` state shadowing the persisted snapshot, and that `previous` remains the prior-run view (D1)
- [x] 1.3 Confirm no other collection is bound — account-id sets, `missing-accounts`, `sources`, and `history` stay out, and `accounts` / `sources` keep their managed-snapshot meaning (D2)
- [x] 1.4 Confirm Define performs no write-back: nothing in the Define path writes `statuses`, `actions`, or `reviews` into `fusionAccount.attributes`

## 2. Tests for live collection state

- [x] 2.1 Test: Unique definition gated on `statuses` containing `reviewer` yields a UUID for an account created this run with the status applied after creation
- [x] 2.2 Test: same definition leaves the Fusion identity attribute unset for an account without the status when `skipAccountsWithMissingId` is `true`
- [x] 2.3 Test: reset regenerates the unique value from live collection state rather than rendering empty
- [x] 2.4 Test: `$reviews.size()` renders `0` when the reviews collection is empty and no persisted `reviews` attribute exists
- [x] 2.5 Test: after `refreshNormalAttributes` and `refreshUniqueAttributes`, `fusionAccount.attributes` still has no `statuses` attribute
- [x] 2.6 Test: `$previous.statuses` still reports the prior-run snapshot after the current run adds a status

## 3. Tests for caller-context precedence and reviewer timing

- [x] 3.1 Test: live `statuses` shadow a stale `attributeBag.current.statuses` from the prior aggregation
- [x] 3.2 Test: a Normal definition named `statuses` still wins for later definitions in the same pass
- [x] 3.3 Test: a Normal definition reading `actions` sees a persisted `reviewer:<sourceId>` action, since reviewer layers are applied before attribute processing
- [x] 3.4 Test: a Normal definition on an identity-origin account created this run reports `reviewer` as absent, while a Unique definition evaluated during output reports it as present (documented timing gap, D4)
- [x] 3.5 Review existing `defineService.test.ts` context assertions for collisions on the three new names and update any that assumed inheritance from the bag

## 4. Verification

- [x] 4.1 Confirm canonical test command: `npm test` (global Vitest suite); scenario suite is `npm run test:scenario`
- [x] 4.2 Run `npm run lint` clean (ESLint, connector-spec help check, knip)
- [x] 4.3 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)
- [ ] 4.4 Tenant acceptance (manual, outside the suite): with a reviewer-gated `id` expression on *Orphan Account Management*, aggregate and confirm Fusion accounts appear for the reviewer identities and for no one else — the existing `recordings/company24509-poc/orphan` chain has no `scenario.json`, so record a fresh chain if a replayable artifact is wanted. Suite covers the expression; tenant aggregate still needed.

## 5. Documentation

- [x] 5.1 `docs/reference/velocity-context.md`: add `$statuses`, `$actions`, `$reviews` to the quick reference and data sections, stating they are live current-run values and that `$previous.*` holds the prior snapshot
- [x] 5.2 `docs/reference/velocity-context.md`: document the `velocityjs` array-method caveat — `contains()` renders false and `isEmpty()` renders the literal, while `includes()`, `indexOf() >= 0`, `size()`, and `#foreach` work (D5)
- [x] 5.3 `docs/use-guides/configuration/defining-attributes.md`: add the reviewer-only account recipe pairing a status-gated unique `id` with **Skip accounts with missing unique ID?**, and note that Normal definitions on a newly created global reviewer account are one aggregation behind
- [x] 5.4 Run `npm run lint:markdown` and `npm run lint:docs-guides`

## 6. Changelog

- [x] 6.1 Create or update changelog entry for this change via **changelog-generator**
- [x] 6.2 Confirm the entry calls out the behavior change for expressions already referencing `$statuses`, `$actions`, or `$reviews`
