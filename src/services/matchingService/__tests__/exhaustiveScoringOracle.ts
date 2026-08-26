import { FusionAccount } from '../../../model/account'
import { FusionConfig, MatchingConfig } from '../../../model/config'
import { LogService } from '../../logService'
import { COMBINED_SCORE_ROW_ATTRIBUTE, MatchingService } from '../matchingService'
import { MatchCandidateType } from '../types'

/**
 * Test-only exhaustive-scoring oracle.
 *
 * Not part of the MatchingService production API: nothing under `src/` outside `__tests__` may import it.
 * The oracle scores a managed account against every fixture identity with candidate blocking disabled and
 * the identity retention cap effectively disabled, then ranks the results itself. It exists to prove that
 * algorithm-aware blocking plus top-K retention lose no identity that exhaustive scoring would have kept.
 */

/** Module id used by the oracle test to prove no production file imports this helper. */
export const EXHAUSTIVE_ORACLE_MODULE_ID = 'exhaustiveScoringOracle'

/**
 * Fixtures stay small on purpose. Exhaustive scoring is O(identities) per managed account, so the oracle
 * refuses anything approaching a production baseline.
 */
export const ORACLE_MAX_FIXTURE_IDENTITIES = 100

/** One ranked oracle result: the identity id and its combined match score. */
export interface OracleRanking {
    identityId: string
    combinedScore: number
}

/** Minimal scoring configuration the oracle needs; mirrors the fields MatchingService reads. */
export interface OracleScoringConfig {
    matchingConfigs: MatchingConfig[]
    fusionManualReviewScore: number
}

/**
 * Review-form candidate order, re-implemented here so the oracle ranks independently of
 * `compareMatchesForForm`: higher combined score first, then ascending identity id.
 */
function compareOracleRankings(a: OracleRanking, b: OracleRanking): number {
    const delta = b.combinedScore - a.combinedScore
    if (delta !== 0) return delta
    return a.identityId.localeCompare(b.identityId)
}

/**
 * Score `identities` exhaustively and return the independently ranked top `k`.
 *
 * Blocking is disabled by constructing MatchingService without a FusionRun (so `getCandidates` cannot
 * filter) and by scoring every identity explicitly. Retention is disabled by passing an infinite cap and
 * scoring each identity against its own copy of the managed account.
 *
 * @param scoringConfig - Matching rules and manual-review threshold
 * @param log - Logger passed through to MatchingService
 * @param identities - The complete fixture identity set to score
 * @param makeManagedAccount - Factory returning a fresh copy of the managed account under test
 * @param k - How many ranked results to return
 */
export async function exhaustiveTopKOracle(
    scoringConfig: OracleScoringConfig,
    log: LogService,
    identities: readonly FusionAccount[],
    makeManagedAccount: () => FusionAccount,
    k: number
): Promise<OracleRanking[]> {
    if (identities.length > ORACLE_MAX_FIXTURE_IDENTITIES) {
        throw new Error(
            `Exhaustive oracle refused ${identities.length} identities; fixtures must stay under ${ORACLE_MAX_FIXTURE_IDENTITIES}`
        )
    }

    const service = new MatchingService(scoringConfig as unknown as FusionConfig, log)
    if (service.getCandidates(makeManagedAccount(), log) !== undefined) {
        throw new Error('Exhaustive oracle requires candidate blocking to be disabled')
    }

    const scored: OracleRanking[] = []
    for (const identity of identities) {
        const account = makeManagedAccount()
        await service.scoreFusionAccount(account, [identity], MatchCandidateType.Identity, Number.POSITIVE_INFINITY)
        for (const match of account.fusionMatchesRaw) {
            const combined = match.scores.find((row) => row.attribute === COMBINED_SCORE_ROW_ATTRIBUTE)
            scored.push({ identityId: match.identityId, combinedScore: combined?.score ?? 0 })
        }
    }

    return scored.sort(compareOracleRankings).slice(0, k)
}
