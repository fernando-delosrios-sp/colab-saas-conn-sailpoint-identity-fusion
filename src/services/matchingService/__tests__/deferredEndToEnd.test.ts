import { StandardCommand } from '@sailpoint/connector-sdk'
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAccount } from '../../../model/account'
import { FusionConfig, SourceType } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'
import { AggregationTracker } from '../../../model/aggregationTracker'
import { AccountAssembly } from '../../accountAssembly'
import { MatchingService } from '../matchingService'
import { MatchOutcomeDispatcher } from '../matchOutcomeDispatcher'
import { ManagedAccountAnalysisRecorder } from '../../fusionService/managedAccountAnalysisRecorder'
import { createUrlContext } from '../../../utils/url'

describe('deferred matching end-to-end (real MatchingService)', () => {
    const SOURCE_ID = 'source-a-id'
    const SOURCE_NAME = 'Source A'

    function build(options: { captureReportData?: boolean } = {}) {
        const config = {
            sources: [{ name: SOURCE_NAME, enabled: true }],
            fusionFormAttributes: ['firstName', 'lastName'],
            baseurl: 'https://example.identitynow.com',
            managedAccountsBatchSize: 10,
            fusionManualReviewScore: 80,
            matchingConfigs: [
                {
                    attribute: 'lastName',
                    algorithm: 'jaro-winkler',
                    fusionScore: 80,
                    mandatory: false,
                },
            ],
            fusionScoreMap: new Map([['lastName', 80]]),
        } as unknown as FusionConfig

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

        const run = new FusionRun(log)
        run.sourcesByName.set(SOURCE_NAME, {
            id: SOURCE_ID,
            name: SOURCE_NAME,
            isManaged: true,
            sourceType: SourceType.Authoritative,
            config: { deferredMatching: true },
        } as any)

        const matchingService = new MatchingService(config, log, run)
        const mappingService = { mapAttributes: vi.fn((account) => account) } as any
        const definitionService = {
            refreshNormalAttributes: vi.fn().mockResolvedValue(undefined),
            refreshReverseCorrelationAttributes: vi.fn(),
            registerUniqueAttributes: vi.fn().mockResolvedValue(undefined),
            registerUniqueValuesFromRecordManagedAccount: vi.fn().mockResolvedValue(undefined),
        } as any
        const sources = {
            managedAccountInventory: new Map(),
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
            urlContext: createUrlContext('https://example.identitynow.com'),
            reportAttributes: ['firstName', 'lastName'],
            sourcesByName: run.sourcesByName,
            config,
            sources,
            shouldCaptureReportData: () => options.captureReportData ?? true,
        })

        const dispatcher = new MatchOutcomeDispatcher({
            config,
            log,
            run,
            matchingService,
            correlationManager: {
                applyPerSourceCorrelationIfNeeded: vi.fn().mockResolvedValue(undefined),
            } as any,
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

        return { dispatcher, run, log, tracker, matchingService }
    }

    function managedAccount(nativeIdentity: string, lastName: string): Account {
        return {
            id: `acct-${nativeIdentity}`,
            nativeIdentity,
            name: `${lastName} ${nativeIdentity}`,
            sourceId: SOURCE_ID,
            sourceName: SOURCE_NAME,
            attributes: { lastName },
            uncorrelated: true,
        } as unknown as Account
    }

        it('clique of N similar accounts produces 1 non-match and N−1 deferred', async () => {
            const { dispatcher, run } = build()

            const accounts = [
                managedAccount('nat-1', 'Wesker'),
                managedAccount('nat-2', 'Wesker'),
                managedAccount('nat-3', 'Wesker'),
            ]
            for (const account of accounts) {
                run.managedAccountsById.set(`${SOURCE_ID}::${account.nativeIdentity}`, account)
            }

            const result = await dispatcher.runMatchSweep(accounts, 10)

            expect(result.nonMatch).toBe(1)
            expect(result.deferred).toBe(2)
        })

        it('detects a deferred match between two similar accounts in the same sweep', async () => {
        const { dispatcher, run, log, tracker } = build()

        const a = managedAccount('nat-1', 'Wesker')
        const b = managedAccount('nat-2', 'Wesker')
        run.managedAccountsById.set(`${SOURCE_ID}::nat-1`, a)
        run.managedAccountsById.set(`${SOURCE_ID}::nat-2`, b)

        const result = await dispatcher.runMatchSweep([a, b], 10)

        expect(run.deferredCandidateCount).toBeGreaterThan(0)
        expect(result.deferred).toBeGreaterThan(0)
        expect(log.recordEvent).toHaveBeenCalledWith('match', { type: 'deferred' })
        expect(tracker.deferredMatchReportData.length).toBeGreaterThan(0)
    })

    it('detects a deferred match against a persisted non-match fusion row from a prior run', async () => {
        const { dispatcher, run, log, tracker } = build()

        const persisted = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-native-1',
            name: 'Wesker Persisted',
            sourceName: 'Identity Fusion NG',
            uncorrelated: true,
            attributes: {
                lastName: 'Wesker',
                originSource: SOURCE_NAME,
                originAccount: `${SOURCE_ID}::nat-old`,
                statuses: ['nonMatched', 'uncorrelated'],
            },
        } as unknown as Account)
        persisted.setNonMatched()
        run.registerFusionAccount(persisted)
        run.registerPersistedDeferredCandidate(persisted)

        expect(run.deferredCandidateCount).toBe(1)

        const incoming = managedAccount('nat-new', 'Wesker')
        run.managedAccountsById.set(`${SOURCE_ID}::nat-new`, incoming)

        const result = await dispatcher.runMatchSweep([incoming], 10)

        expect(result.deferred).toBe(1)
        expect(log.recordEvent).toHaveBeenCalledWith('match', { type: 'deferred' })
        expect(tracker.deferredMatchReportData.length).toBe(1)
    })

    it('creates non-match fusion accounts on a later run when deferred matches are peer-only', async () => {
        const { dispatcher, run, matchingService } = build()

        const persisted = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-native-anchor',
            name: 'Wesker Anchor',
            sourceName: 'Identity Fusion NG',
            uncorrelated: true,
            attributes: {
                lastName: 'UniqueAnchor',
                originSource: SOURCE_NAME,
                originAccount: `${SOURCE_ID}::nat-anchor`,
                statuses: ['nonMatched', 'uncorrelated'],
            },
        } as unknown as Account)
        persisted.setNonMatched()
        run.registerFusionAccount(persisted)
        run.registerPersistedDeferredCandidate(persisted)

        const peerA = managedAccount('nat-peer-a', 'Wesker')
        const peerB = managedAccount('nat-peer-b', 'Wesker')
        run.managedAccountsById.set(`${SOURCE_ID}::nat-peer-a`, peerA)
        run.managedAccountsById.set(`${SOURCE_ID}::nat-peer-b`, peerB)

        const scoreSpy = vi.spyOn(matchingService, 'scoreFusionAccount')
        scoreSpy.mockImplementation(async (fusionAccount, candidates, candidateType) => {
            if (candidateType !== 'deferred') return 0
            for (const candidate of candidates) {
                if (candidate === persisted) continue
                fusionAccount.addFusionMatch({
                    identityId: '',
                    identityName: candidate.name ?? 'peer',
                    candidateType: 'deferred',
                    fusionIdentity: candidate,
                    scores: [{ attribute: 'lastName', algorithm: 'jaro-winkler', score: 90, isMatch: true }],
                } as any)
                break
            }
            return 1
        })

        const result = await dispatcher.runMatchSweep([peerA, peerB], 10)

        expect(result.nonMatch).toBe(1)
        expect(result.deferred).toBe(1)
        expect(run.getFusionAccountByManagedKey(`${SOURCE_ID}::nat-peer-a`)).toBeDefined()
        expect(run.getFusionAccountByManagedKey(`${SOURCE_ID}::nat-peer-b`)).toBeUndefined()
    })
})
