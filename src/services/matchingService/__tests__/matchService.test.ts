import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MatchingService, COMBINED_SCORE_ROW_ATTRIBUTE } from '../matchingService'
import { FusionAccount } from '../../../model/account'
import { MatchCandidateType } from '../types'
import { FusionConfig } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'

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

        it('stores no matches for non-matching accounts when captureBreakdown is false', async () => {
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )
            service.setCaptureBreakdown(false)

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

        it('stores match with full scores breakdown when fast path passes threshold', async () => {
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )
            service.setCaptureBreakdown(false)

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
            const mandatoryRule = { ...binaryRule, mandatory: true }
            const service = new MatchingService(
                { matchingConfigs: [mandatoryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )
            service.setCaptureBreakdown(false)

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

        it('uses fast path for identity sweep when captureBreakdown is false', async () => {
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )
            service.setCaptureBreakdown(false)
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

        it('skips fast path when captureBreakdown is true', async () => {
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )
            service.setCaptureBreakdown(true)
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

            expect(fastPathSpy).not.toHaveBeenCalled()
        })

        it('skips fast path for deferred candidates even when captureBreakdown is false', async () => {
            const service = new MatchingService(
                { matchingConfigs: [binaryRule], fusionManualReviewScore: 80 } as any,
                mockLog
            )
            service.setCaptureBreakdown(false)
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

            await service.scoreFusionAccount(managed, [identity], MatchCandidateType.Deferred)

            expect(fastPathSpy).not.toHaveBeenCalled()
        })
    })

    describe('getCandidates full-scan fallback', () => {
        const mandatoryRule = {
            attribute: 'email',
            algorithm: 'binary' as const,
            fusionScore: 100,
            mandatory: true,
        }

        it('increments fullScanFallbackCount when mandatory attributes are missing', () => {
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

            expect(service.getCandidates(managed, mockLog)).toBeUndefined()
            expect(run.fullScanFallbackCount).toBe(1)
        })

        it('does not increment fullScanFallbackCount when trigram index is not built', () => {
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
            expect(run.fullScanFallbackCount).toBe(0)
        })

        it('accumulates fullScanFallbackCount across multiple accounts', () => {
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

            expect(run.fullScanFallbackCount).toBe(2)
        })

        it('emits throttled warning log on first full-scan fallback', () => {
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
                'Full identity scan fallback #1: account has no value for any mandatory trigram attribute'
            )
        })
    })
})



