import { StandardCommand } from '@sailpoint/connector-sdk'
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAccount } from '../../../model/account'
import { FusionConfig, SourceType } from '../../../model/config'
import { FusionRun } from '../../../model/fusionRun'
import { AggregationTracker } from '../../../model/aggregationTracker'
import { OperationContext } from '../../../model/operationContext'
import { AccountAssembly } from '../../accountAssembly'
import { MatchingService } from '../matchingService'
import { MatchOutcomeDispatcher } from '../matchOutcomeDispatcher'
import { createAutomaticAssignmentDecision } from '../../formService/helpers'
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
        operationContext?: OperationContext
        configOverrides?: Partial<FusionConfig>
        tracker?: AggregationTracker
    } = {}) {
        const config = {
            sources: [],
            fusionFormAttributes: ['email', 'firstName', 'lastName'],
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
        } as any
        const run = new FusionRun(log)
        const matchingService = new MatchingService(config, log)
        const mappingService = { mapAttributes: vi.fn((account) => account) } as any
        const definitionService = {
            refreshNormalAttributes: vi.fn().mockResolvedValue(undefined),
            refreshReverseCorrelationAttributes: vi.fn(),
            registerUniqueAttributes: vi.fn().mockResolvedValue(undefined),
        } as any
        const sources = { managedAccountsAllById: new Map() } as any
        const accountAssembly = new AccountAssembly({
            run,
            sources,
            mappingService,
            definitionService,
            log,
            config,
            commandType: options.commandType,
            operationContext: options.operationContext,
        })
        const forms = {
            createFusionForm: vi.fn().mockResolvedValue({
                formDefinitionReady: true,
                newReviewInstancesQueued: 1,
            }),
            registerFinishedDecision: vi.fn(),
            createAutomaticAssignmentDecision,
        } as any
        const correlationManager = { applyPerSourceCorrelationIfNeeded: vi.fn().mockResolvedValue(undefined) } as any
        const decisionProcessor = { processFusionIdentityDecision: vi.fn().mockResolvedValue(undefined) }

        const dispatcher = new MatchOutcomeDispatcher({
            config,
            log,
            run,
            matchingService,
            correlationManager,
            definitionService,
            accountAssembly,
            forms,
            decisionProcessor,
            commandType: options.commandType,
            operationContext: options.operationContext,
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
            correlationManager,
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

    function deferredMatch(scores: any[] = []): any {
        return {
            identityId: '',
            identityName: 'Current operation non-match',
            candidateType: 'deferred',
            scores: scores.length > 0 ? scores : [{ attribute: 'name', algorithm: 'jaro-winkler', score: 92, isMatch: true }],
        }
    }

    describe('runMatchSweep', () => {
        it('dispatches an exact match to automatic assignment when the combined score meets the threshold', async () => {
            const { dispatcher, matchingService, forms, decisionProcessor, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
                configOverrides: { fusionEnableAutoAssignment: true, fusionAutoAssignmentScore: 100 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            const identity = FusionAccount.fromIdentity({ id: 'identity-1', name: 'Identity One', attributes: {} } as any)
            run.registerFusionAccount(identity)

            const assigned = FusionAccount.fromIdentity({ id: 'identity-1', name: 'Identity One', attributes: {} } as any)
            decisionProcessor.processFusionIdentityDecision.mockResolvedValue(assigned)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.addFusionMatch(identityMatch())
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
                    automaticAssignment: true,
                })
            )
            expect(decisionProcessor.processFusionIdentityDecision).toHaveBeenCalled()
            expect(run.autoAssignedIdentityIds.has('identity-1')).toBe(true)
        })

        it('dispatches a partial match to a review form when auto-assignment is disabled', async () => {
            const { dispatcher, matchingService, forms, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(SOURCE_ID, new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)]))

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.addFusionMatch({
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
            expect(forms.createFusionForm).toHaveBeenCalledWith(expect.any(FusionAccount), expect.any(Set))
        })

        it('dispatches a deferred match by claiming the account from the work queue', async () => {
            const { dispatcher, matchingService, log, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ sourceType: SourceType.Authoritative, config: { deferredMatching: true } }))
            const previousNonMatch = FusionAccount.fromManagedAccount({
                id: 'acct-prev',
                nativeIdentity: 'native-prev',
                name: 'Previous Non Match',
                sourceId: SOURCE_ID,
                sourceName: SOURCE_NAME,
                attributes: {},
            } as any)
            previousNonMatch.setNonMatched()
            run.registerFusionAccount(previousNonMatch)
            run.registerDeferredCandidate(previousNonMatch)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') return 0
                if (candidateType === 'deferred') {
                    fusionAccount.addFusionMatch(deferredMatch())
                }
                return 1
            })

            const account = managedAccount({ id: 'acct-new', nativeIdentity: 'native-new', name: 'New Account' })
            run.managedAccountsById.set('source-a-id::native-new', account)

            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.deferred).toBe(1)
            expect(run.managedAccountsById.has('source-a-id::native-new')).toBe(false)
            expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/DEFERRED .*MATCH FOUND/))
        })

        it('dispatches a non-match by registering an authoritative fusion account', async () => {
            const { dispatcher, matchingService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())

            vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const account = managedAccount()
            const result = await dispatcher.runMatchSweep([account], 1)

            expect(result.nonMatch).toBe(1)
            expect(result.resolved[0].fusionAccount.statuses).toContain('nonMatched')
            expect(run.getFusionAccountByManagedKey('source-a-id::native-1')).toBeDefined()
        })

        it('treats accounts from sources without reviewers as non-matches', async () => {
            const { dispatcher, matchingService, forms, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.sourcesWithoutReviewers.add(SOURCE_NAME)

            const scoreSpy = vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.nonMatch).toBe(1)
            expect(scoreSpy).not.toHaveBeenCalled()
            expect(forms.createFusionForm).not.toHaveBeenCalled()
        })

        it('handles record sources by registering unique attributes without creating a fusion account', async () => {
            const { dispatcher, matchingService, definitionService, run } = createDispatcher({
                commandType: StandardCommand.StdAccountList,
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo({ sourceType: SourceType.Record, config: {} }))

            vi.spyOn(matchingService, 'scoreFusionAccount').mockResolvedValue(0)

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.nonMatch).toBe(1)
            expect(definitionService.registerUniqueAttributes).toHaveBeenCalledWith(expect.any(FusionAccount))
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
                configOverrides: { fusionEnableAutoAssignment: true, fusionAutoAssignmentScore: 100 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())
            run.reviewersBySourceId.set(SOURCE_ID, new Set([FusionAccount.fromIdentity({ id: 'rev-1', name: 'Reviewer', attributes: {} } as any)]))

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') {
                    fusionAccount.addFusionMatch({
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
                    fusionAccount.addFusionMatch(identityMatch())
                }
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.partial).toBe(1)
            expect(forms.createFusionForm).not.toHaveBeenCalled()
        })

        it('uses operation context to qualify account-list mode for exact matches', async () => {
            const { dispatcher, matchingService, forms, decisionProcessor, run } = createDispatcher({
                operationContext: OperationContext.AccountList,
                configOverrides: { fusionEnableAutoAssignment: true, fusionAutoAssignmentScore: 100 },
            })
            run.sourcesByName.set(SOURCE_NAME, sourceInfo())

            const assigned = FusionAccount.fromIdentity({ id: 'identity-1', name: 'Identity One', attributes: {} } as any)
            decisionProcessor.processFusionIdentityDecision.mockResolvedValue(assigned)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'identity') fusionAccount.addFusionMatch(identityMatch())
                return 1
            })

            const result = await dispatcher.runMatchSweep([managedAccount()], 1)

            expect(result.exact).toBe(1)
            expect(forms.registerFinishedDecision).toHaveBeenCalled()
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
            sourceACandidate.setNonMatched()
            run.registerFusionAccount(sourceACandidate)
            run.registerDeferredCandidate(sourceACandidate)

            const deferredSizes: number[] = []
            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (_account, candidates, candidateType) => {
                const n = Array.from(candidates).length
                if (candidateType === 'deferred') deferredSizes.push(n)
                return n
            })

            await dispatcher.runMatchSweep(
                [managedAccount({ sourceId: 'source-b-id', sourceName: 'Source B', id: 'acct-b', nativeIdentity: 'native-b', name: 'Source B Account' })],
                1
            )

            expect(deferredSizes).toEqual([0])
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
            previousNonMatch.setNonMatched()
            run.registerFusionAccount(previousNonMatch)
            run.registerDeferredCandidate(previousNonMatch)

            vi.spyOn(matchingService, 'scoreFusionAccount').mockImplementation(async (fusionAccount, _pool, candidateType) => {
                if (candidateType === 'deferred') {
                    fusionAccount.addFusionMatch(deferredMatch())
                }
                return 1
            })

            const account = managedAccount()
            const result = await dispatcher.runMatchSweep([account], 1, { analysisOnly: true })

            expect(result.resolved).toHaveLength(1)
            expect(result.resolved[0].resolution).toBe('deferred-match')
            expect(run.getFusionAccountByManagedKey('source-a-id::native-1')).toBeUndefined()
            expect(run.managedAccountsById.has('source-a-id::native-1')).toBe(false)
        })
    })
})
