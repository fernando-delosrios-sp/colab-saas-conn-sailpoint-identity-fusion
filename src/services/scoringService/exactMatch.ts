/** Algorithms on synthetic aggregate rows (not real attribute rules). */
const SYNTHETIC_MATCH_SCORE_ALGORITHMS = new Set(['average', 'weighted-mean'])

export type ExactMatchScoreRow = {
    algorithm?: string
    score: number
    skipped?: boolean
}

/**
 * True when every configured rule was evaluated (none skipped) and scored 100.
 * Excludes synthetic combined rows (`weighted-mean` / legacy `average`).
 */
export function isExactAttributeMatchScores(scores: ReadonlyArray<ExactMatchScoreRow> | undefined): boolean {
    if (!scores || scores.length === 0) {
        return false
    }
    const ruleScores = scores.filter((s) => !SYNTHETIC_MATCH_SCORE_ALGORITHMS.has(String(s.algorithm ?? '')))

    return ruleScores.length > 0 && ruleScores.every((s) => !s.skipped && s.score === 100)
}
