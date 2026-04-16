import { doubleMetaphone } from 'double-metaphone'
import { MatchingConfig } from '../../model/config'
import { ScoreReport } from './types'
import { jaroWinkler, diceCoefficient } from './stringComparison'
import { match as nameMatch } from './nameMatching'

// Module-level regex constants — compiled once, reused on every call (hot scoring loop)
const DIACRITICS_RE = /[\u0300-\u036f]/g
const WHITESPACE_RE = /\s+/g

/**
 * Build a ScoreReport without spreading the entire MatchingConfig.
 * Explicit field construction avoids allocating a full object copy per comparison in the hot loop.
 */
function makeScoreReport(
    matching: MatchingConfig,
    score: number,
    isMatch: boolean,
    comment?: string,
    skipped?: boolean
): ScoreReport {
    const r: ScoreReport = {
        attribute: matching.attribute,
        algorithm: matching.algorithm,
        fusionScore: matching.fusionScore,
        mandatory: matching.mandatory,
        skipMatchIfMissing: matching.skipMatchIfMissing,
        score,
        isMatch,
    }
    if (comment !== undefined) r.comment = comment
    if (skipped !== undefined) r.skipped = skipped
    return r
}

// ============================================================================
// Helper Functions
// ============================================================================

export const scoreDice = (
    accountAttribute: string,
    identityAttribute: string,
    matching: MatchingConfig
): ScoreReport => {
    const similarity = diceCoefficient.similarity(accountAttribute, identityAttribute)
    const score = Math.round(similarity * 100)

    const threshold = matching.fusionScore ?? 0
    const isMatch = score >= threshold

    return makeScoreReport(matching, score, isMatch)
}

export const scoreDoubleMetaphone = (
    accountAttribute: string,
    identityAttribute: string,
    matching: MatchingConfig
): ScoreReport => {
    const accountCodes = doubleMetaphone(accountAttribute)
    const identityCodes = doubleMetaphone(identityAttribute)

    let score = 0
    let comment = ''

    if (accountCodes[0] === identityCodes[0] && accountCodes[0]) {
        score = 100
        comment = 'Primary codes match'
    } else if (accountCodes[1] === identityCodes[1] && accountCodes[1]) {
        score = 80
        comment = 'Secondary codes match'
    } else if (accountCodes[0] === identityCodes[1] || accountCodes[1] === identityCodes[0]) {
        score = 70
        comment = 'Cross-match between primary and secondary codes'
    } else {
        const candidatesA = [accountCodes[0], accountCodes[1]].filter((c): c is string => Boolean(c))
        const candidatesB = [identityCodes[0], identityCodes[1]].filter((c): c is string => Boolean(c))

        let bestSimilarity = 0
        for (const a of candidatesA) {
            for (const b of candidatesB) {
                const jw = jaroWinkler.similarity(a, b)
                const dice = diceCoefficient.similarity(a, b)
                bestSimilarity = Math.max(bestSimilarity, jw, dice)
            }
        }

        if (bestSimilarity >= 0.85) {
            score = 60
            comment = 'Strong phonetic similarity'
        } else if (bestSimilarity >= 0.7) {
            score = 45
            comment = 'Moderate phonetic similarity'
        } else if (bestSimilarity >= 0.55) {
            score = 30
            comment = 'Partial phonetic similarity'
        } else if (bestSimilarity >= 0.4) {
            score = 15
            comment = 'Weak phonetic similarity'
        } else {
            score = 0
            comment = 'No phonetic match'
        }
    }

    const threshold = matching.fusionScore ?? 0
    const isMatch = score >= threshold

    return makeScoreReport(matching, score, isMatch, comment)
}

export const scoreJaroWinkler = (
    accountAttribute: string,
    identityAttribute: string,
    matching: MatchingConfig
): ScoreReport => {
    const similarity = jaroWinkler.similarity(accountAttribute, identityAttribute)
    const score = Math.round(similarity * 100)

    const threshold = matching.fusionScore ?? 0
    const isMatch = score >= threshold

    return makeScoreReport(matching, score, isMatch)
}

export const scoreNameMatcher = (
    accountAttribute: string,
    identityAttribute: string,
    matching: MatchingConfig
): ScoreReport => {
    const similarity = nameMatch(accountAttribute, identityAttribute)
    // nameMatch returns a normalized score (0-1), convert to 0-100
    const score = Math.round(similarity * 100)

    const threshold = matching.fusionScore ?? 0
    const isMatch = score >= threshold

    return makeScoreReport(matching, score, isMatch)
}

/**
 * LIG3 (Levenshtein with Intelligent Gapping - v3) Algorithm
 *
 * An advanced string similarity algorithm optimized for identity matching that combines:
 * - Levenshtein distance for edit operations
 * - Intelligent gap penalties for missing/extra characters
 * - Token-based preprocessing for multi-word fields
 * - Case-insensitive comparison with accent normalization
 * - Positional weighting (prefix matches score higher)
 *
 * This algorithm is particularly effective for:
 * - Names with middle initials or missing components
 * - Fields with extra whitespace or formatting differences
 * - Strings with minor typos or transpositions
 * - Multi-word attributes where order matters but gaps are common
 */
export const scoreLIG3 = (
    accountAttribute: string,
    identityAttribute: string,
    matching: MatchingConfig
): ScoreReport => {
    const normalize = (str: string): string => {
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(DIACRITICS_RE, '') // Remove diacritics
            .trim()
            .replace(WHITESPACE_RE, ' ') // Normalize whitespace
    }

    const s1 = normalize(accountAttribute)
    const s2 = normalize(identityAttribute)

    if (s1.length === 0 && s2.length === 0) {
        const threshold = matching.fusionScore ?? 0
        return makeScoreReport(matching, 0, 0 >= threshold, 'Both values empty')
    }

    if (s1 === s2) {
        return makeScoreReport(matching, 100, true, 'Exact match')
    }

    if (s1.length === 0 || s2.length === 0) {
        return makeScoreReport(matching, 0, false, 'Empty string comparison')
    }

    const baseScore = calculateLIG3Similarity(s1, s2)
    const tokenBonus = calculateTokenBonus(s1, s2)
    const prefixBonus = calculatePrefixBonus(s1, s2)
    const rawScore = baseScore * 0.7 + tokenBonus * 0.2 + prefixBonus * 0.1
    const score = Math.round(Math.min(100, rawScore))

    const threshold = matching.fusionScore ?? 0
    const isMatch = score >= threshold

    let comment = ''
    if (score >= 95) {
        comment = 'Very high similarity'
    } else if (score >= 80) {
        comment = 'High similarity with minor differences'
    } else if (score >= 60) {
        comment = 'Moderate similarity detected'
    } else if (score >= 40) {
        comment = 'Low similarity, possible match'
    } else {
        comment = 'Low similarity'
    }

    return makeScoreReport(matching, score, isMatch, comment)
}

function calculateLIG3Similarity(s1: string, s2: string): number {
    const len1 = s1.length
    const len2 = s2.length
    const maxLen = Math.max(len1, len2)

    // Rolling 3-row approach: only rows i-2, i-1, and i are needed at any time.
    // Reduces allocation from O(len1 * len2) to O(3 * len2) per comparison.
    const cols = len2 + 1
    let prevPrev = new Float64Array(cols) // row i-2
    let prev = new Float64Array(cols) // row i-1
    let curr = new Float64Array(cols) // row i

    // Initialize row 0
    for (let j = 0; j <= len2; j++) prev[j] = j * 0.8

    for (let i = 1; i <= len1; i++) {
        curr[0] = i * 0.8
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
            const substitution = prev[j - 1] + cost
            const insertion = curr[j - 1] + 0.9
            const deletion = prev[j] + 0.9
            curr[j] = Math.min(substitution, insertion, deletion)

            if (i > 1 && j > 1 && s1[i - 1] === s2[j - 2] && s1[i - 2] === s2[j - 1]) {
                curr[j] = Math.min(curr[j], prevPrev[j - 2] + 0.5)
            }
        }
        // Rotate rows: prevPrev ← prev ← curr ← prevPrev (reuse allocation)
        const tmp = prevPrev
        prevPrev = prev
        prev = curr
        curr = tmp
    }

    const distance = prev[len2]
    const similarity = ((maxLen - distance) / maxLen) * 100
    return Math.max(0, similarity)
}

function calculateTokenBonus(s1: string, s2: string): number {
    // Whitespace is already normalized to single spaces by scoreLIG3.normalize() —
    // no empty tokens can result from splitting on ' '.
    const tokens1 = s1.split(' ')
    const tokens2 = s2.split(' ')

    if (tokens1.length <= 1 && tokens2.length <= 1) {
        return 0
    }

    let matchedTokens = 0
    const used = new Set<number>()
    for (const token1 of tokens1) {
        for (let j = 0; j < tokens2.length; j++) {
            if (!used.has(j)) {
                const token2 = tokens2[j]
                if (token1 === token2 || (token1.length > 2 && token2.startsWith(token1.substring(0, 2)))) {
                    matchedTokens++
                    used.add(j)
                    break
                }
            }
        }
    }
    const maxTokens = Math.max(tokens1.length, tokens2.length)
    return (matchedTokens / maxTokens) * 100
}

function calculatePrefixBonus(s1: string, s2: string): number {
    let commonPrefix = 0
    const minLen = Math.min(s1.length, s2.length)
    for (let i = 0; i < minLen; i++) {
        if (s1[i] === s2[i]) {
            commonPrefix++
        } else {
            break
        }
    }
    const prefixWeight = Math.min(commonPrefix, 5)
    return (prefixWeight / 5) * 100
}
