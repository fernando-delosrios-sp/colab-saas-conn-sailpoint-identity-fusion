import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
import { createAutomaticMergeDecision } from '../../formService/helpers'
import { createUrlContext } from '../../../utils/url'

/**
 * Reproduces the Umbrella Corporation Ashford duplicate-display-name scenario
 * (two "A. Ashford" accounts: id=10 Alexia abbrev, id=12 Alfred abbrev).
 */
describe('Ashford duplicate display name debug reproduction', () => {
    const SOURCE_ID = 'fe0b4096bb02418e8225a54806f9b86f'
    const SOURCE_NAME = 'Umbrella Corporation'

    const matchingConfigs = [
        { attribute: 'displayName', algorithm: 'name-matcher' as const, fusionScore: 80, mandatory: false },
        { attribute: 'lastname', algorithm: 'name-matcher' as const, fusionScore: 80, mandatory: false },
        { attribute: 'email', algorithm: 'jaro-winkler' as const, fusionScore: 90, mandatory: false },
        { attribute: 'ssn', algorithm: 'binary' as const, fusionScore: 100, mandatory: false },
    ]

    function build(
        options: { withPersistedAnchors?: boolean; fusionEnableAutoMerge?: boolean; fusionAutoMergeScore?: number } = {}
    ) {
        const config = {
            sources: [{ name: SOURCE_NAME, enabled: true, deferredMatching: true }],
            fusionFormAttributes: ['firstname', 'lastname', 'email'],
            fusionMaxCandidatesForForm: 3,
            fusionEnableAutoMerge: options.fusionEnableAutoMerge ?? false,
            fusionAutoMergeScore: options.fusionAutoMergeScore,
            baseurl: 'https://example.identitynow.com',
            managedAccountsBatchSize: 36,
            fusionManualReviewScore: 80,
            matchingConfigs,
            fusionScoreMap: new Map(matchingConfigs.map((c) => [c.attribute, c.fusionScore])),
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

        if (options.withPersistedAnchors) {
            for (const [nativeId, displayName, email] of [
                ['9', 'Alexia Ashford', 'alexia.ashford@umbrellacorp.com'],
                ['12', 'A. Ashford', 'alfred.a@umbrellacorp.com'],
                ['11', 'Alfred Ashford', 'alfred.ashford@umbrellacorp.com'],
            ] as const) {
                const persisted = FusionAccount.fromFusionAccount({
                    nativeIdentity: `NG0000${nativeId === '9' ? '24' : nativeId === '12' ? '03' : '02'}`,
                    name: `${displayName} [${SOURCE_NAME}]`,
                    sourceName: 'Identity Fusion NG',
                    uncorrelated: true,
                    attributes: {
                        displayName,
                        lastname: 'Ashford',
                        email,
                        originSource: SOURCE_NAME,
                        originAccount: `${SOURCE_ID}::${nativeId}`,
                        statuses: ['nonMatched', 'uncorrelated'],
                    },
                } as unknown as Account)
                persisted.setNonMatched()
                run.registerFusionAccount(persisted)
                run.registerPersistedDeferredCandidate(persisted)
            }
        }

        const matchingService = new MatchingService(config, log, run)
        const mappingService = {
            mapAttributes: vi.fn((fusionAccount: FusionAccount) => {
                const sourceAccount = [...run.managedAccountsById.values()].find(
                    (a) => `${SOURCE_ID}::${a.nativeIdentity}` === fusionAccount.managedKey
                )
                if (sourceAccount?.attributes) {
                    Object.assign(fusionAccount.attributes, sourceAccount.attributes, {
                        displayName: sourceAccount.attributes.displayName ?? sourceAccount.name?.replace(` [${SOURCE_NAME}]`, ''),
                        lastname: sourceAccount.attributes.lastname ?? 'Ashford',
                    })
                }
            }),
        } as any
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
            reportAttributes: ['displayName', 'lastname', 'email'],
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
            correlationManager: {
                applyPerSourceCorrelationIfNeeded: vi.fn().mockResolvedValue(undefined),
            } as any,
            definitionService,
            mappingService,
            accountAssembly,
            forms: {
                createFusionForm: vi.fn().mockResolvedValue({ formDefinitionReady: true, newReviewInstancesQueued: 1 }),
                registerFinishedDecision: vi.fn(),
                createAutomaticMergeDecision,
            } as any,
            decisionProcessor: {
                processFusionIdentityDecision: vi.fn(async (decision) => {
                    const targetKey = decision.identityId
                    return (
                        run.getFusionAccountByManagedKey(targetKey) ??
                        run.getFusionIdentity(targetKey) ??
                        undefined
                    )
                }),
            },
            commandType: StandardCommand.StdAccountList,
        })

        return { dispatcher, run, tracker, matchingService }
    }

    function loadAshfordAccounts(): Account[] {
        const csvPath = resolve(process.cwd(), 'test-data/umbrella-corporation-feed.csv')
        const lines = readFileSync(csvPath, 'utf8').trim().split('\n')
        const headers = lines[0].split(',')
        const rows = lines.slice(1).map((line) => {
            const cols = line.split(',')
            const row: Record<string, string> = {}
            headers.forEach((h, i) => {
                row[h] = cols[i]
            })
            return row
        })

        const ashfordIds = new Set(['7', '8', '9', '10', '11', '12', '300'])
        return rows
            .filter((r) => ashfordIds.has(r.id))
            .map(
                (r) =>
                    ({
                        id: `acct-${r.id}`,
                        nativeIdentity: r.id,
                        name: `${r.fullName} [${SOURCE_NAME}]`,
                        sourceId: SOURCE_ID,
                        sourceName: SOURCE_NAME,
                        uncorrelated: true,
                        attributes: {
                            displayName: r.fullName,
                            firstname: r.firstName,
                            lastname: r.lastName,
                            email: r.email,
                            ssn: r.ssn,
                            department: r.department,
                        },
                    }) as unknown as Account
            )
    }

    it('fresh sweep: id=10 alone becomes a non-match anchor', async () => {
        const { dispatcher, run } = build()
        const accounts = loadAshfordAccounts().filter((a) => a.nativeIdentity === '10')
        for (const account of accounts) {
            run.managedAccountsById.set(`${SOURCE_ID}::${account.nativeIdentity}`, account)
        }

        const result = await dispatcher.runMatchSweep(accounts, 36)
        expect(result.nonMatch).toBe(1)
        expect([...run.fusionAccountsIterable()].some((fa) => fa.managedKey?.endsWith('::10'))).toBe(true)
    })

    it('with persisted anchors: id=10 defers to Alexia anchor', async () => {
        const { dispatcher, run } = build({ withPersistedAnchors: true })
        const accounts = loadAshfordAccounts()
        for (const account of accounts) {
            run.managedAccountsById.set(`${SOURCE_ID}::${account.nativeIdentity}`, account)
        }

        const result = await dispatcher.runMatchSweep(accounts, 36)

        const id10 = result.resolved.find((r) => r.account.nativeIdentity === '10')
        expect(id10?.resolution).toBe('deferred-match')

        const deferredKeys = (id10?.fusionAccount.fusionMatches ?? [])
            .filter((m) => m.candidateType === 'deferred')
            .map((m) => m.fusionIdentity?.managedKey ?? m.fusionIdentity?.managedAccountId)
        expect(deferredKeys).not.toContain(`${SOURCE_ID}::12`)
        expect(deferredKeys.some((k) => k?.endsWith('::9') || k === 'NG000024')).toBe(true)
    })

    it('run-2: id=12 auto-merges into run-1 fusion anchor from id=10 when auto-merge enabled', async () => {
        const run1 = build({ fusionEnableAutoMerge: true, fusionAutoMergeScore: 80 })
        const { dispatcher: d1, run: r1 } = run1
        const accounts10 = loadAshfordAccounts().filter((a) => a.nativeIdentity === '10')
        for (const account of accounts10) {
            r1.managedAccountsById.set(`${SOURCE_ID}::${account.nativeIdentity}`, account)
        }
        const run1Result = await d1.runMatchSweep(accounts10, 36)
        expect(run1Result.nonMatch).toBe(1)
        const anchor = [...r1.fusionAccountsIterable()].find((fa) => fa.managedKey?.endsWith('::10'))
        expect(anchor).toBeDefined()

        const run2 = build({ fusionEnableAutoMerge: true, fusionAutoMergeScore: 80 })
        const { dispatcher: d2, run: r2 } = run2
        const anchorFromRun1 = FusionAccount.fromFusionAccount({
            nativeIdentity: 'NG000010',
            name: anchor!.name,
            sourceName: 'Identity Fusion NG',
            uncorrelated: true,
            attributes: {
                displayName: 'A. Ashford',
                lastname: 'Ashford',
                email: 'alexia.a@umbrellacorp.com',
                originSource: SOURCE_NAME,
                originAccount: `${SOURCE_ID}::10`,
                statuses: ['nonMatched', 'uncorrelated'],
            },
        } as unknown as Account)
        anchorFromRun1.setNonMatched()
        r2.registerFusionAccount(anchorFromRun1)
        r2.registerPersistedDeferredCandidate(anchorFromRun1)

        const accounts12 = loadAshfordAccounts().filter((a) => a.nativeIdentity === '12')
        for (const account of accounts12) {
            r2.managedAccountsById.set(`${SOURCE_ID}::${account.nativeIdentity}`, account)
        }
        const run2Result = await d2.runMatchSweep(accounts12, 36)
        const id12 = run2Result.resolved.find((r) => r.account.nativeIdentity === '12')
        expect(run2Result.exact).toBe(1)
        expect(id12?.resolution).toBe('exact-match')
    })

    it('run-2: id=12 auto-merges into ::10 anchor over ISC identity when both match', async () => {
        const { dispatcher, run } = build({ fusionEnableAutoMerge: true, fusionAutoMergeScore: 80 })
        const anchorFromRun1 = FusionAccount.fromFusionAccount({
            nativeIdentity: 'NG000010',
            name: 'A. Ashford [Umbrella Corporation]',
            sourceName: 'Identity Fusion NG',
            uncorrelated: true,
            attributes: {
                displayName: 'A. Ashford',
                lastname: 'Ashford',
                email: 'alexia.a@umbrellacorp.com',
                originSource: SOURCE_NAME,
                originAccount: `${SOURCE_ID}::10`,
                statuses: ['nonMatched', 'uncorrelated'],
            },
        } as unknown as Account)
        anchorFromRun1.setNonMatched()
        run.registerFusionAccount(anchorFromRun1)
        run.registerPersistedDeferredCandidate(anchorFromRun1)

        const alexiaIdentity = FusionAccount.fromIdentity({
            id: 'isc-alexia-id',
            name: 'Alexia Ashford',
            attributes: {
                displayName: 'Alexia Ashford',
                lastname: 'Ashford',
                email: 'alexia.ashford@umbrellacorp.com',
            },
        } as any)
        run.registerFusionAccount(alexiaIdentity)

        const accounts12 = loadAshfordAccounts().filter((a) => a.nativeIdentity === '12')
        for (const account of accounts12) {
            run.managedAccountsById.set(`${SOURCE_ID}::${account.nativeIdentity}`, account)
        }
        const result = await dispatcher.runMatchSweep(accounts12, 36)
        const id12 = result.resolved.find((r) => r.account.nativeIdentity === '12')
        expect(result.exact).toBe(1)
        expect(id12?.resolution).toBe('exact-match')
        expect(id12?.identityId).toBe('NG000010')
    })
})
