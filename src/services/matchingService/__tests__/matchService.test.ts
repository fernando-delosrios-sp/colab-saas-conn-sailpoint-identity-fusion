import { describe, it, expect, beforeEach, vi } from 'vitest'
import { doubleMetaphone } from 'double-metaphone'
import { MatchingService, COMBINED_SCORE_ROW_ATTRIBUTE } from '../matchingService'
import { FusionAccount } from '../../../model/account'
import { MatchCandidateType } from '../types'
import { FusionConfig } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'
import * as scoringHelpers from '../scoringHelpers'

vi.mock('double-metaphone', async (importOriginal) => {
    const actual = await importOriginal<typeof import('double-metaphone')>()
    return {
        ...actual,
        doubleMetaphone: vi.fn((value: string) => actual.doubleMetaphone(value)),
    }
})

describe('MatchingService', () => {
    const mockLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any
    const config = { matchingConfigs: [], fusionManualReviewScore: 0 } as any

    beforeEach(() => {
        FusionAccount.configure({ sources: [] } as unknown as FusionConfig)
    })

    it('is instantiable', () => {
        const service = new MatchingService(config, mockLog)
        expect(service).toBeDefined()
    })

    it('returns 0 comparisons when no matching configs', async () => {
        const service = new MatchingService(config, mockLog)
        const fusionAccount = {} as any
        const identities: any[] = []
        const result = await service.scoreFusionAccount(fusionAccount, identities)
        expect(result).toBe(0)
    })

    describe('compareFusionAccounts fast path', () => {
        const binaryRule = {
            attribute: 'employeeId',
            algorithm: 'binary' as const,
            fusionScore: 100,
            mandatory: false,
        }

        it('stores no matches for non-matching identity comparisons', async () => {
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'A' },
            } as any)
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { employeeId: 'B' },
            } as any)

            await service.scoreFusionAccount(managed, [identity])

            expect(managed.fusionMatchesRaw).toHaveLength(0)
        })

        it('allocates no per-rule ScoreReport on a failed identity comparison', async () => {
            const reportSpy = vi.spyOn(scoringHelpers, 'makeScoreReport')
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'A' },
            } as any)
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { employeeId: 'B' },
            } as any)

            await service.scoreFusionAccount(managed, [identity], MatchCandidateType.Identity)

            expect(managed.fusionMatchesRaw).toHaveLength(0)
            expect(reportSpy).not.toHaveBeenCalled()
            reportSpy.mockRestore()
        })

        it('stores match with full scores breakdown when fast path passes threshold', async () => {
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'E123' },
            } as any)
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                name: 'Jane Doe',
                attributes: { employeeId: 'E123' },
            } as any)

            await service.scoreFusionAccount(managed, [identity])

            expect(managed.fusionMatchesRaw).toHaveLength(1)
            const match = managed.fusionMatchesRaw[0]
            expect(match.candidateType).toBe(MatchCandidateType.Identity)
            expect(match.scores.length).toBeGreaterThan(0)
            expect(match.scores.some((row) => row.attribute === COMBINED_SCORE_ROW_ATTRIBUTE)).toBe(true)
        })

        it('stores no matches when a mandatory rule fails on the fast path', async () => {
            const reportSpy = vi.spyOn(scoringHelpers, 'makeScoreReport')
            const mandatoryRule = { ...binaryRule, mandatory: true }
            const service = new MatchingService(
                { matchingConfigs: [mandatoryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'A' },
            } as any)
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { employeeId: 'B' },
            } as any)

            await service.scoreFusionAccount(managed, [identity], MatchCandidateType.Identity)

            expect(managed.fusionMatchesRaw).toHaveLength(0)
            expect(reportSpy).not.toHaveBeenCalled()
            reportSpy.mockRestore()
        })

        it('uses numeric fast path for identity sweep', async () => {
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )
            const fastPathSpy = vi.spyOn(service as any, 'evaluateCombinedScorePass')

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'A' },
            } as any)
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { employeeId: 'B' },
            } as any)

            await service.scoreFusionAccount(managed, [identity], MatchCandidateType.Identity)

            expect(fastPathSpy).toHaveBeenCalledTimes(1)
        })

        it('skips fast path for deferred candidates', async () => {
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )
            const fastPathSpy = vi.spyOn(service as any, 'evaluateCombinedScorePass')
            const scoreReportSpy = vi.spyOn(scoringHelpers, 'scoreBinary')

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'A' },
            } as any)
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { employeeId: 'B' },
            } as any)

            await service.scoreFusionAccount(managed, [identity], MatchCandidateType.Deferred)

            expect(fastPathSpy).not.toHaveBeenCalled()
            expect(managed.fusionMatchesRaw).toHaveLength(0)
            expect(scoreReportSpy).toHaveBeenCalled()
            scoreReportSpy.mockRestore()
        })

        it('invokes each configured scorer once on a passing identity comparison', async () => {
            const binarySpy = vi.spyOn(scoringHelpers, 'scoreBinaryNumeric')
            const lig3Spy = vi.spyOn(scoringHelpers, 'scoreLIG3NormalizedNumeric')
            const rules = [
                { attribute: 'employeeId', algorithm: 'binary' as const, fusionScore: 100, mandatory: false },
                {
                    attribute: 'displayName',
                    algorithm: 'lig3' as const,
                    fusionScore: 50,
                    mandatory: false,
                },
            ]
            const service = new MatchingService(
                { matchingConfigs: rules, fusionManualReviewScore: 50 } as any,
                mockLog
            )

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'E123', displayName: 'Jane Doe' },
            } as any)
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                name: 'Jane Doe',
                attributes: { employeeId: 'E123', displayName: 'Jane Doe' },
            } as any)

            await service.scoreFusionAccount(managed, [identity], MatchCandidateType.Identity)

            expect(managed.fusionMatchesRaw).toHaveLength(1)
            expect(binarySpy).toHaveBeenCalledTimes(1)
            expect(lig3Spy).toHaveBeenCalledTimes(1)
            binarySpy.mockRestore()
            lig3Spy.mockRestore()
        })

        it('reconstructs golden scores for missing-value, below-threshold, and LIG3 upper-bound skips', async () => {
            const rules = [
                { attribute: 'email', algorithm: 'binary' as const, fusionScore: 80, mandatory: false },
                {
                    attribute: 'department',
                    algorithm: 'binary' as const,
                    fusionScore: 100,
                    mandatory: false,
                    skipMatchIfThresholdNotMet: true,
                },
                { attribute: 'displayName', algorithm: 'lig3' as const, fusionScore: 80, mandatory: false },
                { attribute: 'employeeId', algorithm: 'binary' as const, fusionScore: 100, mandatory: false },
            ]
            const service = new MatchingService(
                { matchingConfigs: rules, fusionManualReviewScore: 80 } as any,
                mockLog
            )

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { department: 'Eng', displayName: 'ab', employeeId: 'E123' },
            } as any)
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                name: 'Jane Doe',
                attributes: { email: 'jane@example.com', department: 'Sales', displayName: 'abcdefgh', employeeId: 'E123' },
            } as any)

            await service.scoreFusionAccount(managed, [identity], MatchCandidateType.Identity)

            expect(managed.fusionMatchesRaw).toHaveLength(1)
            expect(managed.fusionMatchesRaw[0].scores).toEqual([
                {
                    attribute: 'email',
                    algorithm: 'binary',
                    fusionScore: 80,
                    mandatory: false,
                    skipMatchIfMissing: undefined,
                    skipMatchIfThresholdNotMet: undefined,
                    score: 0,
                    isMatch: false,
                    skipped: true,
                    comment: 'Rule skipped (missing value on one or both sides)',
                },
                {
                    attribute: 'department',
                    algorithm: 'binary',
                    fusionScore: 100,
                    mandatory: false,
                    skipMatchIfMissing: undefined,
                    skipMatchIfThresholdNotMet: true,
                    score: 0,
                    isMatch: false,
                    skipped: true,
                    comment: 'Rule skipped (score below threshold)',
                },
                {
                    attribute: 'displayName',
                    algorithm: 'lig3',
                    fusionScore: 80,
                    mandatory: false,
                    skipMatchIfMissing: undefined,
                    skipMatchIfThresholdNotMet: undefined,
                    score: 0,
                    isMatch: false,
                    skipped: true,
                    comment: 'Length ratio upper bound below threshold',
                },
                {
                    attribute: 'employeeId',
                    algorithm: 'binary',
                    fusionScore: 100,
                    mandatory: false,
                    skipMatchIfMissing: undefined,
                    skipMatchIfThresholdNotMet: undefined,
                    score: 100,
                    isMatch: true,
                    weightedScore: 100,
                },
                {
                    attribute: COMBINED_SCORE_ROW_ATTRIBUTE,
                    algorithm: 'weighted-mean',
                    fusionScore: 80,
                    mandatory: true,
                    score: 100,
                    isMatch: true,
                    comment: 'Combined score meets minimum threshold',
                },
            ])
        })
    })

    describe('buildTrigramIndex index guard', () => {
        it('does not index a threshold-zero mandatory attribute and keeps identities reachable via other rules', () => {
            const zeroScoreEmail = {
                attribute: 'email',
                algorithm: 'binary' as const,
                fusionScore: 0,
                mandatory: true,
            }
            const employeeIdRule = {
                attribute: 'employeeId',
                algorithm: 'binary' as const,
                fusionScore: 100,
                mandatory: true,
            }
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [zeroScoreEmail, employeeIdRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const identityWithoutEmail = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { employeeId: 'E123' },
            } as any)
            service.buildTrigramIndex([identityWithoutEmail])

            expect(run.indexedMandatoryAttributes).toEqual(['employeeId'])
            expect(run.indexedMandatoryAttributes).not.toContain('email')

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'E123' },
            } as any)
            const candidates = service.getCandidates(managed, mockLog)

            expect(candidates).toBeDefined()
            expect(candidates?.has(identityWithoutEmail)).toBe(true)
        })
    })

    describe('getCandidates mandatory-missing block', () => {
        const mandatoryRule = {
            attribute: 'email',
            algorithm: 'binary' as const,
            fusionScore: 100,
            mandatory: true,
        }

        it('returns an empty set and increments mandatoryMissingBlockCount when indexed mandatory attributes are missing', () => {
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [mandatoryRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { email: 'foo@example.com' },
            } as any)
            service.buildTrigramIndex([identity])

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: {},
            } as any)

            const candidates = service.getCandidates(managed, mockLog)
            expect(candidates).toBeInstanceOf(Set)
            expect(candidates?.size).toBe(0)
            expect(run.mandatoryMissingBlockCount).toBe(1)
            expect(run.fullScanFallbackCount).toBe(0)
        })

        it('does not increment mandatoryMissingBlockCount when trigram index is not built', () => {
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [mandatoryRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: {},
            } as any)

            expect(service.getCandidates(managed, mockLog)).toBeUndefined()
            expect(run.mandatoryMissingBlockCount).toBe(0)
            expect(run.fullScanFallbackCount).toBe(0)
        })

        it('accumulates mandatoryMissingBlockCount across multiple accounts', () => {
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [mandatoryRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { email: 'foo@example.com' },
            } as any)
            service.buildTrigramIndex([identity])

            const managed1 = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: {},
            } as any)
            const managed2 = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-2',
                attributes: {},
            } as any)

            service.getCandidates(managed1, mockLog)
            service.getCandidates(managed2, mockLog)

            expect(run.mandatoryMissingBlockCount).toBe(2)
            expect(run.fullScanFallbackCount).toBe(0)
        })

        it('emits throttled warning log on first mandatory-missing block', () => {
            const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
            const run = new FusionRun(log)
            const service = new MatchingService(
                { matchingConfigs: [mandatoryRule], fusionManualReviewScore: 80 } as any,
                log,
                run
            )
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { email: 'foo@example.com' },
            } as any)
            service.buildTrigramIndex([identity])

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: {},
            } as any)

            service.getCandidates(managed, log)

            expect(log.warn).toHaveBeenCalledWith(
                'Mandatory missing block #1: account has no value for any indexed mandatory attribute — zero identity candidates'
            )
            expect(log.warn).not.toHaveBeenCalledWith(expect.stringContaining('Full identity scan fallback'))
        })

        it('performs zero identity comparisons when getCandidates returns an empty set', async () => {
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [mandatoryRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { email: 'foo@example.com' },
            } as any)
            service.buildTrigramIndex([identity])

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: {},
            } as any)
            const candidates = service.getCandidates(managed, mockLog)

            const comparisons = await service.scoreFusionAccount(managed, candidates ?? [])
            expect(comparisons).toBe(0)
        })
    })

    describe('name-matcher FusionRun caches', () => {
        const nameRule = {
            attribute: 'displayName',
            algorithm: 'name-matcher' as const,
            fusionScore: 50,
            mandatory: false,
        }

        const nameMatcherConfig = { matchingConfigs: [nameRule], fusionManualReviewScore: 0 } as any

        it('invokes doubleMetaphone once per distinct token when scoring two identities with the same first name', async () => {
            vi.mocked(doubleMetaphone).mockClear()
            const run = new FusionRun(mockLog)
            const service = new MatchingService(nameMatcherConfig, mockLog, run)

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { displayName: 'Alice Smith' },
            } as any)
            const identity1 = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { displayName: 'Alice Jones' },
            } as any)
            const identity2 = FusionAccount.fromIdentity({
                id: 'id-2',
                attributes: { displayName: 'Alice Brown' },
            } as any)

            await service.scoreFusionAccount(managed, [identity1, identity2])

            const distinctTokens = new Set(['alice', 'smith', 'jones', 'brown'])
            expect(doubleMetaphone).toHaveBeenCalledTimes(distinctTokens.size)
            expect(run.nameMatcherTokenCache.size).toBe(3)
            expect(run.nameMatcherTokenCache.get('alice smith')).toEqual(['alice', 'smith'])
            expect(run.nameMatcherTokenCache.get('alice jones')).toEqual(['alice', 'jones'])
            expect(run.nameMatcherTokenCache.get('alice brown')).toEqual(['alice', 'brown'])

            await service.scoreFusionAccount(managed, [identity1, identity2])
            expect(run.nameMatcherTokenCache.size).toBe(3)
            expect(doubleMetaphone).toHaveBeenCalledTimes(distinctTokens.size)
        })

        it('multi-identity sweep with name-matcher rule produces same scores as before caching', async () => {
            const cachedRun = new FusionRun(mockLog)
            const cachedService = new MatchingService(nameMatcherConfig, mockLog, cachedRun)
            const uncachedService = new MatchingService(nameMatcherConfig, mockLog)

            const managedAttrs = { displayName: 'Alice Smith' }
            const identitySpecs = [
                { id: 'id-1', attributes: { displayName: 'Alice Jones' } },
                { id: 'id-2', attributes: { displayName: 'Alice Brown' } },
                { id: 'id-3', attributes: { displayName: 'Alice Smith' } },
            ]

            const cachedManaged = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { ...managedAttrs },
            } as any)
            const uncachedManaged = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { ...managedAttrs },
            } as any)

            const cachedIdentities = identitySpecs.map((spec) => FusionAccount.fromIdentity(spec as any))
            const uncachedIdentities = identitySpecs.map((spec) => FusionAccount.fromIdentity(spec as any))

            await cachedService.scoreFusionAccount(cachedManaged, cachedIdentities)
            await uncachedService.scoreFusionAccount(uncachedManaged, uncachedIdentities)

            const cachedScores = cachedManaged.fusionMatchesRaw.map((m) => ({
                id: m.identityId,
                scores: m.scores.map((s) => ({ attribute: s.attribute, score: s.score })),
            }))
            const uncachedScores = uncachedManaged.fusionMatchesRaw.map((m) => ({
                id: m.identityId,
                scores: m.scores.map((s) => ({ attribute: s.attribute, score: s.score })),
            }))
            expect(cachedScores).toEqual(uncachedScores)
        })
    })
})



