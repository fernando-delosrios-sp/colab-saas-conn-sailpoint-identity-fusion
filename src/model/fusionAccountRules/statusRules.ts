import { FusionDecision } from '../form'
import { SourceType } from '../config'
import { FusionAccountState } from '../fusionAccountState'
import { FusionAction } from '../fusionAction'
import { StatusEntitlement } from '../statusEntitlement'
import { addAccountId, addMissingAccountId } from './collectionRules'
import { addHistory, formatHistoryAccountInfo, normalizeHistoryLabel } from './historyRules'

/** Adds a status entitlement to the supplied state. */
export function addStatus(state: FusionAccountState, status: string, message?: string): void {
    const initialSize = state.statuses.size
    state.statuses.add(status)
    const added = state.statuses.size > initialSize
    if (added && message) {
        addHistory(state, message)
    }
}

/** Removes a status entitlement from the supplied state. */
export function removeStatus(state: FusionAccountState, status: string, message?: string): void {
    const removed = state.statuses.delete(status)
    if (removed && message) {
        addHistory(state, message)
    }
}

/** Checks whether the supplied state has a given status. */
export function hasStatus(state: FusionAccountState, status: string): boolean {
    return state.statuses.has(status)
}

/** Shared logic for setting uncorrelated status. */
function setUncorrelatedStatus(state: FusionAccountState): void {
    state.uncorrelated = true
    state.statuses.add(StatusEntitlement.Uncorrelated)
    state.actions.delete(FusionAction.Correlated)
}

/** Sets a specific account ID as uncorrelated and tracks it as missing. */
export function setUncorrelatedAccount(state: FusionAccountState, accountId?: string): void {
    if (!accountId) return

    addAccountId(state, accountId)
    addMissingAccountId(state, accountId)
    setUncorrelatedStatus(state)
}

/** Marks the state as NonMatched (no Match found, pending review). */
export function setNonMatched(state: FusionAccountState): void {
    state.statuses.add(StatusEntitlement.NonMatched)
    addHistory(
        state,
        `Set ${formatHistoryAccountInfo(state.name, state.sourceName)} as NonMatched`
    )
}

/**
 * Builds a history message for decision actions, varying wording by source type.
 */
function createDecisionHistoryMessage(
    _state: FusionAccountState,
    decision: FusionDecision,
    action: string
): string {
    const submitterName = normalizeHistoryLabel(
        decision.submitter.name || decision.submitter.email,
        'Unknown reviewer'
    )
    const accountInfo = formatHistoryAccountInfo(decision.account.name, decision.account.sourceName)
    const sourceType = decision.sourceType ?? SourceType.Authoritative

    if (action === 'manual') {
        return `Set ${accountInfo} as new account by ${submitterName}`
    }

    if (decision.automaticAssignment === true) {
        return `Auto-assigned ${accountInfo} to existing identity`
    }
    if (sourceType === SourceType.Record) {
        return `Assigned record ${accountInfo} to existing identity by ${submitterName}`
    }
    if (sourceType === SourceType.Orphan) {
        return `Assigned orphan account ${accountInfo} to existing identity by ${submitterName}`
    }
    return `Set ${accountInfo} as authorized by ${submitterName}`
}

/** Marks the state as "manual" (reviewer decided to create a new identity or confirmed no match). */
export function setManual(state: FusionAccountState, decision: FusionDecision): void {
    state.statuses.delete(StatusEntitlement.NonMatched)
    state.statuses.add(StatusEntitlement.Manual)
    addHistory(state, createDecisionHistoryMessage(state, decision, 'manual'))
}

/**
 * Marks merge-into-existing decisions: reviewer-approved adds `authorized`;
 * exact-match automatic assignment adds `auto` only (not `authorized`).
 */
export function setAuthorized(state: FusionAccountState, decision: FusionDecision): void {
    state.statuses.delete(StatusEntitlement.NonMatched)
    if (decision.automaticAssignment === true) {
        state.statuses.add(StatusEntitlement.Auto)
    } else {
        state.statuses.add(StatusEntitlement.Authorized)
    }
    addHistory(state, createDecisionHistoryMessage(state, decision, 'authorized'))
}

/** Whether the state has the orphan status. */
export function isOrphan(state: FusionAccountState): boolean {
    return state.statuses.has(StatusEntitlement.Orphan)
}
