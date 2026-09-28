## Context

Orphan sources today have one behavior, which this change names Assignment mode. Fetch discards every `isMachine: true` account in `collectAccountsFromBatch`. `resolveAccountBeforeScoring` then drops accounts already linked on a Fusion account, and treats `uncorrelated === false` as a non-match without scoring. A selected identity, from automatic merge or a reviewer, is applied in `DecisionProcessor.processFusionIdentityDecision`, which calls `CorrelationManager` and can PATCH `/identityId`.

Ownership mode is a second radio on Orphan sources. It scores only machine accounts with no established owner identity, including correlated and Fusion-linked ones, and writes that identity to `ownerIdentity`. The SailPoint SDK already models `AccountV2026.ownerIdentity` as `{ type, id, name }` and exposes `MachineAccountsApi.updateMachineAccount` with `/ownerIdentity` as a patchable field. `accounts.updateAccount` remains the correlation write.

## Goals / Non-Goals

**Goals:**

- Add `orphanProcessingMode` with `assignment` (default) and `ownership`, shown only when Source type is Orphan accounts.
- Keep Assignment mode, Authoritative sources, and Records sources on today's machine-account discard and correlation behavior.
- In Ownership mode, score unowned machine accounts even when they are correlated or already linked, and skip every other account on that source without scoring, correlation, or disable.
- On automatic merge and on reviewer selection of an existing identity, PATCH `/ownerIdentity` and do not correlate.
- On no match, including a reviewer no-match, drop the account and queue disable only when Disable non-matching accounts is on.
- Say "owner identity" on Ownership-mode review forms.

**Non-Goals:**

- Processing non-machine accounts, or machine accounts that already have an owner identity, on an Ownership-mode source.
- Changing Assignment-mode correlation, correlation modes, or the `/identityId` patch.
- Creating or merging a Fusion account from an Ownership assignment.
- A new ISC scope unless implementation finds `updateMachineAccount` is not covered by `idn:accounts:manage`.

## Decisions

### D1: Config key and default

- **Choice**: `orphanProcessingMode` on `SourceConfig`, enum `assignment` | `ownership`, default `assignment` when the key is omitted or the source type is not Orphan. Connector spec radio, `parentKey: sourceType`, `parentValue: orphan`, placed with Disable non-matching accounts.
- **Reason**: Existing Orphan sources keep Assignment mode with no migration.
- **Considered alternatives**: Infer the mode from another toggle. Rejected because the two behaviors are alternatives, and the operator asked for two radio buttons with Assignment as the default.

### D2: Eligibility is decided at fetch

- **Choice**: For an Ownership-mode source, `collectAccountsFromBatch` registers an account only when `isMachine === true` and `ownerIdentity.id` is missing or blank. Other accounts on that source are counted as skipped, not as collected, and are not registered on FusionRun. Assignment mode and other source types keep discarding every machine account. A pre-score skip repeats the same rule if an ineligible account is still on the work queue, and that skip does not queue a disable.
- **Reason**: The ISC account list cannot filter `isMachine`. Fetch is already where machine accounts are removed. Skipping ineligible accounts there keeps them out of Match, disable, and the aggregation batch count.
- **Considered alternatives**: Fetch every account and skip later. Rejected because ineligible accounts would consume the aggregation batch size and could hit the orphan non-match disable path.

### D3: Ownership-eligible accounts always enter scoring

- **Choice**: When the account is Ownership-eligible, `resolveAccountBeforeScoring` returns `enqueue`. It does not take the already-linked skip or the `uncorrelated === false` non-match shortcut. The correlated sweep's existing `runMatchSweep` then scores those correlated accounts. The outcome claims the account off `managedAccountsById` so the uncorrelated sweep does not see it again.
- **Reason**: Owner assignment is independent of correlation and of Fusion linkage. The correlated sweep already calls `runMatchSweep`, so enqueue is enough to score them there.
- **Considered alternatives**: A separate ownership sweep. Rejected because Match scoring, review forms, and non-match handling already exist; only the gate and the terminal write change.

### D4: One owner write, branched from the decision

- **Choice**: `DecisionProcessor.processFusionIdentityDecision` detects Ownership mode from the decision's source. For an authorized decision (automatic merge or reviewer selection of an existing identity) it calls a new SourceService method that PATCHes `/ownerIdentity` to `{ type: 'IDENTITY', id: <selected identity id> }` through `MachineAccountsApi.updateMachineAccount` and the existing client queue. It does not call `CorrelationManager`, does not PATCH `/identityId`, does not apply reverse correlation, and does not attach the machine account to a Fusion account as a contributing or missing account. The account id is the id from the fetched account. Correlation mode is not consulted.
- **Reason**: Both assignment paths already become a `FusionDecision` and pass through `processFusionIdentityDecision`. Branching there covers automatic merge (`createAutomaticMergeDecision`) and reviewer selection without a second write in `MatchOutcomeDispatcher`.
- **Considered alternatives**: PATCH `/ownerIdentity` via `accounts.updateAccount`. Rejected because that API documents correlation fields (`identityId`, `manuallyCorrelated`), while `updateMachineAccount` documents `ownerIdentity`.

### D5: Non-match stays on the orphan drop path

- **Choice**: Scoring non-match and reviewer `newIdentity: true` keep using `applyNonAuthoritativeNoMatch` for source type Orphan. Disable is queued only when `disableNonMatchingAccounts` is set. Ineligible skips do not call that helper.
- **Reason**: The operator chose the current orphan no-match rule for Ownership mode.
- **Considered alternatives**: Leave non-matches untouched. Rejected.

### D6: Review copy is mode-specific

- **Choice**: Add Ownership-mode form strings (section description and no-match help) that describe choosing an owner identity. Assignment-mode orphan strings stay as they are. The form builder selects the Ownership strings when the source's processing mode is `ownership`.
- **Reason**: Today's orphan copy says the reviewer is merging the account into an identity, which is the correlation action Ownership mode does not perform.
- **Considered alternatives**: Leave the merge wording. Rejected because the reviewer would confirm the wrong action.

### D7: Failed owner write is retried next aggregation

- **Choice**: A failed `updateMachineAccount` is logged and does not fail the aggregation. The connector does not record a local "owned" flag. The next run still sees no established owner identity and tries again.
- **Reason**: Correlation failures already log and rely on the next aggregation. The eligibility rule is the fetched `ownerIdentity`, so a failed write stays eligible.
- **Considered alternatives**: Fail the account-list operation. Rejected because one account update should not abort the run.

## Risks / Trade-offs

- [Risk] `updateMachineAccount` may require the experimental header or a PAT scope other than `idn:accounts:manage`. -> Mitigation: pass the header the SDK documents if a call without it is rejected. If a new scope is required, add it to `docs/reference/pat-scopes.md` as conditional on Ownership mode. Do not guess a scope name before the API error says so.
- [Risk] The machine-account id may not equal the account id from `listAccounts`. -> Mitigation: call `updateMachineAccount` with the fetched account id. If the API reports the id is unknown, resolve the machine account by source id and `nativeIdentity` before patching. Do not fall back to `/identityId`.
- [Risk] Scoring a correlated, Fusion-linked machine account could blend it onto the target Fusion identity and later correlate it. -> Mitigation: the Ownership decision path must not assemble the machine account onto the target Fusion account and must not call `CorrelationManager`.
- [Trade-off] Ineligible accounts on an Ownership-mode source are ignored, including uncorrelated human accounts that Assignment mode would have correlated. -> Reason: the operator chose skip. Assignment mode remains available on the same source type.
- [Trade-off] Ownership mode does not honor Correlation mode. -> Reason: the selected identity is an owner, not a correlation target.

## Migration Plan

1. Ship the config key with default `assignment`. Existing sources omit the key and keep today's behavior.
2. Operators opt in per Orphan source by selecting Ownership.
3. Rollback is the previous connector build. It ignores `orphanProcessingMode` and discards machine accounts again. A stored `ownership` value does not need to be deleted.
4. Acceptance: Assignment-mode tests stay green; Ownership tests cover fetch eligibility, correlated scoring, owner PATCH without `/identityId`, reviewer selection, reviewer no-match disable, and form copy.

## Open Questions

None.
