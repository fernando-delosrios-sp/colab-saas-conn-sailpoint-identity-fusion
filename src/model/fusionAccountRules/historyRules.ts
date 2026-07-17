import { missing, trimStr } from '../../utils/safeRead'
import { FusionAccountState } from '../fusionAccountState'

/**
 * Minimal stub for history rules.
 * Duplicates the current behavior of `FusionAccount.addHistory` while operating
 * directly on the supplied state container.
 */
export function addHistory(state: FusionAccountState, message?: string): void {
    const normalizedMessage = trimStr(message) ?? ''
    if (missing(normalizedMessage)) return

    const now = new Date().toISOString().split('T')[0]
    const datedMessage = `[${now}] ${normalizedMessage}`
    const previousMessage = state.history[state.history.length - 1]
    if (previousMessage === datedMessage) return
    state.history.push(datedMessage)

    // Enforce maximum history size by keeping only the most recent entries
    if (state.history.length > state.maxHistoryMessages) {
        state.history = state.history.slice(-state.maxHistoryMessages)
    }
}
