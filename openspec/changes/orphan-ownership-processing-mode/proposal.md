## Why

Orphan sources can only correlate uncorrelated non-machine accounts. Machine accounts are discarded after fetch, and accounts that already have an identity never enter Match, so there is no way to assign an owner identity to an unowned machine account. Ownership mode fills that gap without changing Assignment mode, which stays the default.

## What Changes

**Orphan processing mode**
- From: Orphan sources have one implicit behavior, with no processing-mode setting.
- To: Source Settings shows two radio options when Source type is Orphan accounts. **Assignment** is the default and preserves today's behavior. **Ownership** is the new mode. Omitted values read as Assignment, so existing sources do not change.
- Reason: Operators need to choose owner assignment for machine accounts without giving up the current orphan correlation flow.
- Impact: Non-breaking. New config key `orphanProcessingMode` with values `assignment` and `ownership`.

**Ownership eligibility**
- From: Every managed source discards `isMachine: true` accounts after fetch. Match does not score accounts with `uncorrelated === false`, including those already linked on a Fusion account.
- To: An Ownership-mode source keeps machine accounts whose owner identity is not established (`ownerIdentity` missing or without an id), including correlated and Fusion-linked ones, and scores them. Non-machine accounts and machine accounts with an established owner identity are skipped: not scored, not correlated, and not disabled. Assignment mode and other source types still discard machine accounts.
- Reason: Owner assignment applies to unowned machine accounts whether or not they are already correlated.
- Impact: Non-breaking for Assignment mode. Ownership mode fetches a population that is discarded today.

**Ownership assignment**
- From: Automatic merge and reviewer selection of an existing identity correlate the managed account (PATCH `/identityId` when correlation mode is correlate).
- To: Both paths write the selected identity as the machine account's owner identity via `updateMachineAccount` (`/ownerIdentity` = `{ type: 'IDENTITY', id }`). They do not PATCH `/identityId`, do not apply reverse correlation, and do not leave the account as a missing account to correlate later. Correlation mode is ignored for that write.
- Reason: Ownership assigns an owner. It does not correlate the account.
- Impact: Non-breaking outside Ownership mode. Requires the machine-account update API.

**Ownership non-match**
- From: An Orphan non-match drops the account and queues disable when Disable non-matching accounts is on.
- To: Ownership mode keeps that no-match rule, including a reviewer no-match. Disable still uses the existing account-disable path.
- Reason: Unowned machine accounts that match nobody should follow the same cleanup operators already configure.
- Impact: Non-breaking. The existing orphan disable toggle applies to Ownership non-matches.

**Review form copy**
- From: Orphan review text tells the reviewer to merge the account into an identity.
- To: Ownership-mode reviews tell the reviewer they are choosing an owner identity, not correlating or merging the account.
- Reason: The action the reviewer confirms is an owner write.
- Impact: Non-breaking. Assignment-mode form copy is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ubiquitous-language`: Add Orphan processing mode, Assignment mode, Ownership mode, Machine account, Owner identity, and Established owner identity. Keep Orphan, Automatic assignment, and Fusion source owner distinct.
- `source-service`: Read `orphanProcessingMode` (default Assignment). Keep unowned machine accounts for Ownership-mode sources. Skip ineligible accounts on those sources. Write owner identity through the machine-account update API.
- `matching-service`: Score Ownership-eligible accounts even when they are correlated or already linked. Dispatch automatic merge to the owner-identity write. Keep orphan non-match drop and optional disable for Ownership mode.
- `fusion-service`: A reviewer selection of an existing identity on an Ownership-mode account sets owner identity and does not correlate. A reviewer no-match still drops and honors Disable non-matching accounts.
- `form-service`: Ownership-mode review form copy describes owner-identity selection.

## Impact

- Config: `connector-spec.json` radio under Source type = Orphan accounts; `SourceConfig` and `sourcesSettings` default `assignment`.
- Fetch: `managedAccountFetcher` machine-account exclusion gains an Ownership-mode exception. Ineligible accounts on that source are removed before Match.
- Match: `resolveAccountBeforeScoring` and automatic-merge dispatch in `MatchOutcomeDispatcher`.
- Decisions: `DecisionProcessor.processFusionIdentityDecision` and `CorrelationManager` must not correlate Ownership-mode assignments.
- ISC: `MachineAccountsApi.updateMachineAccount` JSON Patch `/ownerIdentity`. `accounts.updateAccount` remains the correlation path only. Pass the SDK experimental header if the tenant requires it.
- Docs: Source types guide, configuring sources and scope (machine-account note), and account-list machine-account note.
- Tests: source settings defaults, fetch eligibility, pre-score gate, automatic merge, reviewer decision, non-match disable, and form copy.
