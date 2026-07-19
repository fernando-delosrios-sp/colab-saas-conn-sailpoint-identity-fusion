import { FusionAccountState } from '../fusionAccountState'
import { FusionAction } from '../fusionAction'
import { StatusEntitlement } from '../statusEntitlement'
import { addToSet, removeFromSet } from './collectionRules'
import { addStatus } from './statusRules'

/** Adds an action entitlement to the supplied state. */
export function addAction(state: FusionAccountState, action: string, message?: string): void {
    addToSet(state, state.actions, action, message)
}

/** Removes an action entitlement from the supplied state. */
export function removeAction(state: FusionAccountState, action: string, message?: string): void {
    removeFromSet(state, state.actions, action, message)
}

/** Marks the identity as a reviewer for the given source. */
export function setSourceReviewer(state: FusionAccountState, sourceId: string): void {
    state.actions.add(`${FusionAction.ReviewerPrefix}${sourceId}`)
    addStatus(state, StatusEntitlement.Reviewer)
}

/** Removes reviewer assignment for the given source and updates reviewer status when needed. */
export function removeSourceReviewer(state: FusionAccountState, sourceId: string): void {
    state.actions.delete(`${FusionAction.ReviewerPrefix}${sourceId}`)
    if (!actionsHasReviewerScope(state)) {
        state.statuses.delete(StatusEntitlement.Reviewer)
    }
}

/** Returns the source IDs the identity is configured to review. */
export function listReviewerSources(state: FusionAccountState): string[] {
    const prefix = FusionAction.ReviewerPrefix
    const result: string[] = []
    for (const action of state.actions) {
        if (action.startsWith(prefix)) {
            result.push(action.slice(prefix.length))
        }
    }
    return result
}

/** True when at least one source-scoped reviewer action remains on the state. */
function actionsHasReviewerScope(state: FusionAccountState): boolean {
    const prefix = FusionAction.ReviewerPrefix
    for (const action of state.actions) {
        if (action.startsWith(prefix)) {
            return true
        }
    }
    return false
}

/** Adds a fusion decision action entitlement with a history entry. */
export function addFusionDecision(state: FusionAccountState, decision: string): void {
    addAction(state, decision, `Fusion decision added: ${decision}`)
}
