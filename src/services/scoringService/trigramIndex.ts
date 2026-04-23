import { FusionAccount } from '../../model/account'
import { hasValue } from '../../utils/safeRead'
import { normalizeLIG3 } from './helpers'

/**
 * Inverted trigram index: maps a 3-character window to the set of FusionAccounts
 * whose attribute value contains that window (after LIG3 normalization).
 */
export type TrigramIndex = Map<string, Set<FusionAccount>>

/**
 * Extract sliding 3-character windows from a normalized string with standard padding.
 * Padding ensures leading and trailing characters are indexed.
 */
export function extractTrigrams(normalized: string): Set<string> {
    const result = new Set<string>()
    const padded = `  ${normalized} `
    for (let i = 0; i <= padded.length - 3; i++) {
        result.add(padded.slice(i, i + 3))
    }
    return result
}

/**
 * Build a {@link TrigramIndex} for one attribute across all provided identities.
 * Identities whose attribute value is missing or empty are not indexed.
 *
 * @param identities - Pre-collected identity array (generators cannot be iterated multiple times)
 * @param attribute - The attribute name to index (e.g. `'email'`, `'firstname'`)
 */
export function buildAttributeIndex(identities: FusionAccount[], attribute: string): TrigramIndex {
    const index: TrigramIndex = new Map()
    for (const identity of identities) {
        const raw = identity.attributes[attribute]
        if (!hasValue(raw)) continue
        const normalized = normalizeLIG3(String(raw))
        for (const trigram of extractTrigrams(normalized)) {
            let bucket = index.get(trigram)
            if (!bucket) {
                bucket = new Set()
                index.set(trigram, bucket)
            }
            bucket.add(identity)
        }
    }
    return index
}

/**
 * Return all identities in `index` that share at least one trigram with `accountValue`.
 * This is a broad pre-filter: candidates still undergo the full scoring comparison.
 *
 * Returns an empty set (not `undefined`) when no candidates match, so the caller can
 * safely skip the full identity scan.
 */
export function queryAttributeIndex(index: TrigramIndex, accountValue: string): Set<FusionAccount> {
    const normalized = normalizeLIG3(accountValue)
    const candidates = new Set<FusionAccount>()
    // Iterate the padded string directly rather than building an intermediate Set<string>.
    // Duplicate trigrams are harmless: candidates.add() is idempotent, and typical names
    // have few repeated 3-char windows, so the savings from skipping the Set allocation outweigh
    // the rare duplicate bucket lookup.
    const padded = `  ${normalized} `
    for (let i = 0; i <= padded.length - 3; i++) {
        const bucket = index.get(padded.slice(i, i + 3))
        if (bucket) {
            for (const identity of bucket) {
                candidates.add(identity)
            }
        }
    }
    return candidates
}
