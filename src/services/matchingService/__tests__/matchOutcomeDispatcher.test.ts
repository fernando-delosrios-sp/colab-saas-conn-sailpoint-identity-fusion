import { StandardCommand } from '@sailpoint/connector-sdk'
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAccount } from '../../../model/account'
import { FusionConfig, SourceType } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'
import { AggregationTracker } from '../../../model/aggregationTracker'
import { AccountAssembly } from '../../accountAssembly'
import { MatchingService } from '../matchingService'
import { MatchOutcomeDispatcher, MatchSweepMode } from '../matchOutcomeDispatcher'
import { createAutomaticMergeDecision } from '../../formService/helpers'
import type { SourceInfo } from '../../sourceService'

describe('MatchOutcomeDispatcher', () => {
    const SOURCE_ID = 'source-a-id'
    const SOURCE_NAME = 'Source A'

    function sourceInfo(overrides: Partial<SourceInfo> = {}): SourceInfo {
        return {
            id: SOURCE_ID,
            name: SOURCE_NAME,
            isManaged: true,
            sourceType: SourceType.Authoritative,
            config: {},
            ...overrides,
        }
    }

    function createDispatcher(options: {
        commandType?: StandardCommand
        isAggregationMode?: boolean
        configOverrides?: Partial<FusionConfig>
        tracker?: AggregationTracker
    } = {}) {
        const config = {
            sources: [],
            fusionFormAttributes: ['email', 'firstName', 'lastName'],
            fusionEnableManualReview: true,
            fusionEnableAutoMerge: false,
            baseurl: 'https://example.identitynow.com',
            managedAccountsBatchSize: 10,
            ...options.configOverrides,
        } as unknown as FusionConfig

        FusionAccount.configure(config)

        const log = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            crash: vi.fn(),
            assert: vi.fn(),
            recordEvent: vi.fn(),
            getLogLevel: vi.fn().mockReturnValue('info'),
            setProgress: vi.fn(),
        } as any
        const run = new FusionRun(log)
        const matchingService = new MatchingService(config, log)
        const mappingService = { mapAttributes: vi.fn((account) => account) } as any
        const definitionService = {
            refreshNormalAttributes: vi.fn().mockResolvedValue(undefined),
            refreshReverseCorrelationAttributes: vi.fn(),
            registerUniqueAttributes: vi.fn().mockResolvedValue(undefined),
            registerUniqueValuesFromRecordManagedAccount: vi.fn().mockResolvedValue(undefined),
        } as any
        const sources = { managedAccountInventory: new Map() } as any
        const accountAssembly = new AccountAssembly({
            run,
            sources,
            mappingService,
            definitionService,
            log,
            config,
            commandType: options.commandType,
            isAggregationMode: options.isAggregationMode,
        })
        const forms = {
            createFusionForm: vi.fn().mockResolvedValue({
                formDefinitionReady: true,
                newReviewInstancesQueued: 1,
            }),
            registerFinishedDecision: vi.fn(),
            createAutomaticMergeDecision,
        } as any
        const decisionProcessor = { processFusionIdentityDecision: vi.fn().mockResolvedValue(undefined) }

        const dispatcher = new MatchOutcomeDispatcher({
            config,
            log,
            run,
            matchingService,
            definitionService,
            mappingService,
            accountAssembly,
            forms,
            decisionProcessor,
            commandType: options.commandType,
        })

        return {
            dispatcher,
            config,
            log,
            run,
            matchingService,
            mappingService,
            definitionService,
            forms,
            decisionProcessor,
        }
    }

    function managedAccount(overrides: Partial<Account> = {}): Account {
        return {
            id: 'acct-1',
            nativeIdentity: 'native-1',
            name: 'Managed Account',
            sourceId: SOURCE_ID,
            sourceName: SOURCE_NAME,
            attributes: {},
            uncorrelated: true,
            ...overrides,
        } as Account
    }

    function identityMatch(scores: any[] = []): any {
        return {
            identityId: 'identity-1',
            identityName: 'Identity One',
            candidateType: 'identity',
            scores: scores.length > 0 ? scores : [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 100, isMatch: true }],
        }
    }

    function deferredMatch(overrides: Record<string, unknown> = {}, scores: any[] = []): any {
        return {
            identityId: '',
            identityName: 'Current operation non-match',
            candidateType: 'deferred',
            scores: scores.length > 0 ? scores : [{ attribute: 'name', algorithm: 'jaro-winkler', score: 92, isMatch: true }],
            ...overrides,
        }
    }

    function trackMaxConcurrentScoring(matchingService: MatchingService, candidateType: 'identity' | 'deferred') {
        let inFlight = 0
        let maxInFlight = 0
        vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (_account, _pool, type) => {
            if (type !== candidateType) return 0
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise<void>((resolve) => setImmediate(resolve))
            inFlight -= 1
            return 0
        })
        return () => maxInFlight
    }

    function trackMaxConcurrentDispatch(forms: { createFusionForm: ReturnType<typeof vi.fn> }) {
        let inFlight = 0
        let maxInFlight = 0
        forms.createFusionForm.mockImplementation(async () => {
            inFlight += 1
            maxInFlight = Math.max(maxInFlight, inFlight)
            await new Promise<void>((resolve) => setImmediate(resolve))
            inFlight -= 1
            return {
                formDefinitionReady: true,
                newReviewInstancesQueued: 1,
            }
        })
        return () => maxInFlight
    }

    function stubPartialIdentityMatches(matchingService: MatchingService) {
        vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
            if (candidateType === 'identity') {
                fusionAccount.layers.addFusionMatch({
                    identityId: 'identity-1',
                    identityName: 'Identity One',
                    candidateType: 'identity',
                    scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 85, isMatch: true }],
                })
            }
            return 1
        })
    }

    function partialMatchAccounts(count: number): Account[] {
        return Array.from({ length: count }, (_, index) =>
            managedAccount({
                id: `acct-${index}`,
                nativeIdentity: `native-${index}`,
                name: `Managed Account ${index}`,
            })
        )
    }

    function seedReviewers(run: FusionRun) {
        run.reviewersBySourceId.set(
            SOURCE_ID,
            new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
        )
    }

    describe('runMatchSweep', () => {
        it('lets timers run while sweeping a large account set', async () => {
            // A first run has no identities to score against, so every await in the sweep settles
            // without I/O. Microtasks alone never let Node reach the timer phase, which is what
            // silences the heartbeat and the platform keep-alive for the whole sweep.
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { managedAccountsBatchSize: 10 },
            })
            run.sourcesByName.set(
                SOURCE_NAME,
                sourceInfo({ sourceType: SourceType.Authoritative, config: { deferredMatching: true } })
            )
            seedReviewers(run)

            // Longest stretch of accounts handled without the event loop reaching a macrotask.
            let accountsSinceTurn = 0
            let worstStretch = 0
            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async () => {
                accountsSinceTurn += 1
                worstStretch = Math.max(worstStretch, accountsSinceTurn)
                return 0
            })

            const accounts = Array.from({ length: 200 }, (_, index) =>
                managedAccount({
                    id: `acct-${index}`,
                    nativeIdentity: `native-${index}`,
                    name: `Managed Account ${index}`,
                })
            )
            for (const account of accounts) {
                run.managedAccountsById.set(`${SOURCE_ID}::${account.nativeIdentity}`, account)
            }

            let sweeping = true
            const markTurn = () => {
                if (!sweeping) return
                accountsSinceTurn = 0
                setImmediate(markTurn)
            }
            setImmediate(markTurn)

            await dispatcher.runMatchSweep(accounts, accounts.length)
            sweeping = false

            // managedAccountsBatchSize 10 caps the yield cadence at 10 accounts; 25 leaves slack
            // while still failing loudly if a loop runs the whole set without yielding.
            expect(worstStretch).toBeLessThanOrEqual(25)
        })

        it('dispatches an exact match to automatic merge when the combined score meets the threshold', async () => {
            const { dispatcher, matchingService, forms, decisionProcessor, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { fusionEnableAutoMerge: true, fusionAutoMergeScore: 100 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            const identity = FusionAccount.fromIdentity({ id: 'identity-1', name: 'Identity One', attributes: {} } as any)
            run.registerFusionAccount(identity)

            const assigned = FusionAccount.fromIdentity({ id: 'identity-1', name: 'Identity One', attributes: {} } as any)
            decisionProcessor.processFusionIdentityDecision.mockResolvedValue(assigned)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch(identityMatch())
                }
                return 1
            })

            const account = managedAccount()
            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.processed).toBe(1)
            expect(result.exact).toBe(1)
            expect(result.partial).toBe(0)
            expect(result.deferred).toBe(0)
            expect(result.nonMatch).toBe(0)
            expect(result.resolved[0].resolution).toBe('exact-match')
            expect(result.resolved[0].identityId).toBe('identity-1')
            expect(forms.registerFinishedDecision).toHaveBeenCalledWith(
                expect.objectContaining({
                    newIdentity: false,
                    identityId: 'identity-1',
                    automaticMerge: true,
                })
            )
            expect(decisionProcessor.processFusionIdentityDecision).toHaveBeenCalled()
            expect(run.autoMergedIdentityIds.has('identity-1')).toBe(true)
        })

        it('auto-merges into a persisted anchor when it outscores an ISC identity candidate', async () => {
            const { dispatcher, matchingService, forms, decisionProcessor, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { fusionEnableAutoMerge: true, fusionAutoMergeScore: 80 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: true } }))

            const anchor = FusionAccount.fromFusionAccount({
                nativeIdentity: 'NG000010',
                name: 'Anchor Account [Source A]',
                sourceName: 'Identity Fusion NG',
                uncorrelated: true,
                attributes: {
                    originSource: SOURCE_NAME,
                    originAccount: `${SOURCE_ID}::10`,
                },
            } as unknown as Account)
            anchor.collections.statuses.setNonMatched(anchor.name, anchor.sourceName)
            run.registerFusionAccount(anchor)
            run.registerPersistedDeferredCandidate(anchor)

            const identity = FusionAccount.fromIdentity({
                id: 'isc-identity-1',
                name: 'ISC Identity',
                attributes: {},
            } as any)
            run.registerFusionAccount(identity)

            const assigned = FusionAccount.fromFusionAccount({
                nativeIdentity: 'NG000010',
                name: 'Anchor Account [Source A]',
                sourceName: 'Identity Fusion NG',
                uncorrelated: true,
                attributes: {},
            } as unknown as Account)
            decisionProcessor.processFusionIdentityDecision.mockResolvedValue(assigned)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: 'isc-identity-1',
                        identityName: 'ISC Identity',
                        candidateType: 'identity',
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 90, isMatch: true }],
                    })
                }
                if (candidateType === 'deferred') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: '',
                        identityName: 'Persisted anchor',
                        candidateType: 'deferred',
                        fusionIdentity: anchor,
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 95, isMatch: true }],
                    })
                }
                return 1
            })

            const account = managedAccount({ nativeIdentity: '12' })
            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.exact).toBe(1)
            expect(result.resolved[0].resolution).toBe('exact-match')
            expect(result.resolved[0].identityId).toBe('NG000010')
            expect(forms.registerFinishedDecision).toHaveBeenCalledWith(
                expect.objectContaining({ identityId: 'NG000010', automaticMerge: true })
            )
        })

        it('dispatches a partial match to a review form when auto-merge is disabled', async () => {
            const { dispatcher, matchingService, forms, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(SOURCE_ID, new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)]))

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: 'identity-1',
                        identityName: 'Identity One',
                        candidateType: 'identity',
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 85, isMatch: true }],
                    })
                }
                return 1
            })

            const account = managedAccount()
            run.managedAccountsById.set('source-a-id::native-1', account)

            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.partial).toBe(1)
            expect(forms.createFusionForm).toHaveBeenCalledWith(expect.any(FusionAccount), expect.any(Set))
            expect(log.recordEvent).toHaveBeenCalledWith('formsQueued')
            expect(run.managedAccountsById.has('source-a-id::native-1')).toBe(false)
        })


        it('does not claim the account when partial-match form creation fails', async () => {
            const { dispatcher, matchingService, forms, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(SOURCE_ID, new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)]))
            const account = managedAccount()
            run.managedAccountsById.set('source-a-id::native-1', account)

            forms.createFusionForm.mockResolvedValueOnce({
                formDefinitionReady: false,
                newReviewInstancesQueued: 0,
            })

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: 'identity-1',
                        identityName: 'Identity One',
                        candidateType: 'identity',
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 85, isMatch: true }],
                    })
                }
                return 1
            })

            await dispatcher.runMatchSweep([account], 1)

            expect(run.managedAccountsById.has('source-a-id::native-1')).toBe(true)
        })

        it('does not claim the account when partial-match form creation throws', async () => {
            const { dispatcher, matchingService, forms, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(SOURCE_ID, new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)]))
            const account = managedAccount()
            run.managedAccountsById.set('source-a-id::native-1', account)

            forms.createFusionForm.mockRejectedValueOnce(new Error('Form creation failed'))

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: 'identity-1',
                        identityName: 'Identity One',
                        candidateType: 'identity',
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 85, isMatch: true }],
                    })
                }
                return 1
            })

            await dispatcher.runMatchSweep([account], 1)

            expect(run.managedAccountsById.has('source-a-id::native-1')).toBe(true)
        })

        it('dispatches a deferred match by claiming the account from the work queue', async () => {
            const { dispatcher, matchingService, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ sourceType: SourceType.Authoritative, config: { deferredMatching: true } }))
            seedReviewers(run)
            const previousNonMatch = FusionAccount.fromManagedAccount({
                id: 'acct-prev',
                nativeIdentity: 'native-prev',
                name: 'Previous Non Match',
                sourceId: SOURCE_ID,
                sourceName: SOURCE_NAME,
                attributes: {},
            } as any)
            previousNonMatch.collections.statuses.setNonMatched(previousNonMatch.name, previousNonMatch.sourceName)
            run.registerFusionAccount(previousNonMatch)
            run.registerFinalizedDeferredCandidate(previousNonMatch)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') return 0
                if (candidateType === 'deferred') {
                    fusionAccount.layers.addFusionMatch(deferredMatch({ fusionIdentity: previousNonMatch }))
                }
                return 1
            })

            const account = managedAccount({ id: 'acct-new', nativeIdentity: 'native-new', name: 'New Account' })
            run.managedAccountsById.set('source-a-id::native-new', account)

            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.deferred).toBe(1)
            expect(run.managedAccountsById.has('source-a-id::native-new')).toBe(false)
            expect(log.recordEvent).toHaveBeenCalledWith('match', { type: 'deferred' })
        })

        it('uses current-run non-match from the same sweep as a deferred candidate without fusionAccountMap pre-registration', async () => {
            const { dispatcher, matchingService, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ sourceType: SourceType.Authoritative, config: { deferredMatching: true } }))
            seedReviewers(run)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, candidates, candidateType) => {
                if (candidateType === 'identity') return 0
                const candidateList = Array.from(candidates)
                const hasPriorNonMatch = candidateList.some(
                    (candidate) => candidate.managedAccountId === 'source-a-id::native-first'
                )
                if (
                    hasPriorNonMatch &&
                    fusionAccount.managedAccountId === 'source-a-id::native-second'
                ) {
                    const anchor = candidateList.find(
                        (candidate) => candidate.managedAccountId === 'source-a-id::native-first'
                    )
                    fusionAccount.layers.addFusionMatch(deferredMatch({ fusionIdentity: anchor }))
                }
                return candidateList.length
            })

            const firstAccount = managedAccount({ id: 'acct-first', nativeIdentity: 'native-first', name: 'Taylor Jordan' })
            const secondAccount = managedAccount({ id: 'acct-second', nativeIdentity: 'native-second', name: 'Taylor Jordan' })
            run.managedAccountsById.set('source-a-id::native-first', firstAccount)
            run.managedAccountsById.set('source-a-id::native-second', secondAccount)

            const result = await dispatcher.runMatchSweep([firstAccount, secondAccount], 2)

            expect(result.deferred).toBe(1)
            expect(result.nonMatch).toBe(1)
            expect(log.recordEvent).toHaveBeenCalledWith('match', { type: 'deferred' })
        })

        it('scores deferred accounts sequentially against only finalized candidates in the same sweep', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ sourceType: SourceType.Authoritative, config: { deferredMatching: true } }))
            seedReviewers(run)

            const firstAccount = managedAccount({ id: 'acct-a', nativeIdentity: 'nat-a', name: 'Peer A' })
            const secondAccount = managedAccount({ id: 'acct-b', nativeIdentity: 'nat-b', name: 'Peer B' })
            const thirdAccount = managedAccount({ id: 'acct-c', nativeIdentity: 'nat-c', name: 'Peer C' })
            run.managedAccountsById.set('source-a-id::nat-a', firstAccount)
            run.managedAccountsById.set('source-a-id::nat-b', secondAccount)
            run.managedAccountsById.set('source-a-id::nat-c', thirdAccount)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, pool, candidateType) => {
                if (candidateType !== 'deferred') return 0
                const candidateList = Array.from(pool)
                if (fusionAccount.managedAccountId !== 'source-a-id::nat-b') return candidateList.length
                for (const candidate of candidateList) {
                    if (run.getDeferredCandidateTier(candidate) === 'finalized') {
                        fusionAccount.layers.addFusionMatch(deferredMatch({ fusionIdentity: candidate }))
                    }
                }
                return candidateList.length
            })

            const result = await dispatcher.runMatchSweep([firstAccount, secondAccount, thirdAccount], 3)

            expect(result.deferred).toBe(1)
            expect(result.nonMatch).toBe(2)
            expect(run.getFusionAccountByManagedKey('source-a-id::nat-a')).toBeDefined()
            expect(run.getFusionAccountByManagedKey('source-a-id::nat-c')).toBeDefined()
            expect(run.managedAccountsById.has('source-a-id::nat-b')).toBe(false)
        })

        it('records non-match outcomes for pending peers promoted during deferred match', async () => {
            const { dispatcher, matchingService, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ sourceType: SourceType.Authoritative, config: { deferredMatching: true } }))
            seedReviewers(run)

            const firstAccount = managedAccount({ id: 'acct-first', nativeIdentity: 'native-first', name: 'Taylor Jordan' })
            const secondAccount = managedAccount({ id: 'acct-second', nativeIdentity: 'native-second', name: 'Taylor Jordan' })
            const thirdAccount = managedAccount({ id: 'acct-third', nativeIdentity: 'native-third', name: 'Taylor Jordan' })
            run.managedAccountsById.set('source-a-id::native-first', firstAccount)
            run.managedAccountsById.set('source-a-id::native-second', secondAccount)
            run.managedAccountsById.set('source-a-id::native-third', thirdAccount)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, pool, candidateType) => {
                if (candidateType !== 'deferred') return 0
                const candidateList = Array.from(pool)
                if (fusionAccount.managedAccountId === 'source-a-id::native-second') {
                    const peer = candidateList.find(
                        (candidate) => candidate.managedAccountId === 'source-a-id::native-third'
                    )
                    if (peer) {
                        fusionAccount.layers.addFusionMatch(deferredMatch({ fusionIdentity: peer }))
                    }
                }
                return candidateList.length
            })

            const result = await dispatcher.runMatchSweep([firstAccount, secondAccount, thirdAccount], 3)

            expect(result.nonMatch).toBe(2)
            expect(result.deferred).toBe(1)
            expect(log.recordEvent).toHaveBeenCalledWith('nonMatch')
            expect(run.getFusionAccountByManagedKey('source-a-id::native-first')).toBeDefined()
            expect(run.getFusionAccountByManagedKey('source-a-id::native-third')).toBeDefined()
            expect(run.managedAccountsById.has('source-a-id::native-second')).toBe(false)
        })


        it('dispatches a non-match by registering an authoritative fusion account', async () => {
            const { dispatcher, matchingService, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())

            vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account = managedAccount()
            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.nonMatch).toBe(1)
            expect(log.recordEvent).toHaveBeenCalledWith('nonMatch')
            expect(result.resolved[0].fusionAccount.statuses).toContain('nonMatched')
            expect(run.getFusionAccountByManagedKey('source-a-id::native-1')).toBeDefined()
        })

        it('treats accounts from sources without reviewers as non-matches when automatic merge is disabled', async () => {
            const { dispatcher, matchingService, forms, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { fusionEnableAutoMerge: false },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.sourcesWithoutReviewers.add(SOURCE_NAME)

            const scoreSpy = vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.nonMatch).toBe(1)
            expect(scoreSpy).not.toHaveBeenCalled()
            expect(forms.createFusionForm).not.toHaveBeenCalled()
        })

        it('scores accounts from no-reviewer sources when automatic merge is enabled', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { fusionEnableAutoMerge: true },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())

            const scoreSpy = vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(scoreSpy).toHaveBeenCalled()
        })

        it('registers non-match when partial score and manual review path is unavailable', async () => {
            const { dispatcher, matchingService, forms, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: {
                    fusionEnableAutoMerge: true,
                    fusionEnableManualReview: false,
                    fusionAutoMergeScore: 100,
                    fusionManualReviewScore: 80,
                },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: 'identity-1',
                        identityName: 'Identity One',
                        candidateType: 'identity',
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 85, isMatch: true }],
                    })
                }
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.nonMatch).toBe(1)
            expect(result.partial).toBe(0)
            expect(forms.createFusionForm).not.toHaveBeenCalled()
            expect(log.recordEvent).toHaveBeenCalledWith('nonMatch')
        })

        it('registers non-match when partial score and no reviewers with automatic merge enabled', async () => {
            const { dispatcher, matchingService, forms, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: {
                    fusionEnableAutoMerge: true,
                    fusionEnableManualReview: true,
                    fusionAutoMergeScore: 100,
                    fusionManualReviewScore: 80,
                },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: 'identity-1',
                        identityName: 'Identity One',
                        candidateType: 'identity',
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 85, isMatch: true }],
                    })
                }
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.nonMatch).toBe(1)
            expect(result.partial).toBe(0)
            expect(forms.createFusionForm).not.toHaveBeenCalled()
            expect(log.recordEvent).toHaveBeenCalledWith('nonMatch')
        })

        it('dispatches partial match when manual review is enabled and reviewers exist', async () => {
            const { dispatcher, matchingService, forms, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: {
                    fusionEnableAutoMerge: true,
                    fusionEnableManualReview: true,
                    fusionAutoMergeScore: 100,
                    fusionManualReviewScore: 80,
                },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: 'identity-1',
                        identityName: 'Identity One',
                        candidateType: 'identity',
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 85, isMatch: true }],
                    })
                }
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.partial).toBe(1)
            expect(result.nonMatch).toBe(0)
            expect(forms.createFusionForm).toHaveBeenCalled()
            expect(log.recordEvent).toHaveBeenCalledWith('formsQueued')
        })

        it('registers non-match when partial score and manual review path is unavailable with reviewers present', async () => {
            const { dispatcher, matchingService, forms, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: {
                    fusionEnableAutoMerge: true,
                    fusionEnableManualReview: false,
                    fusionAutoMergeScore: 100,
                    fusionManualReviewScore: 80,
                },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: 'identity-1',
                        identityName: 'Identity One',
                        candidateType: 'identity',
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 85, isMatch: true }],
                    })
                }
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.nonMatch).toBe(1)
            expect(result.partial).toBe(0)
            expect(forms.createFusionForm).not.toHaveBeenCalled()
            expect(log.recordEvent).toHaveBeenCalledWith('nonMatch')
        })

        it('auto-merges when threshold met without reviewers configured', async () => {
            const { dispatcher, matchingService, forms, decisionProcessor, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { fusionEnableAutoMerge: true, fusionAutoMergeScore: 100 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            const identity = FusionAccount.fromIdentity({ id: 'identity-1', name: 'Identity One', attributes: {} } as any)
            run.registerFusionAccount(identity)

            const assigned = FusionAccount.fromIdentity({ id: 'identity-1', name: 'Identity One', attributes: {} } as any)
            decisionProcessor.processFusionIdentityDecision.mockResolvedValue(assigned)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch(identityMatch())
                }
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.exact).toBe(1)
            expect(result.partial).toBe(0)
            expect(result.nonMatch).toBe(0)
            expect(forms.createFusionForm).not.toHaveBeenCalled()
            expect(run.autoMergedIdentityIds.has('identity-1')).toBe(true)
        })

        it('finalizes non-match for deferred partial outcome without reviewers', async () => {
            const { dispatcher, matchingService, forms, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { fusionEnableAutoMerge: true, fusionAutoMergeScore: 100 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: true } }))
            const previousNonMatch = FusionAccount.fromManagedAccount({
                id: 'acct-prev',
                nativeIdentity: 'native-prev',
                name: 'Previous Non Match',
                sourceId: SOURCE_ID,
                sourceName: SOURCE_NAME,
                attributes: {},
            } as any)
            previousNonMatch.collections.statuses.setNonMatched(previousNonMatch.name, previousNonMatch.sourceName)
            run.registerFusionAccount(previousNonMatch)
            run.registerFinalizedDeferredCandidate(previousNonMatch)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') return 0
                if (candidateType === 'deferred') {
                    fusionAccount.layers.addFusionMatch(deferredMatch({ fusionIdentity: previousNonMatch }))
                }
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.nonMatch).toBe(1)
            expect(result.deferred).toBe(0)
            expect(forms.createFusionForm).not.toHaveBeenCalled()
            expect(log.recordEvent).toHaveBeenCalledWith('nonMatch')
        })

        it('handles record sources by registering unique attributes without creating a fusion account', async () => {
            const { dispatcher, matchingService, definitionService, mappingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ sourceType: SourceType.Record, config: {} }))

            vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account = managedAccount()
            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.nonMatch).toBe(1)
            expect(definitionService.registerUniqueValuesFromRecordManagedAccount).toHaveBeenCalledWith(
                account,
                mappingService,
                run
            )
            expect(run.getFusionAccountByManagedKey('source-a-id::native-1')).toBeUndefined()
        })

        it('handles orphan sources by queueing a disable operation when configured', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ sourceType: SourceType.Orphan, config: { disableNonMatchingAccounts: true } }))

            const disableSpy = vi.fn().mockResolvedValue(undefined)
            run.setDisableOperationFactory(async (account) => disableSpy(account))

            vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account = managedAccount()
            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.nonMatch).toBe(1)
            expect(disableSpy).toHaveBeenCalledWith(account)
            expect(run.getFusionAccountByManagedKey('source-a-id::native-1')).toBeUndefined()
        })

        it('applies identity layer to correlated orphan accounts when identity is in cache', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )
            run.addIdentity('identity-orphan', {
                id: 'identity-orphan',
                name: 'aanderson',
                displayName: 'Alice Anderson',
                attributes: { displayName: 'Alice Anderson' },
            } as any)

            const scoreSpy = vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account = managedAccount({
                uncorrelated: false,
                identityId: 'identity-orphan',
            })
            run.managedAccountsById.set('source-a-id::native-1', account)

            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.nonMatch).toBe(1)
            expect(scoreSpy).not.toHaveBeenCalled()
            expect(result.resolved[0].fusionAccount.identityAlias).toBe('aanderson')
            expect(result.resolved[0].fusionAccount.identityDisplayName).toBe('Alice Anderson')
            expect(result.resolved[0].fusionAccount.isIdentity).toBe(true)
        })

        it('drops linked correlated accounts without applying the orphan identity layer path', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.initLinkedAccountIndex()
            run.addToLinkedAccountIndex('source-a-id::native-linked')
            run.addIdentity('identity-linked', {
                id: 'identity-linked',
                name: 'linked-login',
                displayName: 'Linked Display',
                attributes: { displayName: 'Linked Display' },
            } as any)

            const scoreSpy = vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account = managedAccount({
                uncorrelated: false,
                identityId: 'identity-linked',
                nativeIdentity: 'native-linked',
                id: 'acct-linked',
            })

            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.processed).toBe(1)
            expect(result.nonMatch).toBe(0)
            expect(result.resolved).toHaveLength(0)
            expect(scoreSpy).not.toHaveBeenCalled()
            expect(run.managedAccountsById.has('source-a-id::native-linked')).toBe(false)
        })

        it('skip-linked does not call log.info', async () => {
            const { dispatcher, matchingService, run, log } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.initLinkedAccountIndex()
            run.addToLinkedAccountIndex('source-a-id::native-linked')
            run.addIdentity('identity-linked', {
                id: 'identity-linked',
                name: 'linked-login',
                displayName: 'Linked Display',
                attributes: { displayName: 'Linked Display' },
            } as any)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account = managedAccount({
                uncorrelated: false,
                identityId: 'identity-linked',
                nativeIdentity: 'native-linked',
                id: 'acct-linked',
            })

            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.processed).toBe(1)
            expect(result.resolved).toHaveLength(0)
            const skipLinkedInfo = log.info.mock.calls.filter(
                ([message]: [unknown]) =>
                    typeof message === 'string' && /already linked|Dropping managed account/i.test(message)
            )
            expect(skipLinkedInfo).toHaveLength(0)
        })

        it('correlated-orphan does not log INFO per account', async () => {
            const { dispatcher, matchingService, run, log } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )
            run.addIdentity('identity-orphan', {
                id: 'identity-orphan',
                name: 'aanderson',
                displayName: 'Alice Anderson',
                attributes: { displayName: 'Alice Anderson' },
            } as any)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account = managedAccount({
                uncorrelated: false,
                identityId: 'identity-orphan',
            })
            run.managedAccountsById.set('source-a-id::native-1', account)

            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.nonMatch).toBe(1)
            const orphanInfo = log.info.mock.calls.filter(
                ([message]: [unknown]) =>
                    typeof message === 'string' && /not linked to Fusion|treating as non-match/i.test(message)
            )
            expect(orphanInfo).toHaveLength(0)
        })

        it('applies identity layer to each correlated orphan sharing the same identityId', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )
            run.addIdentity('identity-shared', {
                id: 'identity-shared',
                name: 'shared-login',
                displayName: 'Shared Display Name',
                attributes: { displayName: 'Shared Display Name' },
            } as any)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account1 = managedAccount({
                uncorrelated: false,
                identityId: 'identity-shared',
                nativeIdentity: 'native-1',
                id: 'acct-1',
                name: 'Orphan One',
            })
            const account2 = managedAccount({
                uncorrelated: false,
                identityId: 'identity-shared',
                nativeIdentity: 'native-2',
                id: 'acct-2',
                name: 'Orphan Two',
            })

            const result = await dispatcher.runMatchSweep([account1, account2], 2)

            expect(result.nonMatch).toBe(2)
            expect(result.resolved[0].fusionAccount.identityAlias).toBe('shared-login')
            expect(result.resolved[1].fusionAccount.identityAlias).toBe('shared-login')
            expect(result.resolved[0].fusionAccount.identityDisplayName).toBe('Shared Display Name')
            expect(result.resolved[1].fusionAccount.identityDisplayName).toBe('Shared Display Name')
            expect(result.resolved[0].fusionAccount.isIdentity).toBe(true)
            expect(result.resolved[1].fusionAccount.isIdentity).toBe(true)
        })

        it('skips identity layer for correlated orphan when identity is protected', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(
                SOURCE_ID,
                new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)])
            )
            run.addIdentity('identity-orphan', {
                id: 'identity-orphan',
                name: 'aanderson',
                displayName: 'Alice Anderson',
                attributes: {},
                protected: true,
            } as any)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account = managedAccount({
                uncorrelated: false,
                identityId: 'identity-orphan',
            })

            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.nonMatch).toBe(1)
            expect(result.resolved[0].fusionAccount.identityAlias).not.toBe('Alice Anderson')
            expect(result.resolved[0].fusionAccount.identityDisplayName).not.toBe('Alice Anderson')
        })



        it('skips identity scoring for record sources when matching is disabled', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ sourceType: SourceType.Record, config: { includeRecordAccountsForMatching: false } }))

            const scoreSpy = vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(scoreSpy).not.toHaveBeenCalled()
        })

        it('does not auto-assign when the combined score row is missing', async () => {
            const { dispatcher, matchingService, forms, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { fusionEnableAutoMerge: true, fusionAutoMergeScore: 100 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(SOURCE_ID, new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)]))

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch({
                        identityId: 'identity-1',
                        identityName: 'Identity One',
                        candidateType: 'identity',
                        scores: [
                            { attribute: 'firstname', algorithm: 'name', score: 100, fusionScore: '100' } as any,
                            { attribute: 'email', algorithm: 'jaro-winkler', score: 0, skipped: true } as any,
                        ],
                    })
                }
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.partial).toBe(1)
            expect(forms.registerFinishedDecision).not.toHaveBeenCalled()
        })

        it('treats identity matches outside account-list mode as partial matches', async () => {
            const { dispatcher, matchingService, forms, run } = createDispatcher()
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(SOURCE_ID, new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)]))

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.layers.addFusionMatch(identityMatch())
                }
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.partial).toBe(1)
            expect(forms.createFusionForm).not.toHaveBeenCalled()
        })

        it('uses operation context to qualify account-list mode for exact matches', async () => {
            const { dispatcher, matchingService, forms, decisionProcessor, run } = createDispatcher({
                isAggregationMode: true,
                configOverrides: { fusionEnableAutoMerge: true, fusionAutoMergeScore: 100 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())

            const assigned = FusionAccount.fromIdentity({ id: 'identity-1', name: 'Identity One', attributes: {} } as any)
            decisionProcessor.processFusionIdentityDecision.mockResolvedValue(assigned)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') fusionAccount.layers.addFusionMatch(identityMatch())
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.exact).toBe(1)
            expect(forms.registerFinishedDecision).toHaveBeenCalled()
        })

        it('processes a large batch when scoring concurrency is capped', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { scoringMaxConcurrency: 5 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: false } }))

            const maxConcurrent = trackMaxConcurrentScoring(matchingService, 'identity')
            const accounts = Array.from({ length: 50 }, (_, index) =>
                managedAccount({
                    id: `acct-${index}`,
                    nativeIdentity: `native-${index}`,
                    name: `Managed Account ${index}`,
                })
            )

            const result = await dispatcher.runMatchSweep(accounts, 50)

            expect(result.processed).toBe(50)
            expect(result.nonMatch).toBe(50)
            expect(maxConcurrent()).toBeLessThanOrEqual(5)
        })

        it('defaults identity scoring concurrency to 12 for large batches', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: false } }))

            const maxConcurrent = trackMaxConcurrentScoring(matchingService, 'identity')
            const accounts = Array.from({ length: 100 }, (_, index) =>
                managedAccount({
                    id: `acct-${index}`,
                    nativeIdentity: `native-${index}`,
                    name: `Managed Account ${index}`,
                })
            )

            const result = await dispatcher.runMatchSweep(accounts, 100)

            expect(result.processed).toBe(100)
            expect(maxConcurrent()).toBeLessThanOrEqual(12)
        })

        it('does not exceed batch slice size when scoring concurrency is higher', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { scoringMaxConcurrency: 12 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: false } }))

            const maxConcurrent = trackMaxConcurrentScoring(matchingService, 'identity')
            const accounts = Array.from({ length: 3 }, (_, index) =>
                managedAccount({
                    id: `acct-${index}`,
                    nativeIdentity: `native-${index}`,
                    name: `Managed Account ${index}`,
                })
            )

            await dispatcher.runMatchSweep(accounts, 3)

            expect(maxConcurrent()).toBeLessThanOrEqual(3)
        })

        it('overlaps identity-phase form dispatch up to fusion parallel cap', async () => {
            const { dispatcher, matchingService, forms, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: {
                    managedAccountsBatchSize: 4,
                    fusionEnableManualReview: true,
                    fusionEnableAutoMerge: false,
                },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: false } }))
            seedReviewers(run)
            stubPartialIdentityMatches(matchingService)
            const maxInFlight = trackMaxConcurrentDispatch(forms)

            const accounts = partialMatchAccounts(8)
            const result = await dispatcher.runMatchSweep(accounts, 8)

            expect(result.partial).toBe(8)
            expect(maxInFlight()).toBeGreaterThan(1)
            expect(maxInFlight()).toBeLessThanOrEqual(4)
        })

        it('caps identity-phase dispatch at 12 when batch size is 100', async () => {
            const { dispatcher, matchingService, forms, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: {
                    managedAccountsBatchSize: 100,
                    fusionEnableManualReview: true,
                    fusionEnableAutoMerge: false,
                },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: false } }))
            seedReviewers(run)
            stubPartialIdentityMatches(matchingService)
            const maxInFlight = trackMaxConcurrentDispatch(forms)

            const accounts = partialMatchAccounts(20)
            const result = await dispatcher.runMatchSweep(accounts, 20)

            expect(result.partial).toBe(20)
            expect(maxInFlight()).toBeGreaterThan(1)
            expect(maxInFlight()).toBeLessThanOrEqual(12)
        })

        it('does not overlap processFusionIdentityDecision for exact matches', async () => {
            const { dispatcher, matchingService, decisionProcessor, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { fusionEnableAutoMerge: true, fusionAutoMergeScore: 100 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: false } }))

            const identityOne = FusionAccount.fromIdentity({
                id: 'identity-1',
                name: 'Identity One',
                attributes: {},
            } as any)
            const identityTwo = FusionAccount.fromIdentity({
                id: 'identity-2',
                name: 'Identity Two',
                attributes: {},
            } as any)
            run.registerFusionAccount(identityOne)
            run.registerFusionAccount(identityTwo)

            let inFlight = 0
            let maxInFlight = 0
            decisionProcessor.processFusionIdentityDecision.mockImplementation(async (decision: { identityId?: string }) => {
                inFlight += 1
                maxInFlight = Math.max(maxInFlight, inFlight)
                await new Promise<void>((resolve) => setImmediate(resolve))
                inFlight -= 1
                const identityId = decision.identityId ?? 'identity-1'
                return FusionAccount.fromIdentity({ id: identityId, name: identityId, attributes: {} } as any)
            })

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    const identityId = fusionAccount.nativeIdentity === 'native-0' ? 'identity-1' : 'identity-2'
                    fusionAccount.layers.addFusionMatch({
                        identityId,
                        identityName: identityId === 'identity-1' ? 'Identity One' : 'Identity Two',
                        candidateType: 'identity',
                        scores: [{ attribute: 'Combined score', algorithm: 'weighted-mean', score: 100, isMatch: true }],
                    })
                }
                return 1
            })

            const accounts = [
                managedAccount({ id: 'acct-0', nativeIdentity: 'native-0', name: 'Managed Account 0' }),
                managedAccount({ id: 'acct-1', nativeIdentity: 'native-1', name: 'Managed Account 1' }),
            ]
            const result = await dispatcher.runMatchSweep(accounts, 2)

            expect(result.exact).toBe(2)
            expect(maxInFlight).toBe(1)
        })

        it('drains deferred candidates sequentially within a source', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { scoringMaxConcurrency: 5 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: true } }))

            const maxDeferredConcurrent = trackMaxConcurrentScoring(matchingService, 'deferred')
            const accounts = Array.from({ length: 20 }, (_, index) =>
                managedAccount({
                    id: `acct-${index}`,
                    nativeIdentity: `native-${index}`,
                    name: `Managed Account ${index}`,
                })
            )

            const result = await dispatcher.runMatchSweep(accounts, 20)

            expect(result.processed).toBe(20)
            expect(maxDeferredConcurrent()).toBeLessThanOrEqual(1)
        })

        it('drains deferred candidates in parallel across sources while staying sequential within each source', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: true } }))
            run.sourcesByName.set('Source B', sourceInfo({ id: 'source-b-id', name: 'Source B', config: { deferredMatching: true } }))

            const inFlightBySource = new Map<string, number>()
            const maxInFlightBySource = new Map<string, number>()
            let totalDeferredInFlight = 0
            let maxTotalDeferredInFlight = 0

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType !== 'deferred') return 0
                const source = fusionAccount.sourceName ?? ''
                inFlightBySource.set(source, (inFlightBySource.get(source) ?? 0) + 1)
                maxInFlightBySource.set(source, Math.max(maxInFlightBySource.get(source) ?? 0, inFlightBySource.get(source)!))
                totalDeferredInFlight += 1
                maxTotalDeferredInFlight = Math.max(maxTotalDeferredInFlight, totalDeferredInFlight)
                await new Promise((resolve) => setTimeout(resolve, 10))
                inFlightBySource.set(source, (inFlightBySource.get(source) ?? 1) - 1)
                totalDeferredInFlight -= 1
                return 0
            })

            const sourceAAccounts = [
                managedAccount({ id: 'a1', nativeIdentity: 'a1', name: 'A1' }),
                managedAccount({ id: 'a2', nativeIdentity: 'a2', name: 'A2' }),
            ]
            const sourceBAccounts = [
                managedAccount({ sourceId: 'source-b-id', sourceName: 'Source B', id: 'b1', nativeIdentity: 'b1', name: 'B1' }),
                managedAccount({ sourceId: 'source-b-id', sourceName: 'Source B', id: 'b2', nativeIdentity: 'b2', name: 'B2' }),
            ]

            await dispatcher.runMatchSweep([...sourceAAccounts, ...sourceBAccounts], 4)

            expect(maxInFlightBySource.get('Source A')).toBeLessThanOrEqual(1)
            expect(maxInFlightBySource.get('Source B')).toBeLessThanOrEqual(1)
            expect(maxTotalDeferredInFlight).toBeGreaterThan(1)
        })

        it('only includes deferred candidates from the same source', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: true } }))
            run.sourcesByName.set('Source B', sourceInfo({ id: 'source-b-id', name: 'Source B', config: { deferredMatching: true } }))

            const sourceACandidate = FusionAccount.fromManagedAccount({
                id: 'acct-a',
                nativeIdentity: 'native-a',
                name: 'Source A Candidate',
                sourceId: SOURCE_ID,
                sourceName: SOURCE_NAME,
                attributes: {},
            } as any)
            sourceACandidate.collections.statuses.setNonMatched(sourceACandidate.name, sourceACandidate.sourceName)
            run.registerFusionAccount(sourceACandidate)
            run.registerDeferredCandidate(sourceACandidate)

            const sourceBCandidate = FusionAccount.fromManagedAccount({
                id: 'acct-b-candidate',
                nativeIdentity: 'native-b-candidate',
                name: 'Source B Candidate',
                sourceId: 'source-b-id',
                sourceName: 'Source B',
                attributes: {},
            } as any)
            sourceBCandidate.collections.statuses.setNonMatched(sourceBCandidate.name, sourceBCandidate.sourceName)
            run.registerFusionAccount(sourceBCandidate)
            run.registerFinalizedDeferredCandidate(sourceBCandidate)

            const deferredCandidateSources: string[][] = []
            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (_account, candidates, candidateType) => {
                if (candidateType === 'deferred') {
                    deferredCandidateSources.push(
                        Array.from(candidates).map((candidate) => candidate.sourceName ?? '')
                    )
                }
                return Array.from(candidates).length
            })

            await dispatcher.runMatchSweep(
                [managedAccount({ sourceId: 'source-b-id', sourceName: 'Source B', id: 'acct-b', nativeIdentity: 'native-b', name: 'Source B Account' })],
                1
            )

            expect(deferredCandidateSources).toEqual([['Source B']])
        })
    })

    describe('runMatchSweep analysis-only', () => {
        it('scores accounts without applying outcomes or mutating the work queue', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ config: { deferredMatching: true } }))

            const previousNonMatch = FusionAccount.fromManagedAccount({
                id: 'acct-prev',
                nativeIdentity: 'native-prev',
                name: 'Previous Non Match',
                sourceId: SOURCE_ID,
                sourceName: SOURCE_NAME,
                attributes: {},
            } as any)
            previousNonMatch.collections.statuses.setNonMatched(previousNonMatch.name, previousNonMatch.sourceName)
            run.registerFusionAccount(previousNonMatch)
            run.registerFinalizedDeferredCandidate(previousNonMatch)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'deferred') {
                    fusionAccount.layers.addFusionMatch(deferredMatch({ fusionIdentity: previousNonMatch }))
                }
                return 1
            })

            const account = managedAccount()
            const result = await dispatcher.runMatchSweep([account], 1, { mode: MatchSweepMode.AnalysisOnly })

            expect(result.resolved).toHaveLength(1)
            expect(result.resolved[0].resolution).toBe('deferred-match')
            expect(run.getFusionAccountByManagedKey('source-a-id::native-1')).toBeUndefined()
            expect(run.managedAccountsById.has('source-a-id::native-1')).toBe(false)
        })
    })
})




