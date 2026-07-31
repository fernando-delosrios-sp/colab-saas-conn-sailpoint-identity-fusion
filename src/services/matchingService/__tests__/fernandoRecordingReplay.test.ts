import * as fs from 'fs'
import * as path from 'path'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAccount } from '../../../model/account'
import { FusionConfig, SourceType } from '../../../model/config'
import { FusionRun, toManagedAccountInfo } from '../../../model/fusionRun'
import { AggregationTracker } from '../../../model/aggregationTracker'
import { AccountAssembly } from '../../accountAssembly'
import { MatchingService } from '../matchingService'
import { MatchOutcomeDispatcher } from '../matchOutcomeDispatcher'
import { ManagedAccountAnalysisRecorder } from '../../fusionService/managedAccountAnalysisRecorder'
import { MappingService } from '../../mappingService'
import { DefinitionService } from '../../definitionService'
import { createUrlContext } from '../../../utils/url'
import { readSettings as readMatchingSettings } from '../../../data/config/settings/matchingSettings'
import { readSettings as readAttributeMappingSettings } from '../../../data/config/settings/attributeMappingDefinitionsSettings'
import { readSettings as readNormalAttributeSettings } from '../../../data/config/settings/normalAttributeDefinitionsSettings'
import { getInternalConfigFlat } from '../../../data/config/internal'
import type { MatchingResultsSnapshot } from '../../recordingService/matchingResultsSnapshot'

import { recordingChainDir } from '../../../data/recordingPaths'

const CHAIN_REF = 'company12926-poc/fernando'
const RECORDING_DIR = recordingChainDir(CHAIN_REF)
const SCENARIO_PATH = path.join(RECORDING_DIR, 'scenario.json')
const MATCHING_RESULTS_PATH = path.join(RECORDING_DIR, 'reports', 'matching-results.json')
const FERNANDO_RECORDING_AVAILABLE =
    fs.existsSync(MATCHING_RESULTS_PATH) || fs.existsSync(SCENARIO_PATH)
const SOURCE_ID = 'fe0b4096bb02418e8225a54806f9b86f'
const SOURCE_NAME = 'Umbrella Corporation'

function loadScenarioConfig(): FusionConfig {
    const scenario = JSON.parse(fs.readFileSync(SCENARIO_PATH, 'utf8'))
    const raw = { ...scenario.config, ...getInternalConfigFlat() }
    const matching = readMatchingSettings(raw)
    const attributeMaps = readAttributeMappingSettings(raw)
    const normalAttributes = readNormalAttributeSettings(raw)
    return Object.assign({}, raw, matching, attributeMaps, normalAttributes) as FusionConfig
}

function loadMatchingResults(): MatchingResultsSnapshot | undefined {
    if (!fs.existsSync(MATCHING_RESULTS_PATH)) return undefined
    return JSON.parse(fs.readFileSync(MATCHING_RESULTS_PATH, 'utf8')) as MatchingResultsSnapshot
}

function loadManagedAccounts(): Account[] {
    const apiLines = fs
        .readFileSync(path.join(RECORDING_DIR, 'api-log.ndjson'), 'utf8')
        .trim()
        .split('\n')
    for (const line of apiLines) {
        const entry = JSON.parse(line)
        if (entry.method === 'listAccounts' && entry.response?.data?.length === 36) {
            return entry.response.data as Account[]
        }
    }
    throw new Error('Could not find 36 managed accounts in api-log')
}

function loadIdentity() {
    const steps = fs
        .readFileSync(path.join(RECORDING_DIR, 'steps.ndjson'), 'utf8')
        .trim()
        .split('\n')
    return JSON.parse(steps[0]).stateAfter.identities[0]
}

function buildDispatcher(config: FusionConfig) {
    FusionAccount.configure(config)

    const log = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        crash: vi.fn(),
        assert: vi.fn(),
        detail: vi.fn(),
        recordEvent: vi.fn(),
        getLogLevel: vi.fn().mockReturnValue('info'),
        setProgress: vi.fn(),
    } as any

    const run = new FusionRun(log, config)
    run.sourcesByName.set(SOURCE_NAME, {
        id: SOURCE_ID,
        name: SOURCE_NAME,
        isManaged: true,
        sourceType: SourceType.Authoritative,
        config: { deferredMatching: true },
    } as any)

    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mappingService = new MappingService(config, log)
    const definitionService = new DefinitionService(config, mockSchemas, log, mockLocks)
    const matchingService = new MatchingService(config, log, run)
    const sources = {
        managedAccountInventory: run.managedAccountInventory,
        resolveIscAccountIdForManagedKey: vi.fn((key: string) => key),
    } as any
    const tracker = new AggregationTracker()

    const accountAssembly = new AccountAssembly({
        run,
        sources,
        mappingService,
        definitionService,
        log,
        config,
        commandType: StandardCommand.StdAccountList,
        getTracker: () => tracker,
    })

    run.analysisRecorder = new ManagedAccountAnalysisRecorder({
        log,
        tracker: () => tracker,
        urlContext: createUrlContext(config.baseurl ?? 'https://example.identitynow.com'),
        reportAttributes: config.fusionFormAttributes ?? [],
        sourcesByName: run.sourcesByName,
        config,
        sources,
        run,
        shouldCaptureReportData: () => true,
    })

    const dispatcher = new MatchOutcomeDispatcher({
        config,
        log,
        run,
        matchingService,
        correlationManager: { applyPerSourceCorrelationIfNeeded: vi.fn().mockResolvedValue(undefined) } as any,
        definitionService,
        mappingService,
        accountAssembly,
        forms: {
            createFusionForm: vi.fn(),
            registerFinishedDecision: vi.fn(),
            createAutomaticMergeDecision: vi.fn(),
        } as any,
        decisionProcessor: { processFusionIdentityDecision: vi.fn() },
        commandType: StandardCommand.StdAccountList,
    })

    return { dispatcher, run, tracker, log }
}

function logDeferredMatches(deferredMatches: MatchingResultsSnapshot['deferredMatches']): void {
    console.log('\n=== DEFERRED MATCHES WITH SCORES ===')
    for (const row of [...deferredMatches].sort((a, b) => a.accountName.localeCompare(b.accountName))) {
        console.log(`\n--- ${row.accountName} (${row.accountId}) ---`)
        for (const match of row.matches ?? []) {
            const combined = match.scores?.find((s) => s.attribute === '__combined__')
            console.log(`  → ${match.accountName} (${match.accountId})`)
            console.log(`     exact: ${match.exact}, combined: ${combined?.score ?? 'n/a'}`)
            for (const s of match.scores ?? []) {
                if (s.attribute === '__combined__') continue
                console.log(
                    `     ${s.attribute} (${s.algorithm}): score=${s.score}, weighted=${s.weightedScore}, match=${s.isMatch}`
                )
            }
        }
    }
}

describe('fernando recording match replay', () => {
    it.skipIf(!FERNANDO_RECORDING_AVAILABLE)(
        'validates deferred matching outcomes from recording artifact or live replay',
        async () => {
        const artifact = loadMatchingResults()

        if (artifact) {
            console.log('\n=== MATCH SWEEP RESULT (from matching-results.json) ===')
            console.log(JSON.stringify(artifact.sweepSummary, null, 2))
            logDeferredMatches(artifact.deferredMatches)

            expect(artifact.deferredMatches.length).toBe(12)
            expect(artifact.sweepSummary?.deferred).toBe(12)
            expect(artifact.sweepSummary?.nonMatch).toBe(24)
            return
        }

        const config = loadScenarioConfig()
        const accounts = loadManagedAccounts()
        const identity = loadIdentity()
        const { dispatcher, run, tracker } = buildDispatcher(config)

        const fusionIdentity = FusionAccount.fromIdentity(identity)
        await run.registerFusionAccount(fusionIdentity)

        for (const account of accounts) {
            const key = `${account.sourceId}::${account.nativeIdentity}`
            run.managedAccountsById.set(key, account)
            run.managedAccountInventory.set(key, toManagedAccountInfo(account))
        }

        const result = await dispatcher.runMatchSweep(accounts, config.managedAccountsBatchSize ?? 50)

        console.log('\n=== MATCH SWEEP RESULT (replayed from api-log) ===')
        console.log(
            JSON.stringify(
                {
                    processed: result.processed,
                    exact: result.exact,
                    partial: result.partial,
                    deferred: result.deferred,
                    nonMatch: result.nonMatch,
                },
                null,
                2
            )
        )
        logDeferredMatches(tracker.deferredMatchReportData)

        expect(tracker.deferredMatchReportData.length).toBe(12)
        expect(result.deferred).toBe(12)
        expect(result.nonMatch).toBe(24)
        }
    )
})


