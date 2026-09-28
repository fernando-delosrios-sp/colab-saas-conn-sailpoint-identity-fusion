## Scope

Add an **Orphan processing mode** on Orphan-type sources, defaulting to **Assignment mode** (today's orphan behavior). **Ownership mode** scores only machine accounts that have no owner identity, including accounts already correlated to an identity, and writes the selected identity as `ownerIdentity` instead of correlating. Out of scope: changing Authoritative or Records sources, changing Assignment-mode correlation, and processing non-machine accounts or machine accounts that already have an owner identity on an Ownership-mode source.

## Language

**Orphan processing mode** (`promote`):
The per-source setting on an Orphan accounts source that chooses Assignment mode or Ownership mode.
_Avoid_: orphan mode, processing type, source mode

**Assignment mode** (`promote`):
The Orphan processing mode that keeps today's orphan Match behavior: uncorrelated non-machine accounts are scored, and a selected identity is correlated.
_Avoid_: assignment, automatic assignment, merge mode

**Ownership mode** (`promote`):
The Orphan processing mode whose eligible population is machine accounts with no owner identity, and whose selected identity is that account's owner identity.
_Avoid_: owner mode, machine mode, orphan ownership

**Machine account** (`promote`):
A managed source account with `isMachine` true.
_Avoid_: service account, non-human account, machine identity

**Owner identity** (`promote`):
The ISC identity referenced by a machine account's `ownerIdentity`. Distinct from the correlated identity (`identityId`) and from the Fusion source owner.
_Avoid_: owner, account owner, source owner

**Established owner identity** (`promote`):
An owner identity whose `id` is a non-empty string. A missing `ownerIdentity`, or one without an id, is not established.
_Avoid_: owned, has owner

Conflict check against `openspec/specs/ubiquitous-language/spec.md`:

- **Orphan** and **Orphan accounts** stay as they are. Ownership mode is a setting on the Orphan accounts source type, not a new sense of Orphan.
- **Automatic assignment** stays the Match threshold decision. **Assignment mode** is only the Orphan processing mode. Do not shorten it to "assignment".
- Fusion source owner and **Global reviewer** stay separate from **Owner identity**.

## Decisions

Context: Orphan sources today discard every machine account after fetch, and `resolveAccountBeforeScoring` treats `uncorrelated === false` as a non-match without scoring. A reviewer or automatic merge then correlates by PATCHing `/identityId`. The Accounts model already carries `isMachine` and `ownerIdentity` (`{ type, id, name }`). Patching `ownerIdentity` is documented on `MachineAccountsApi.updateMachineAccount`, not on `accounts.updateAccount` (that PATCH is the correlation write).

- Q1. What happens to accounts on an Ownership-mode source that are not unowned machine accounts? → Skip them. They are not scored, correlated, or disabled.
- Q2. Which assignment paths write owner identity? → Both automatic merge and reviewer selection.
- Q3. What is a non-match in Ownership mode? → Same as Assignment mode: drop the account, and queue disable when **Disable non-matching accounts** is on.
- Q4. Does Ownership mode still correlate when **Correlation mode** is correlate or reverse? → No. The owner-identity write replaces correlation for eligible accounts. Correlation mode does not apply to that write.
- Q5. Do correlated or Fusion-linked machine accounts still skip Match? → No, when they are Ownership-eligible. Both the correlated non-match shortcut and the already-linked skip do not apply to them. The outcome still must not PATCH `/identityId` or attach the account as a missing account to be correlated later.
- Q6. Which API writes the owner? → `updateMachineAccount` JSON Patch on `/ownerIdentity` with `{ type: 'IDENTITY', id: <selected identity id> }`, using the account id from the fetched account. `accounts.updateAccount` stays the correlation path.

## Open questions

None. The machine-account update is exposed on the installed SailPoint SDK (`updateMachineAccount`). Whether that call needs the experimental header at runtime is an implementation check, not a scope fork: pass the header the SDK documents if the tenant requires it.

## Scenarios discussed

- An existing Orphan source with no processing-mode value behaves as Assignment mode: machine accounts are discarded, correlated accounts do not enter scoring, and a selected identity is correlated.
- Ownership mode, uncorrelated machine account, no owner identity, score at or above automatic merge: PATCH `ownerIdentity` to the selected identity. Do not PATCH `identityId`.
- Ownership mode, correlated machine account (`uncorrelated === false`), no owner identity: the account enters Match scoring. A selected identity becomes the owner identity. The existing `identityId` is left unchanged.
- Ownership mode, machine account whose `ownerIdentity.id` is set: skipped.
- Ownership mode, non-machine account: skipped.
- Ownership mode, no identity meets the threshold: account is dropped. Disable is queued only when **Disable non-matching accounts** is enabled.
- Ownership mode, partial match: a review form is created. A later reviewer selection of an existing identity sets owner identity. A reviewer no-match follows the drop and disable rule.
- Authoritative and Records sources, and Assignment-mode Orphan sources, still discard machine accounts.
- An Ownership-eligible account already linked on a Fusion account is still scored for an owner identity and is not correlated.
- **Correlation mode** correlate, reverse, or none on an Ownership-mode source does not cause an identity correlation for an Ownership-eligible account.
