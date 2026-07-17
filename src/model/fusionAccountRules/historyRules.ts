import { missing, trimStr } from '../../utils/safeRead'
import { FusionAccountState } from '../fusionAccountState'

/**
 * Adds a dated history entry to the supplied state, enforcing the maximum
 * history size and suppressing consecutive duplicate messages.
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

/**
 * Imports existing history entries into the supplied state, normalizing,
 * deduplicating, and respecting the maximum history limit.
 *
 * Imported entries are preserved as-is (no date prefix is added), so they
 * match the persisted format.
 */
export function importHistory(state: FusionAccountState, history: string[]): void {
    const normalizedHistory = history
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)

    const dedupedHistory: string[] = []
    for (const entry of normalizedHistory) {
        if (dedupedHistory[dedupedHistory.length - 1] !== entry) {
            dedupedHistory.push(entry)
        }
    }

    state.history = dedupedHistory.slice(-state.maxHistoryMessages)
}

/**
 * Normalizes a value into a non-empty history label, falling back when needed.
 */
export function normalizeHistoryLabel(value: unknown, fallback: string): string {
    return trimStr(value) ?? fallback
}

/**
 * Formats an account name/source pair for history messages.
 */
export function formatHistoryAccountInfo(name: unknown, source: unknown): string {
    const accountLabel = normalizeHistoryLabel(name, 'Unknown account')
    const sourceLabel = normalizeHistoryLabel(source, 'Unknown source')
    return `${accountLabel} [${sourceLabel}]`
}
