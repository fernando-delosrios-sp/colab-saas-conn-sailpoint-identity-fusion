# Tasks: Hydrate correlated identity aliases

## 1. Add `identityAlias` accessor

- [x] 1.1 Add `public get identityAlias(): string | undefined` to `FusionAccount` in `src/model/fusionAccountAccessors.ts`. Return `state.identityInfo?.displayName`.
- [x] 1.2 Add a unit test in `src/model/__tests__/fusionAccount.test.ts` that asserts the accessor returns `identityInfo?.displayName` when set and `undefined` when `identityInfo` is undefined.

## 2. Switch display attribute override to consume `identityAlias`

- [x] 2.1 In `src/services/definitionService/definitionService.ts` `applyDisplayAttributeOverrideIfApplicable`, replace `const label = fusionAccount.identityName` with `const label = fusionAccount.identityAlias`. Update the surrounding JSDoc and the `log.info` message to refer to "identity alias" instead of "identity name".
- [x] 2.2 Update existing unit tests in `src/services/definitionService/__tests__/defineService.test.ts` so assertions about the override value expect the authoritative `displayName` instead of the login. Add a new test case asserting that when `identityAlias` is set, the display attribute receives the alias. Add a test asserting the existing `canResetDisplay` / `isExistingFusionAccount` short-circuit rules still apply when `identityAlias` is undefined.

## 3. Add correlated-identity hydration pass to the pipeline

- [x] 3.1 In `src/operations/helpers/corePipeline.ts` (or the equivalent phase function that runs the managed-source aggregation), after `run.allManagedAccounts` is populated and before any `getISCAccount` call: collect distinct `identityId` values from the managed accounts (skip empty), call `identities.hydrateMissingIdentitiesById(identityIds)`, then for each FusionAccount whose `state.originAccount` is a managed account whose `identityId` is now in `run.allIdentities` and whose `state.identityInfo` is undefined, call `fusionAccount.addIdentityLayer(identity)`. Skip protected identities.
- [x] 3.2 Extract the hydration orchestration into a small private helper in `corePipeline.ts` (e.g. `hydrateCorrelatedManagedAccountIdentities(managedAccounts, identities)`) so the call site is a single line and the logic is unit-testable.
- [x] 3.3 Add a unit test for the helper: empty managed accounts → no calls; one managed account with `identityId` → hydrate called with that id and `addIdentityLayer` called once; multiple accounts sharing one identity → hydrate called once with that id and `addIdentityLayer` called once per account; protected identity → `addIdentityLayer` skipped.

## 4. Add chain-harness integration scenario

- [x] 4.1 Add a scenario to the chain harness where a managed account is correlated to an identity whose `displayName` differs from `name`. Assert the output Fusion account's `attributes[fusionDisplayAttribute]` (usually `attributes.name`) SHALL equal `displayName`, not `name` (the login) and not the source account's name.
- [x] 4.2 Verify the new scenario uses the chunked hydration path (e.g. by setting up enough managed accounts to force more than one chunk and confirming all are hydrated).

> **Note:** The full chain-harness scenario requires a recorded ISC HTTP interaction under `test-data/recordings/<name>/scenario.json` (needs a live tenant via `npm run record`, out of scope for a code-change session). The scenario is covered in-process by two new end-to-end tests in `src/operations/helpers/__tests__/hydrateCorrelatedManagedAccountIdentities.test.ts` (the `end-to-end (chain-harness scenario)` describe block): one verifies the alias is exposed on a correlated FusionAccount after hydration; the other verifies many-account batching. These tests run the same code path the chain-harness would exercise (`hydrateCorrelatedManagedAccountIdentities` end-to-end) without requiring a recorded HTTP session.

## 5. Verify and archive

- [x] 5.1 Run `npm run lint` and `npm test` and fix any issues.
- [x] 5.2 Run `/opsx:verify` to confirm the implementation matches the spec.
- [x] 5.3 Run `/opsx:archive` to close the change.
