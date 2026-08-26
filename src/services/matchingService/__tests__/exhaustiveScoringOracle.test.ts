import { describe, it, expect, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMBINED_SCORE_ROW_ATTRIBUTE, MatchingService } from '../matchingService'
import * as matchingServiceModule from '../matchingService'
import * as matchingServiceBarrel from '../index'
import { FusionAccount } from '../../../model/account'
import { FusionConfig } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'
import { FusionMatch, MatchCandidateType } from '../types'
import { extractTrigrams } from '../trigramIndex'
import { normalizeLIG3 } from '../scoringHelpers'
import {
    EXHAUSTIVE_ORACLE_MODULE_ID,
    ORACLE_MAX_FIXTURE_IDENTITIES,
    OracleRanking,
    exhaustiveTopKOracle,
} from './exhaustiveScoringOracle'

const mockLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any

const TOP_K = 3

const combinedScoreOf = (match: FusionMatch): number =>
    match.scores.find((row) => row.attribute === COMBINED_SCORE_ROW_ATTRIBUTE)?.score ?? 0

const rankingsOf = (account: FusionAccount): OracleRanking[] =>
    account.fusionMatchesRaw.map((match) => ({
        identityId: match.identityId,
        combinedScore: combinedScoreOf(match),
    }))

/**
 * Full-scan fixture. The mandatory Jaro-Winkler rule has no recall-safe blocker, so production
 * scores the whole baseline; the two Binary rules only shift combined scores.
 * Weights sum to 100, so combined score is `0.8 * jaroWinkler + 10 * tierA + 10 * tierB`.
 */
const fullScanRules = [
    { attribute: 'displayName', algorithm: 'jaro-winkler' as const, fusionScore: 80, mandatory: true },
    { attribute: 'tierA', algorithm: 'binary' as const, fusionScore: 10, mandatory: false },
    { attribute: 'tierB', algorithm: 'binary' as const, fusionScore: 10, mandatory: false },
]

const ACCOUNT_DISPLAY_NAME = 'aqbrcs'
/** Scores 83 against the account value while sharing no padded trigram with it. */
const NEAR_MISS_DISPLAY_NAME = 'qarbsc'

const fullScanConfig = {
    matchingConfigs: fullScanRules,
    fusionManualReviewScore: 75,
    fusionMaxCandidatesForForm: TOP_K,
}

const makeFullScanAccount = () =>
    FusionAccount.fromManagedAccount({
        sourceId: 'src-1',
        nativeIdentity: 'acc-1',
        attributes: { displayName: ACCOUNT_DISPLAY_NAME, tierA: 'T1', tierB: 'T2' },
    } as any)

/**
 * Ordered weakest first so a first-K stop would retain 80/90/86.4 and never compare the perfect
 * match at the end of the pool.
 */
const fullScanIdentities = () => [
    FusionAccount.fromIdentity({
        id: 'id-a-weak-80',
        attributes: { displayName: ACCOUNT_DISPLAY_NAME, tierA: 'other', tierB: 'other' },
    } as any),
    FusionAccount.fromIdentity({
        id: 'id-a-weak-90',
        attributes: { displayName: ACCOUNT_DISPLAY_NAME, tierA: 'T1', tierB: 'other' },
    } as any),
    FusionAccount.fromIdentity({
        id: 'id-a-jw-near-miss',
        attributes: { displayName: NEAR_MISS_DISPLAY_NAME, tierA: 'T1', tierB: 'T2' },
    } as any),
    FusionAccount.fromIdentity({
        id: 'id-a-mandatory-fail',
        attributes: { displayName: 'zzzzzz', tierA: 'T1', tierB: 'T2' },
    } as any),
    FusionAccount.fromIdentity({
        id: 'id-a-strong-100',
        attributes: { displayName: ACCOUNT_DISPLAY_NAME, tierA: 'T1', tierB: 'T2' },
    } as any),
]

/** Binary blocking fixture: exactly one identity carries the account's employeeId. */
const binaryBlockingRules = [
    { attribute: 'employeeId', algorithm: 'binary' as const, fusionScore: 100, mandatory: true },
    { attribute: 'department', algorithm: 'binary' as const, fusionScore: 100, mandatory: false },
]

const binaryBlockingConfig = {
    matchingConfigs: binaryBlockingRules,
    fusionManualReviewScore: 50,
    fusionMaxCandidatesForForm: TOP_K,
}

const makeBinaryBlockingAccount = () =>
    FusionAccount.fromManagedAccount({
        sourceId: 'src-1',
        nativeIdentity: 'acc-2',
        attributes: { employeeId: 'E123', department: 'HR' },
    } as any)

const binaryBlockingIdentities = () => [
    FusionAccount.fromIdentity({ id: 'id-b-exact', attributes: { employeeId: 'E123', department: 'HR' } } as any),
    FusionAccount.fromIdentity({ id: 'id-b-other-200', attributes: { employeeId: 'E200', department: 'HR' } } as any),
    FusionAccount.fromIdentity({ id: 'id-b-other-300', attributes: { employeeId: 'E300', department: 'IT' } } as any),
    FusionAccount.fromIdentity({ id: 'id-b-other-400', attributes: { employeeId: 'E400', department: 'HR' } } as any),
]

describe('exhaustive-scoring oracle', () => {
    beforeEach(() => {
        FusionAccount.configure({ sources: [] } as unknown as FusionConfig)
    })

    describe('oracle and production top-K match on a planted fixture', () => {
        it('plants a Jaro-Winkler pair that meets the mandatory threshold with no shared padded trigram', async () => {
            const nearMissTrigrams = extractTrigrams(normalizeLIG3(NEAR_MISS_DISPLAY_NAME))
            const shared = [...extractTrigrams(normalizeLIG3(ACCOUNT_DISPLAY_NAME))].filter((trigram) =>
                nearMissTrigrams.has(trigram)
            )
            expect(shared).toEqual([])

            const jaroWinklerOnly = new MatchingService(
                { matchingConfigs: [fullScanRules[0]], fusionManualReviewScore: 80 } as unknown as FusionConfig,
                mockLog
            )
            const nearMiss = FusionAccount.fromIdentity({
                id: 'id-a-jw-near-miss',
                attributes: { displayName: NEAR_MISS_DISPLAY_NAME },
            } as any)
            const managed = makeFullScanAccount()

            await jaroWinklerOnly.scoreFusionAccount(managed, [nearMiss], MatchCandidateType.Identity)

            expect(rankingsOf(managed)).toEqual([{ identityId: 'id-a-jw-near-miss', combinedScore: 83 }])
        })

        it('retains the same identity ids and combined scores as the oracle when production full-scans', async () => {
            const identities = fullScanIdentities()
            const run = new FusionRun(mockLog)
            const service = new MatchingService(fullScanConfig as unknown as FusionConfig, mockLog, run)
            service.buildTrigramIndex(identities)

            const managed = makeFullScanAccount()
            const candidates = service.getCandidates(managed, mockLog)
            expect(candidates).toBeUndefined()

            const compared = await service.scoreFusionAccount(
                managed,
                candidates ?? identities,
                MatchCandidateType.Identity,
                TOP_K
            )

            const oracle = await exhaustiveTopKOracle(fullScanConfig, mockLog, identities, makeFullScanAccount, TOP_K)

            expect(compared).toBe(identities.length)
            expect(rankingsOf(managed)).toEqual(oracle)
            expect(oracle).toEqual([
                { identityId: 'id-a-strong-100', combinedScore: 100 },
                { identityId: 'id-a-weak-90', combinedScore: 90 },
                { identityId: 'id-a-jw-near-miss', combinedScore: 86.4 },
            ])
        })

        it('keeps the Jaro-Winkler near-miss in top-K and drops the weakest early passer', async () => {
            const identities = fullScanIdentities()
            const run = new FusionRun(mockLog)
            const service = new MatchingService(fullScanConfig as unknown as FusionConfig, mockLog, run)
            service.buildTrigramIndex(identities)

            const managed = makeFullScanAccount()
            await service.scoreFusionAccount(managed, identities, MatchCandidateType.Identity, TOP_K)

            const retainedIds = managed.fusionMatchesRaw.map((match) => match.identityId)
            expect(retainedIds).toContain('id-a-jw-near-miss')
            expect(retainedIds).toContain('id-a-strong-100')
            expect(retainedIds).not.toContain('id-a-weak-80')
            expect(retainedIds).not.toContain('id-a-mandatory-fail')
        })

        it('matches the oracle while Binary blocking yields a single comparison', async () => {
            const identities = binaryBlockingIdentities()
            const run = new FusionRun(mockLog)
            const service = new MatchingService(binaryBlockingConfig as unknown as FusionConfig, mockLog, run)
            service.buildTrigramIndex(identities)

            const managed = makeBinaryBlockingAccount()
            const candidates = service.getCandidates(managed, mockLog)
            expect(candidates?.size).toBe(1)

            const compared = await service.scoreFusionAccount(
                managed,
                candidates ?? identities,
                MatchCandidateType.Identity,
                TOP_K
            )

            const oracle = await exhaustiveTopKOracle(
                binaryBlockingConfig,
                mockLog,
                identities,
                makeBinaryBlockingAccount,
                TOP_K
            )

            expect(compared).toBe(1)
            expect(run.identityComparisonCount).toBe(1)
            expect(rankingsOf(managed)).toEqual(oracle)
            expect(oracle).toEqual([{ identityId: 'id-b-exact', combinedScore: 100 }])
        })

        it('keeps both planted fixtures small', () => {
            expect(fullScanIdentities().length + binaryBlockingIdentities().length).toBeLessThan(
                ORACLE_MAX_FIXTURE_IDENTITIES
            )
        })

        it('refuses to exhaustive-score a baseline larger than the fixture bound', async () => {
            const oversized = Array.from(
                { length: ORACLE_MAX_FIXTURE_IDENTITIES + 1 },
                () => ({}) as unknown as FusionAccount
            )

            await expect(
                exhaustiveTopKOracle(fullScanConfig, mockLog, oversized, makeFullScanAccount, TOP_K)
            ).rejects.toThrow(/fixtures must stay under/)
        })
    })

    describe('oracle is not a production API', () => {
        it('exposes no oracle entry point on MatchingService or its exports', () => {
            const service = new MatchingService(fullScanConfig as unknown as FusionConfig, mockLog)
            const surfaceNames = [
                ...Object.getOwnPropertyNames(MatchingService.prototype),
                ...Object.getOwnPropertyNames(MatchingService),
                ...Object.keys(service as unknown as Record<string, unknown>),
                ...Object.keys(matchingServiceModule),
                ...Object.keys(matchingServiceBarrel),
            ]

            expect(surfaceNames.filter((name) => /oracle|exhaustive/i.test(name))).toEqual([])
            expect((service as unknown as Record<string, unknown>).exhaustiveTopKOracle).toBeUndefined()
        })

        it('is not imported by any source file outside __tests__', () => {
            const productionFiles = collectProductionSourceFiles(join(process.cwd(), 'src'))

            const importers = productionFiles.filter((file) =>
                readFileSync(file, 'utf8').includes(EXHAUSTIVE_ORACLE_MODULE_ID)
            )

            expect(productionFiles.length).toBeGreaterThan(0)
            expect(importers).toEqual([])
        })
    })
})

/** TypeScript sources under `src/`, excluding every `__tests__` directory. */
function collectProductionSourceFiles(directory: string, accumulator: string[] = []): string[] {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === '__tests__') continue
        const fullPath = join(directory, entry.name)
        if (entry.isDirectory()) {
            collectProductionSourceFiles(fullPath, accumulator)
        } else if (entry.name.endsWith('.ts')) {
            accumulator.push(fullPath)
        }
    }
    return accumulator
}
