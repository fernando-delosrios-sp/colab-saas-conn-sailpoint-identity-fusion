## 1. Configuration

- [x] 1.1 Add `orphanProcessingMode` radio to `connector-spec.json` under Source type, visible only when the value is `orphan`, options Assignment (`assignment`, default) and Ownership (`ownership`)
- [x] 1.2 Add the mode to `SourceConfig` and `sourcesSettings`, defaulting omitted values to `assignment`
- [x] 1.3 Test that an omitted mode reads as Assignment and an explicit `ownership` value reads as Ownership (`sourcesSettings` tests)

## 2. Fetch eligibility

- [x] 2.1 In `collectAccountsFromBatch`, register Ownership-mode accounts only when `isMachine` is true and `ownerIdentity.id` is missing or blank, including correlated accounts
- [x] 2.2 Do not register non-machine accounts or machine accounts with an established owner identity on an Ownership-mode source, and do not count those skips toward the aggregation batch size or queue a disable
- [x] 2.3 Keep discarding every machine account for Assignment-mode Orphan sources, Authoritative sources, and Records sources
- [x] 2.4 Test fetch registration for: correlated unowned machine account, uncorrelated unowned machine account, owned machine account, non-machine account, Assignment-mode machine account, and Authoritative machine account

## 3. Match scoring and non-match

- [x] 3.1 In `resolveAccountBeforeScoring`, enqueue Ownership-eligible accounts instead of the already-linked skip and the correlated non-match shortcut
- [x] 3.2 Claim a scored Ownership-eligible account off the managed-account work queue so the uncorrelated sweep does not score it again
- [x] 3.3 Keep Ownership non-match on the orphan drop path: no owner identity write; queue disable only when Disable non-matching accounts is on
- [x] 3.4 Test correlated scoring, Fusion-linked scoring, non-match without disable, and non-match with disable

## 4. Owner identity write

- [ ] 4.1 Add a SourceService method that sets owner identity through `MachineAccountsApi.updateMachineAccount`, JSON Patch `/ownerIdentity` to `{ type: 'IDENTITY', id }`, using the fetched account id, via the existing client queue
- [ ] 4.2 If that call reports an unknown id, resolve the machine account by source id and `nativeIdentity` and patch that id. Do not PATCH `/identityId`
- [ ] 4.3 Pass the SDK experimental header only if a call without it is rejected. If the API requires a PAT scope other than `idn:accounts:manage`, record that scope for the documentation task
- [ ] 4.4 On a failed owner write, log the error, do not fail the aggregation, and do not store a local owned flag so the next run retries
- [ ] 4.5 In `DecisionProcessor.processFusionIdentityDecision`, branch Ownership-mode authorized decisions (automatic merge and reviewer selection) to the owner write. Do not call `CorrelationManager`, do not change `identityId`, and do not attach the machine account as a contributing or missing account on a Fusion account. Ignore correlation mode for that write
- [ ] 4.6 Keep Assignment-mode reviewer selection on the existing correlation path
- [ ] 4.7 Apply the same owner-write branch for a reviewer no-match only as a drop: no owner write, and disable only when Disable non-matching accounts is on
- [ ] 4.8 Test automatic merge owner write, reviewer selection owner write, Assignment-mode reviewer selection still correlating, reviewer no-match without disable, and reviewer no-match with disable

## 5. Review form copy

- [ ] 5.1 Add Ownership-mode form strings that describe choosing an owner identity, and do not describe correlation or merge, in all ten locales
- [ ] 5.2 Select those strings when the source is Ownership mode. Leave Assignment-mode orphan merge wording unchanged
- [ ] 5.3 Test Ownership form copy, Assignment-mode orphan merge copy, and that the new keys exist in all ten locales

## 6. Verification

- [ ] 6.1 Confirm canonical test command: `npm test` (global Vitest suite). Run the targeted suites touched above with `npx vitest run` on those files before the full suite
- [ ] 6.2 All delta spec scenarios covered by named automated tests (coverage evidence for `/opsx:verify`)

## 7. Documentation

- [ ] 7.1 Add Orphan processing mode, Assignment mode, Ownership mode, Machine account, Owner identity, and Established owner identity to `docs/glossary.md`, kept distinct from Automatic assignment, Orphan, and the Fusion source owner
- [ ] 7.2 Document both modes in `docs/use-guides/configuration/source-types.md`, including eligibility, owner write versus correlation, and the existing no-match disable toggle
- [ ] 7.3 Update the machine-account notes in `docs/use-guides/configuration/configuring-sources-and-scope.md` and `docs/operations/account-list.md` so Ownership mode is the exception to discarding `isMachine` accounts
- [ ] 7.4 Add the processing-mode field to the per-source table in `docs/use-guides/configuration/configuring-sources-and-scope.md`
- [ ] 7.5 If task 4.3 found a new PAT scope, add it to `docs/reference/pat-scopes.md` as required only for Ownership mode. Otherwise leave that page unchanged
- [ ] 7.6 Add JSDoc on the owner-identity write stating it updates `ownerIdentity` and does not correlate

## 8. Changelog

- [ ] 8.1 Create or update changelog entry for this change
- [ ] 8.2 Confirm entry covers user-visible changes from proposal Capabilities
