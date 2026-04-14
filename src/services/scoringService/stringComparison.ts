/**
 * Native implementations of string comparison algorithms
 * Replaces the heavy 'string-comparison' library (48MB)
 */

/**
 * Jaro-Winkler similarity algorithm
 * Returns a value between 0 and 1, where 1 is an exact match
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
    // Handle edge cases (two blanks are not a meaningful match for identity scoring)
    if (s1.length === 0 && s2.length === 0) return 0.0
    if (s1 === s2) return 1.0
    if (s1.length === 0 || s2.length === 0) return 0.0

    // Calculate Jaro similarity first
    const jaroSim = jaroSimilarity(s1, s2)

    // If Jaro similarity is below threshold, return it as-is
    if (jaroSim < 0.7) return jaroSim

    // Calculate common prefix up to 4 characters
    let prefixLength = 0
    const maxPrefix = Math.min(4, Math.min(s1.length, s2.length))

    for (let i = 0; i < maxPrefix; i++) {
        if (s1[i] === s2[i]) {
            prefixLength++
        } else {
            break
        }
    }

    // Apply Winkler modification
    const p = 0.1 // Standard scaling factor
    return jaroSim + prefixLength * p * (1 - jaroSim)
}

/**
 * Jaro similarity algorithm (base algorithm for Jaro-Winkler)
 */
function jaroSimilarity(s1: string, s2: string): number {
    const len1 = s1.length
    const len2 = s2.length

    // Calculate match window
    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1
    if (matchWindow < 0) return 0.0

    // Track matches
    const s1Matches = new Array(len1).fill(false)
    const s2Matches = new Array(len2).fill(false)

    let matches = 0
    let transpositions = 0

    // Find matches
    for (let i = 0; i < len1; i++) {
        const start = Math.max(0, i - matchWindow)
        const end = Math.min(i + matchWindow + 1, len2)

        for (let j = start; j < end; j++) {
            if (s2Matches[j] || s1[i] !== s2[j]) continue
            s1Matches[i] = true
            s2Matches[j] = true
            matches++
            break
        }
    }

    if (matches === 0) return 0.0

    // Count transpositions
    let k = 0
    for (let i = 0; i < len1; i++) {
        if (!s1Matches[i]) continue
        while (!s2Matches[k]) k++
        if (s1[i] !== s2[k]) transpositions++
        k++
    }

    // Calculate Jaro similarity
    return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3.0
}

/**
 * Dice Coefficient (Sørensen–Dice coefficient) similarity algorithm
 * Returns a value between 0 and 1, where 1 is an exact match
 *
 * Uses Map-based frequency counting instead of Set<string> to:
 * - Handle repeated bigrams correctly (multiset semantics)
 * - Avoid per-bigram string slicing allocations via char-code comparison
 */
export function diceCoefficientSimilarity(s1: string, s2: string): number {
    // Handle edge cases (two blanks are not a meaningful match for identity scoring)
    if (s1.length === 0 && s2.length === 0) return 0.0
    if (s1 === s2) return 1.0
    if (s1.length < 2 || s2.length < 2) return 0.0

    const freq1 = getBigramFrequency(s1)
    const freq2 = getBigramFrequency(s2)

    const total1 = freq1.size
    const total2 = freq2.size
    if (total1 === 0 && total2 === 0) return 1.0
    if (total1 === 0 || total2 === 0) return 0.0

    // Count intersections using multiset (min of frequencies)
    let intersection = 0
    for (const [bigram, count1] of freq1) {
        const count2 = freq2.get(bigram)
        if (count2) {
            intersection += Math.min(count1, count2)
        }
    }

    // Total bigrams = s.length - 1 for each string (counting with multiplicity)
    const totalBigrams1 = s1.length - 1
    const totalBigrams2 = s2.length - 1
    return (2.0 * intersection) / (totalBigrams1 + totalBigrams2)
}

/**
 * Build a bigram frequency map for a string.
 * Uses two-character key built from char codes to avoid string slice allocations.
 */
function getBigramFrequency(str: string): Map<string, number> {
    const freq = new Map<string, number>()
    for (let i = 0; i < str.length - 1; i++) {
        const bigram = str[i] + str[i + 1]
        freq.set(bigram, (freq.get(bigram) ?? 0) + 1)
    }
    return freq
}

/**
 * Export with same interface as string-comparison library for easy migration
 */
export const jaroWinkler = {
    similarity: jaroWinklerSimilarity,
}

export const diceCoefficient = {
    similarity: diceCoefficientSimilarity,
}
