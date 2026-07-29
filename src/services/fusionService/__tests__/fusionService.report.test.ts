import { createFusionServiceTestContext, seedRunInventory, type FusionServiceTestContext } from './fusionService.testFixtures'
import { FusionAccount } from '../../../model/account'
import { AggregationTracker } from '../aggregationTracker'
import { FusionRun } from '../../../model/fusionRun'
import { FusionService } from '../fusionService'
import { StandardCommand } from '@sailpoint/connector-sdk'

describe('FusionService — report', () => {
    let ctx: FusionServiceTestContext

    beforeEach(() => {
        ctx = createFusionServiceTestContext()
    })

    describe('identity conflict warnings', () => {
        it('logs warning and includes identity conflict details in report', () => {
            const tracker = new AggregationTracker()
            ctx.fusionService.setTracker(tracker)
            const accountA = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-a',
                identityId: 'identity-duplicate',
                name: 'Fusion Account A',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)
            const accountB = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-b',
                identityId: 'identity-duplicate',
                name: 'Fusion Account B',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)

            ctx.fusionService.setFusionAccount(accountA)
            ctx.fusionService.setFusionAccount(accountB)

            expect(ctx.mockLog.warn).toHaveBeenCalledWith(
                expect.stringContaining('More than one Fusion account was found for identity identity-duplicate')
            )

            const report = ctx.fusionService.generateReport(tracker)
            const conflictWarnings = report.warnings?.identityConflicts

            expect(conflictWarnings?.affectedIdentities).toBe(1)
            expect(conflictWarnings?.occurrences).toHaveLength(1)
            expect(conflictWarnings?.occurrences[0].identityId).toBe('identity-duplicate')
            expect(conflictWarnings?.occurrences[0].accountCount).toBe(2)
            expect(conflictWarnings?.occurrences[0].managedKeys).toEqual([`fusion-a`, `fusion-b`])
        })

        it('does not warn when the same correlated account key is updated', () => {
            const tracker = new AggregationTracker()
            ctx.fusionService.setTracker(tracker)
            const original = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-a',
                identityId: 'identity-1',
                name: 'Fusion Account A',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)
            const refreshed = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-a',
                identityId: 'identity-1',
                name: 'Fusion Account A Refreshed',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)

            ctx.fusionService.setFusionAccount(original)
            ctx.fusionService.setFusionAccount(refreshed)

            expect(ctx.mockLog.warn).not.toHaveBeenCalled()

            const report = ctx.fusionService.generateReport(tracker)
            expect(report.warnings).toBeUndefined()
        })

        it('clears identity conflict warning payload after report generation', () => {
            const tracker = new AggregationTracker()
            ctx.fusionService.setTracker(tracker)
            const accountA = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-a',
                identityId: 'identity-duplicate',
                name: 'Fusion Account A',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)
            const accountB = FusionAccount.fromFusionAccount({
                nativeIdentity: 'fusion-b',
                identityId: 'identity-duplicate',
                name: 'Fusion Account B',
                sourceName: 'Identity Fusion NG',
                uncorrelated: false,
                attributes: {},
            } as unknown as Account)

            ctx.fusionService.setFusionAccount(accountA)
            ctx.fusionService.setFusionAccount(accountB)

            const firstReport = ctx.fusionService.generateReport(tracker)
            expect(firstReport.warnings?.identityConflicts?.affectedIdentities).toBe(1)

            const secondReport = ctx.fusionService.generateReport(tracker)
            expect(secondReport.warnings).toBeUndefined()
        })
    })

    describe('initializeManagedAccountProcessing captureBreakdown wiring', () => {
        async function initializeWithReportCaptureFlag(shouldCaptureReportData: boolean): Promise<FusionService> {
            const localRun = new FusionRun()
            localRun.log = ctx.mockLog
            Object.defineProperty(localRun, 'managedAccountsById', {
                get: () => new Map(),
                configurable: true,
            })

            ctx.mockMatchingService.buildTrigramIndex = vi.fn()
            ctx.mockMatchingService.setCaptureBreakdown = vi.fn()

            const service = new FusionService(
                ctx.mockConfig,
                ctx.mockLog,
                ctx.mockIdentities,
                ctx.mockSources,
                ctx.mockForms,
                ctx.mockMappingService,
                ctx.mockDefinitionService,
                ctx.mockMatchingService,
                ctx.mockSchemas,
                localRun,
                StandardCommand.StdAccountList,
                shouldCaptureReportData
            )
            service.setTracker(new AggregationTracker())

            await service.initializeManagedAccountProcessing()
            return service
        }

        it('sets captureBreakdown false when report capture is disabled', async () => {
            await initializeWithReportCaptureFlag(false)
            expect(ctx.mockMatchingService.setCaptureBreakdown).toHaveBeenCalledWith(false)
        })

        it('sets captureBreakdown true when report capture is enabled', async () => {
            vi.mocked(ctx.mockMatchingService.setCaptureBreakdown).mockClear()
            await initializeWithReportCaptureFlag(true)
            expect(ctx.mockMatchingService.setCaptureBreakdown).toHaveBeenCalledWith(true)
        })
    })
})

