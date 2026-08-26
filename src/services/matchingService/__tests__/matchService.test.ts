import { describe, it, expect, beforeEach, vi } from 'vitest'
import { doubleMetaphone } from 'double-metaphone'
import { MatchingService, COMBINED_SCORE_ROW_ATTRIBUTE } from '../matchingService'
import { FusionAccount } from '../../../model/account'
import { MatchCandidateType } from '../types'
import { FusionConfig } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'
import * as scoringHelpers from '../scoringHelpers'
import { extractTrigrams } from '../trigramIndex'

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
            const service = new MatchingService({ matchingConfigs: rules, fusionManualReviewScore: 50 } as any, mockLog)

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
            const service = new MatchingService({ matchingConfigs: rules, fusionManualReviewScore: 80 } as any, mockLog)

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { department: 'Eng', displayName: 'ab', employeeId: 'E123' },
            } as any)
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                name: 'Jane Doe',
                attributes: {
                    email: 'jane@example.com',
                    department: 'Sales',
                    displayName: 'abcdefgh',
                    employeeId: 'E123',
                },
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
            expect(run.fullScanFallbackCount).toBe(1)
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

    describe('getCandidates full-scan fallback', () => {
        const jaroWinklerRule = {
            attribute: 'displayName',
            algorithm: 'jaro-winkler' as const,
            fusionScore: 80,
            mandatory: true,
        }

        const buildService = (run: FusionRun) =>
            new MatchingService(
                { matchingConfigs: [jaroWinklerRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )

        it('returns undefined and increments fullScanFallbackCount when the only mandatory rule is Jaro-Winkler', () => {
            const run = new FusionRun(mockLog)
            const service = buildService(run)
            service.buildTrigramIndex([
                FusionAccount.fromIdentity({ id: 'id-1', attributes: { displayName: 'Alice Smith' } } as any),
            ])

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { displayName: 'Alice Smith' },
            } as any)

            expect(service.getCandidates(managed, mockLog)).toBeUndefined()
            expect(run.fullScanFallbackCount).toBe(1)
            expect(run.mandatoryMissingBlockCount).toBe(0)
        })

        it('accumulates fullScanFallbackCount across multiple accounts', () => {
            const run = new FusionRun(mockLog)
            const service = buildService(run)
            service.buildTrigramIndex([
                FusionAccount.fromIdentity({ id: 'id-1', attributes: { displayName: 'Alice Smith' } } as any),
            ])

            const managed1 = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { displayName: 'Alice Smith' },
            } as any)
            const managed2 = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-2',
                attributes: { displayName: 'Bob Jones' },
            } as any)

            service.getCandidates(managed1, mockLog)
            service.getCandidates(managed2, mockLog)

            expect(run.fullScanFallbackCount).toBe(2)
        })
    })

    describe('algorithm-aware candidate blocking', () => {
        const binaryRule = {
            attribute: 'employeeId',
            algorithm: 'binary' as const,
            fusionScore: 100,
            mandatory: true,
        }
        const lig3Rule = {
            attribute: 'lastName',
            algorithm: 'lig3' as const,
            fusionScore: 80,
            mandatory: true,
        }
        const jaroWinklerRule = {
            attribute: 'displayName',
            algorithm: 'jaro-winkler' as const,
            fusionScore: 80,
            mandatory: true,
        }

        it('returns only the exact-value identity for a mandatory Binary rule', () => {
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const exactIdentity = FusionAccount.fromIdentity({
                id: 'id-exact',
                attributes: { employeeId: 'E123' },
            } as any)
            const otherIdentity = FusionAccount.fromIdentity({
                id: 'id-other',
                attributes: { employeeId: 'E999' },
            } as any)
            const prefixIdentity = FusionAccount.fromIdentity({
                id: 'id-prefix',
                attributes: { employeeId: 'E123X' },
            } as any)
            service.buildTrigramIndex([exactIdentity, otherIdentity, prefixIdentity])

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'E123' },
            } as any)

            const candidates = service.getCandidates(managed, mockLog)

            expect(candidates && [...candidates]).toEqual([exactIdentity])
            expect(run.fullScanFallbackCount).toBe(0)
        })

        it('excludes an identity whose length is outside the LIG3 length bound', () => {
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [lig3Rule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const withinBound = FusionAccount.fromIdentity({
                id: 'id-within',
                attributes: { lastName: 'Andersen' },
            } as any)
            const outsideBound = FusionAccount.fromIdentity({
                id: 'id-outside',
                attributes: { lastName: 'And' },
            } as any)
            service.buildTrigramIndex([withinBound, outsideBound])

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { lastName: 'Anderson' },
            } as any)

            const candidates = service.getCandidates(managed, mockLog)

            expect(candidates?.has(withinBound)).toBe(true)
            expect(candidates?.has(outsideBound)).toBe(false)
        })

        it('keeps a Jaro-Winkler near-miss with no shared padded trigram reachable', async () => {
            const accountValue = 'aqbrcs'
            const identityValue = 'qarbsc'
            const identityTrigrams = extractTrigrams(scoringHelpers.normalizeLIG3(identityValue))
            const sharedTrigrams = [...extractTrigrams(scoringHelpers.normalizeLIG3(accountValue))].filter((trigram) =>
                identityTrigrams.has(trigram)
            )
            expect(sharedTrigrams).toEqual([])

            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [jaroWinklerRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const nearMiss = FusionAccount.fromIdentity({
                id: 'id-near-miss',
                attributes: { displayName: identityValue },
            } as any)
            service.buildTrigramIndex([nearMiss])

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { displayName: accountValue },
            } as any)

            expect(service.getCandidates(managed, mockLog)).toBeUndefined()

            await service.scoreFusionAccount(managed, [nearMiss], MatchCandidateType.Identity)

            expect(managed.fusionMatchesRaw.map((match) => match.identityId)).toContain('id-near-miss')
        })

        it('uses Binary hits only when Binary and Jaro-Winkler mandatory rules are combined', () => {
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [binaryRule, jaroWinklerRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const binaryHitSimilarName = FusionAccount.fromIdentity({
                id: 'id-binary-similar',
                attributes: { employeeId: 'E123', displayName: 'Alice Smith' },
            } as any)
            const binaryHitUnrelatedName = FusionAccount.fromIdentity({
                id: 'id-binary-unrelated',
                attributes: { employeeId: 'E123', displayName: 'Zoltan Kovacs' },
            } as any)
            const otherEmployee = FusionAccount.fromIdentity({
                id: 'id-other-employee',
                attributes: { employeeId: 'E999', displayName: 'Alice Smith' },
            } as any)
            service.buildTrigramIndex([binaryHitSimilarName, binaryHitUnrelatedName, otherEmployee])

            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'E123', displayName: 'Alice Smith' },
            } as any)

            const candidates = service.getCandidates(managed, mockLog)

            expect(candidates?.size).toBe(2)
            expect(candidates?.has(binaryHitSimilarName)).toBe(true)
            expect(candidates?.has(binaryHitUnrelatedName)).toBe(true)
            expect(candidates?.has(otherEmployee)).toBe(false)
            expect(run.fullScanFallbackCount).toBe(0)
        })

        it('builds Binary and LIG3 blocking indexes on FusionRun and not on MatchingService', () => {
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [binaryRule, lig3Rule, jaroWinklerRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const identity = FusionAccount.fromIdentity({
                id: 'id-1',
                attributes: { employeeId: 'E123', lastName: 'Anderson', displayName: 'Alice Anderson' },
            } as any)

            service.buildTrigramIndex([identity])

            expect(run.trigramIndexBuilt).toBe(true)
            expect(run.binaryIndexByAttribute.has('employeeId')).toBe(true)
            expect(run.lig3LengthIndexByAttribute.has('lastName')).toBe(true)
            expect(run.binaryIndexByAttribute.has('displayName')).toBe(false)
            expect(run.lig3LengthIndexByAttribute.has('displayName')).toBe(false)
            expect(run.indexedMandatoryAttributes).toEqual(['employeeId', 'lastName'])
            expect(run.blockingIdentityRoster).toContain(identity)

            const serviceFields = Object.keys(service as unknown as Record<string, unknown>)
            expect(serviceFields.filter((field) => /index|roster|blocking/i.test(field))).toEqual([])
        })
    })

    describe('identityComparisonCount', () => {
        const binaryRule = {
            attribute: 'employeeId',
            algorithm: 'binary' as const,
            fusionScore: 100,
            mandatory: false,
        }

        it('accumulates identity-phase comparisons only and ignores deferred comparisons', async () => {
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog,
                run
            )
            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'E123' },
            } as any)
            const identities = ['id-1', 'id-2', 'id-3'].map((id) =>
                FusionAccount.fromIdentity({ id, attributes: { employeeId: id } } as any)
            )

            await service.scoreFusionAccount(managed, identities, MatchCandidateType.Identity)

            expect(run.identityComparisonCount).toBe(3)

            const deferredCandidate = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-2',
                attributes: { employeeId: 'E123' },
            } as any)
            const deferredComparisons = await service.scoreFusionAccount(
                managed,
                [deferredCandidate],
                MatchCandidateType.Deferred
            )

            expect(deferredComparisons).toBe(1)
            expect(run.identityComparisonCount).toBe(3)
        })
    })

    describe('identity-phase top-K retention', () => {
        // Rule weights sum to 100, so an identity's combined score equals the summed weight of the
        // rules it matches: 70 / 71 / 72 / 95 for the fixture identities below.
        const weightedRules = [
            { attribute: 'w70', algorithm: 'binary' as const, fusionScore: 70, mandatory: false },
            { attribute: 'w1a', algorithm: 'binary' as const, fusionScore: 1, mandatory: false },
            { attribute: 'w1b', algorithm: 'binary' as const, fusionScore: 1, mandatory: false },
            { attribute: 'w23', algorithm: 'binary' as const, fusionScore: 23, mandatory: false },
            { attribute: 'w5', algorithm: 'binary' as const, fusionScore: 5, mandatory: false },
        ]

        const attributesMatching = (matched: readonly string[]) =>
            Object.fromEntries(
                weightedRules.map((rule) => [rule.attribute, matched.includes(rule.attribute) ? 'same' : 'other'])
            )

        const managedAccountForWeightedRules = () =>
            FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: attributesMatching(weightedRules.map((rule) => rule.attribute)),
            } as any)

        /** Pool ordered weakest first: 70, 71, 72, then the strongest identity at 95. */
        const firstKTrapPool = () => [
            FusionAccount.fromIdentity({
                id: 'id-score-70',
                attributes: attributesMatching(['w70']),
            } as any),
            FusionAccount.fromIdentity({
                id: 'id-score-71',
                attributes: attributesMatching(['w70', 'w1a']),
            } as any),
            FusionAccount.fromIdentity({
                id: 'id-score-72',
                attributes: attributesMatching(['w70', 'w1a', 'w1b']),
            } as any),
            FusionAccount.fromIdentity({
                id: 'id-score-95',
                attributes: attributesMatching(['w70', 'w1a', 'w1b', 'w23']),
            } as any),
        ]

        const buildService = (run: FusionRun, maxCandidatesForForm: number) =>
            new MatchingService(
                {
                    matchingConfigs: weightedRules,
                    fusionManualReviewScore: 70,
                    fusionMaxCandidatesForForm: maxCandidatesForForm,
                } as any,
                mockLog,
                run
            )

        const combinedScoreOf = (match: { scores: { attribute: string; score: number }[] }) =>
            match.scores.find((score) => score.attribute === COMBINED_SCORE_ROW_ATTRIBUTE)?.score

        it('retains a stronger identity that appears after three weaker passers', async () => {
            const run = new FusionRun(mockLog)
            const service = buildService(run, 3)
            const managed = managedAccountForWeightedRules()

            const compared = await service.scoreFusionAccount(managed, firstKTrapPool(), MatchCandidateType.Identity, 3)

            expect(compared).toBe(4)
            expect(managed.fusionMatchesRaw.map((match) => match.identityId)).toEqual([
                'id-score-95',
                'id-score-72',
                'id-score-71',
            ])
            expect(managed.fusionMatchesRaw.map(combinedScoreOf)).toEqual([95, 72, 71])
        })

        it('applies maxIdentityMatches as top-K retention rather than a first-K stop', async () => {
            const run = new FusionRun(mockLog)
            const service = buildService(run, 3)
            const comparisonSpy = vi.spyOn(service as any, 'compareFusionAccounts')
            const managed = managedAccountForWeightedRules()

            await service.scoreFusionAccount(managed, firstKTrapPool(), MatchCandidateType.Identity, 3)

            expect(comparisonSpy).toHaveBeenCalledTimes(4)
            expect(run.identityComparisonCount).toBe(4)
            expect(managed.fusionMatchesRaw).toHaveLength(3)
            expect(managed.fusionMatchesRaw.map((match) => match.identityId)).not.toContain('id-score-70')
        })

        it('falls back to the configured candidate cap when maxIdentityMatches is not supplied', async () => {
            const run = new FusionRun(mockLog)
            const service = buildService(run, 2)
            const managed = managedAccountForWeightedRules()

            await service.scoreFusionAccount(managed, firstKTrapPool(), MatchCandidateType.Identity)

            expect(managed.fusionMatchesRaw.map((match) => match.identityId)).toEqual(['id-score-95', 'id-score-72'])
        })

        it('does not stop identity scoring at the first exact match', async () => {
            const exactRule = {
                attribute: 'employeeId',
                algorithm: 'binary' as const,
                fusionScore: 100,
                mandatory: false,
            }
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                {
                    matchingConfigs: [exactRule],
                    fusionManualReviewScore: 100,
                    fusionMaxCandidatesForForm: 3,
                } as any,
                mockLog,
                run
            )
            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'E123' },
            } as any)
            // First pool entry is exact; the later exact identity has the smaller identity id.
            const firstExact = FusionAccount.fromIdentity({
                id: 'id-exact-b',
                attributes: { employeeId: 'E123' },
            } as any)
            const laterExact = FusionAccount.fromIdentity({
                id: 'id-exact-a',
                attributes: { employeeId: 'E123' },
            } as any)

            const compared = await service.scoreFusionAccount(
                managed,
                [firstExact, laterExact],
                MatchCandidateType.Identity
            )

            expect(compared).toBe(2)
            expect(managed.fusionMatchesRaw.map((match) => match.identityId)).toEqual(['id-exact-a', 'id-exact-b'])
        })

        it('leaves deferred scoring uncapped', async () => {
            const deferredRule = {
                attribute: 'employeeId',
                algorithm: 'binary' as const,
                fusionScore: 100,
                mandatory: false,
            }
            const run = new FusionRun(mockLog)
            const service = new MatchingService(
                {
                    matchingConfigs: [deferredRule],
                    fusionManualReviewScore: 100,
                    fusionMaxCandidatesForForm: 1,
                } as any,
                mockLog,
                run
            )
            const managed = FusionAccount.fromManagedAccount({
                sourceId: 'src-1',
                nativeIdentity: 'acc-1',
                attributes: { employeeId: 'E123' },
            } as any)
            const deferredPool = ['acc-2', 'acc-3', 'acc-4', 'acc-5'].map((nativeIdentity) =>
                FusionAccount.fromManagedAccount({
                    sourceId: 'src-1',
                    nativeIdentity,
                    attributes: { employeeId: 'E123' },
                } as any)
            )

            const compared = await service.scoreFusionAccount(managed, deferredPool, MatchCandidateType.Deferred)

            expect(compared).toBe(4)
            expect(managed.fusionMatchesRaw).toHaveLength(4)
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
