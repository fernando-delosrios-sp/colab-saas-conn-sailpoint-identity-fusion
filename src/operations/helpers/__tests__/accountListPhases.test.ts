import { buildReportAggregationStats } from '../accountListHelpers'
import { reportEpilogue } from '../accountListPhases'
import { FusionRun } from '../../../model/fusionRun'
import { LogService } from '../../../services/logService'
import { RecordingService, resetRecordingLifecycleForTests } from '../../../services/recordingService'
import { ServiceRegistry } from '../../../services/serviceRegistry'
import { FusionConfig } from '../../../model/config'
import { AggregationTracker } from '../../../services/fusionService'
import type { MatchingResultsSnapshot } from '../../../services/recordingService/matchingResultsSnapshot'
import * as fs from 'fs'
import * as path from 'path'

vi.mock('../generateReport', () => ({
    generateReport: vi.fn().mockResolvedValue(undefined),
}))

const fetchResult = {
    identitiesFound: 1,
    managedAccountsFound: 2,
    managedAccountsFoundAuthoritative: 2,
    managedAccountsFoundRecord: 0,
    managedAccountsFoundOrphan: 0,
}

function makeMatchingSnapshot(): MatchingResultsSnapshot {
    return {
        version: '1.0.0',
        recordedAt: '2026-07-30T00:00:00.000Z',
        operation: 'accountList',
        sweepSummary: { processed: 2, deferred: 1, nonMatch: 0 },
        identityMatches: [],
        deferredMatches: [
            {
                accountName: 'Acct',
                accountSource: 'HR',
                deferred: true,
                matches: [
                    {
                        identityName: 'Jane',
                        isMatch: true,
                        scores: [{ attribute: 'email', score: 95, isMatch: true, algorithm: 'jaro-winkler' }],
                    },
                ],
            },
        ],
        nonMatches: [{ accountName: 'None', accountSource: 'HR', matches: [] }],
        failedMatches: [],
    }
}

function buildEpilogueRegistry(options: {
    recording?: RecordingService
    fusionReportOnAggregation?: boolean
    tracker?: AggregationTracker
}) {
    const log = new LogService({ spConnDebugLoggingEnabled: false })
    const tracker = options.tracker ?? new AggregationTracker()
    const recordConfig = options.recording
        ? ({
              recording: { mode: 'record' as const, chainName: options.recording.getName(), store: 'ndjson' as const },
          } as FusionConfig)
        : undefined
    const run = new FusionRun(undefined, recordConfig)
    run.log = log
    run.setTracker(tracker)

    const matchingSnapshot = makeMatchingSnapshot()
    const buildMatchingResultsSnapshot = vi.fn().mockReturnValue(matchingSnapshot)

    const registry = {
        log,
        reports: {
            buildAggregationReportSnapshot: vi.fn().mockResolvedValue({ version: '1', stats: { managedAccountsFound: 2 } }),
        },
        fusion: {
            fusionReportOnAggregation: options.fusionReportOnAggregation ?? false,
            run,
            buildMatchingResultsSnapshot,
        },
        identities: { identitiesLoadedCount: 1 },
        res: { send: vi.fn() },
        recording: options.recording,
    } as unknown as ServiceRegistry

    return { registry, log, tracker, matchingSnapshot, buildMatchingResultsSnapshot }
}

describe('accountListPhases — buildReportAggregationStats', () => {
    it('maps fetch result and timer into aggregation stats', () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const run = new FusionRun()
        run.log = log
        const timer = run.log.timer('test')

        const localFetchResult = {
            identitiesFound: 3,
            managedAccountsFound: 10,
            managedAccountsFoundAuthoritative: 6,
            managedAccountsFoundRecord: 2,
            managedAccountsFoundOrphan: 2,
        }

        const identities = { identitiesLoadedCount: 5 } as any
        const stats = buildReportAggregationStats(localFetchResult, timer, identities, 7)

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
    afterEach(() => {
        resetRecordingLifecycleForTests()
    })

    it('writes reports/aggregation.json when recording is active', async () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const chainName = `report-epilogue-${Date.now()}`
        const config = {
            recording: { mode: 'record' as const, chainName, store: 'ndjson' as const },
        } as FusionConfig
        const recording = new RecordingService(log, config)
        const timer = log.timer('test')
        const snapshot = { version: '1', stats: { managedAccountsFound: 2 } }

        const registry = {
            log,
            reports: {
                buildAggregationReportSnapshot: vi.fn().mockResolvedValue(snapshot),
            },
            fusion: { fusionReportOnAggregation: true, run: new FusionRun(undefined, config) },
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
        const saved = JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
        expect(saved.version).toBe('1.1.0')
        expect(saved.runs).toHaveLength(1)
        expect(saved.runs[0].report).toEqual(snapshot)

        fs.rmSync(recording.getRecordingDir(), { recursive: true, force: true })
    })

    it('writes reports/matching-results.json when recording is active', async () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const chainName = `matching-epilogue-${Date.now()}`
        const config = {
            recording: { mode: 'record' as const, chainName, store: 'ndjson' as const },
        } as FusionConfig
        const recording = new RecordingService(log, config)
        const { registry, buildMatchingResultsSnapshot } = buildEpilogueRegistry({ recording })
        const timer = log.timer('test')

        await reportEpilogue(registry, {
            isPersistent: true,
            fetchResult,
            outputCount: 1,
            timer,
        })

        const matchingPath = path.join(recording.getRecordingDir(), 'reports', 'matching-results.json')
        expect(fs.existsSync(matchingPath)).toBe(true)
        const saved = JSON.parse(fs.readFileSync(matchingPath, 'utf-8'))
        expect(saved.version).toBe('1.1.0')
        expect(saved.runs).toHaveLength(1)
        expect(saved.runs[0].deferredMatches).toHaveLength(1)
        expect(saved.runs[0].nonMatches).toHaveLength(1)
        expect(saved.runs[0].sweepSummary.processed).toBe(2)
        expect(buildMatchingResultsSnapshot).toHaveBeenCalledOnce()

        fs.rmSync(recording.getRecordingDir(), { recursive: true, force: true })
    })

    it('does not write matching-results when recording is inactive', async () => {
        const { registry, buildMatchingResultsSnapshot } = buildEpilogueRegistry({ recording: undefined })
        const timer = registry.log.timer('test')

        await reportEpilogue(registry, {
            isPersistent: true,
            fetchResult,
            outputCount: 1,
            timer,
        })

        expect(buildMatchingResultsSnapshot).not.toHaveBeenCalled()
    })

    it('writes both aggregation and matching-results with independent manifest references', async () => {
        const log = new LogService({ spConnDebugLoggingEnabled: false })
        const chainName = `coexist-${Date.now()}`
        const config = {
            recording: { mode: 'record' as const, chainName, store: 'ndjson' as const },
        } as FusionConfig
        const recording = new RecordingService(log, config)
        const aggregationSnapshot = { version: '1', stats: { managedAccountsFound: 2 } }
        const { registry } = buildEpilogueRegistry({ recording, fusionReportOnAggregation: true })
        vi.mocked(registry.reports.buildAggregationReportSnapshot).mockResolvedValue(aggregationSnapshot)
        const timer = log.timer('test')

        await reportEpilogue(registry, {
            isPersistent: true,
            fetchResult,
            outputCount: 1,
            timer,
        })

        expect(registry.reports.buildAggregationReportSnapshot).toHaveBeenCalledWith(true, expect.any(Object))

        const dir = recording.getRecordingDir()
        expect(fs.existsSync(path.join(dir, 'reports', 'aggregation.json'))).toBe(true)
        expect(fs.existsSync(path.join(dir, 'reports', 'matching-results.json'))).toBe(true)

        const run = new FusionRun(undefined, config)
        run.log = log
        const res = { send: (_value: unknown) => undefined }
        recording.startOperation('accountList', {}, res, run)
        recording.endOperation(run)

        const scenarioPath = await recording.finalizeOnce()
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'))
        const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf-8'))

        expect(manifest.reportsPath).toContain('aggregation.json')
        expect(manifest.matchingResultsPath).toContain('matching-results.json')
        expect(manifest.artifactPaths).toContain(manifest.reportsPath)
        expect(manifest.artifactPaths).toContain(manifest.matchingResultsPath)
        expect(scenario.matchingResultsPath).toContain('matching-results.json')

        fs.rmSync(dir, { recursive: true, force: true })
    })
})

