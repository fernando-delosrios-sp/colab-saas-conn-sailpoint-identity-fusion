import { buildReportAggregationStats } from '../accountListHelpers'
import { reportEpilogue } from '../accountListPhases'
import { FusionRun } from '../../../model/fusionRun'
import { LogService } from '../../../services/logService'
import { RecordingService } from '../../../services/recordingService'
import { ServiceRegistry } from '../../../services/serviceRegistry'
import { FusionConfig } from '../../../model/config'
import * as fs from 'fs'
import * as path from 'path'

vi.mock('../generateReport', () => ({
    generateReport: vi.fn().mockResolvedValue(undefined),
}))

describe('accountListPhases — buildReportAggregationStats', () => {
    it('maps fetch result and timer into aggregation stats', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const run = new FusionRun()
        run.log = log
        const timer = run.log.timer('test')

        const fetchResult = {
            identitiesFound: 3,
            managedAccountsFound: 10,
            managedAccountsFoundAuthoritative: 6,
            managedAccountsFoundRecord: 2,
            managedAccountsFoundOrphan: 2,
        }

        const identities = { identitiesLoadedCount: 5 } as any
        const stats = buildReportAggregationStats(fetchResult, timer, identities, 7)

        expect(stats.managedAccountsFound).toBe(10)
        expect(stats.managedAccountsFoundAuthoritative).toBe(6)
        expect(stats.managedAccountsFoundRecord).toBe(2)
        expect(stats.managedAccountsFoundOrphan).toBe(2)
        expect(stats.fusionAccountsReturned).toBe(7)
        expect(stats.totalProcessingTime).toBeDefined()
        expect(stats.phaseTiming).toBeDefined()
    })
})

describe('reportEpilogue recording artifacts', () => {
    it('writes reports/aggregation.json when recording is active', async () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const chainName = `report-epilogue-${Date.now()}`
        const config = {
            recording: { mode: 'record' as const, chainName, store: 'ndjson' as const },
        } as FusionConfig
        const recording = new RecordingService(log, config)
        const timer = log.timer('test')
        const fetchResult = {
            identitiesFound: 1,
            managedAccountsFound: 2,
            managedAccountsFoundAuthoritative: 2,
            managedAccountsFoundRecord: 0,
            managedAccountsFoundOrphan: 0,
        }
        const snapshot = { version: '1', stats: { managedAccountsFound: 2 } }

        const registry = {
            log,
            reports: {
                buildAggregationReportSnapshot: vi.fn().mockResolvedValue(snapshot),
            },
            fusion: { fusionReportOnAggregation: true },
            identities: { identitiesLoadedCount: 1 },
            res: { send: vi.fn() },
            recording,
        } as unknown as ServiceRegistry

        await reportEpilogue(registry, {
            isPersistent: true,
            fetchResult,
            outputCount: 1,
            timer,
        })

        const reportPath = path.join(recording.getRecordingDir(), 'reports', 'aggregation.json')
        expect(fs.existsSync(reportPath)).toBe(true)
        expect(JSON.parse(fs.readFileSync(reportPath, 'utf-8'))).toEqual(snapshot)

        fs.rmSync(recording.getRecordingDir(), { recursive: true, force: true })
    })
})


