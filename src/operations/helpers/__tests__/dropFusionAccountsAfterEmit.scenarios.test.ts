import { createOperationTestRegistry } from '../../__tests__/harness/operationTestRegistry'
import { processPhase, outputPhase } from '../accountListPhases'
import { FusionRun } from '../../../model/fusionRun'
import { FusionAccount } from '../../../model/account'
import { createMatchCandidateRecord } from '../../../model/matchCandidateRecord'
import { MatchingService } from '../../../services/matchingService/matchingService'
import { buildCandidateList } from '../../../services/formService/helpers'
import { fusionReportMatchCandidateAccountFields } from '../../../services/fusionService/helpers'
import { MatchCandidateType } from '../../../services/matchingService/types'
import { FusionConfig } from '../../../model/config'
import { LogService } from '../../../services/logService'

const testConfig = {
    sources: [{ name: 'HR', id: 'src-hr', type: 'authoritative' }],
    fusionAccountRefreshThresholdInSeconds: 3600,
    maxHistoryMessages: 10,
} as unknown as FusionConfig

FusionAccount.configure(testConfig)

function makeTestIdentity(id: string, name: string = id) {
    return FusionAccount.fromIdentity({ id, name } as any)
}

function makeTestManagedAccount(id: string, name: string = id) {
    return FusionAccount.fromManagedAccount({
        id,
        name,
        sourceId: 'src-hr',
        sourceName: 'HR',
        nativeIdentity: id,
    } as any)
}

describe('drop-fusion-accounts-after-emit delta spec scenarios', () => {
    describe('Scenario: Early emission disabled by default', () => {
        it('retains all fusion accounts through Phase 3 and Phase 4 and streams them during Phase 5 (Output)', async () => {
            const registry = createOperationTestRegistry()
            registry.config.fusionDropAccountsAfterEmit = false

            const fusion = registry.fusion as any
            const emitSpy = vi.spyOn(fusion, 'emitEligibleAccounts')
            const clearSpy = vi.spyOn(fusion, 'clearEmittedFusionAccounts')

            const testAccount = { key: { simple: { id: 'acct-1' } }, attributes: {}, disabled: false }
            vi.spyOn(fusion, 'forEachISCAccount').mockImplementation(async (send: (account: unknown) => Promise<void>) => {
                await send(testAccount)
                return { sent: 1, eligible: 1 }
            })

            const streamProgress = { sent: 0 }
            await processPhase(registry, {
                isPersistent: false,
                streamProgress,
                allowEarlyAccountEmission: true,
            })

            // No early emission in processPhase
            expect(emitSpy).not.toHaveBeenCalled()
            expect(clearSpy).not.toHaveBeenCalled()
            expect(streamProgress.sent).toBe(0)

            // Streamed in Phase 5
            const outputCount = await outputPhase(registry, {
                isPersistent: false,
                streamProgress,
            })
            expect(outputCount).toBe(1)
            expect(registry.res.send).toHaveBeenCalledWith(testAccount)
        })
    })

    describe('Scenario: Early emission streams accounts during identity processing', () => {
        it('streams ISCAccount immediately and drops full FusionAccount instances before the match sweep', async () => {
            const registry = createOperationTestRegistry()
            registry.config.fusionDropAccountsAfterEmit = true

            const earlyAccount = { key: { simple: { id: 'early-100' } }, attributes: {}, disabled: false }
            const fusion = registry.fusion as any
            const emitSpy = vi.spyOn(fusion, 'emitEligibleAccounts').mockImplementation(
                async (send: (account: unknown) => Promise<void>) => {
                    await send(earlyAccount)
                    return 1
                }
            )
            const clearSpy = vi.spyOn(fusion, 'clearEmittedFusionAccounts').mockReturnValue(1)

            const streamProgress = { sent: 0 }
            await processPhase(registry, {
                isPersistent: false,
                streamProgress,
                allowEarlyAccountEmission: true,
            })

            expect(registry.res.send).toHaveBeenCalledWith(earlyAccount)
            expect(streamProgress.sent).toBe(1)
            expect(emitSpy).toHaveBeenCalled()
            expect(clearSpy).toHaveBeenCalled()
            expect(clearSpy.mock.invocationCallOrder[0]).toBeLessThan(
                (fusion.processUncorrelatedManagedAccounts as any).mock.invocationCallOrder[0]
            )
        })
    })

    describe('Scenario: Early emission re-emits auto-matched accounts', () => {
        it('re-fetches identity from ISC API, re-assembles fusion account, and streams updated ISCAccount', async () => {
            const registry = createOperationTestRegistry()
            registry.config.fusionDropAccountsAfterEmit = true

            const updatedAccount = makeTestIdentity('identity-auto-1')
            const iscOutput = { key: { simple: { id: 'identity-auto-1' } }, attributes: { email: 'updated@test.com' }, disabled: false }

            const fusion = registry.fusion as any
            fusion.getISCAccount = vi.fn().mockResolvedValue(iscOutput)

            expect(registry.matchOutcomeDispatcher).toBeDefined()
            const emitUpdatedAccount = (registry.matchOutcomeDispatcher as any).deps.emitUpdatedAccount
            expect(emitUpdatedAccount).toBeDefined()

            await emitUpdatedAccount(updatedAccount)

            expect(fusion.getISCAccount).toHaveBeenCalledWith(updatedAccount, true)
            expect(registry.res.send).toHaveBeenCalledWith(iscOutput)
            expect(registry.run.isFusionAccountEmitted(updatedAccount)).toBe(true)
        })
    })

    describe('Scenario: Candidate roster indexes projected candidate records', () => {
        it('stores MatchCandidateRecord projections rather than requiring full FusionAccount instances', () => {
            const run = new FusionRun()
            const log = new LogService({ spConnDebugLoggingEnabled: false })
            const config = {
                ...testConfig,
                matchingConfigs: [{ attribute: 'email', algorithm: 'binary', mandatory: true, fusionScore: 100 }],
            } as any
            const matchingService = new MatchingService(config, log, run)

            const candidate1 = createMatchCandidateRecord('cand-1', 'Candidate One', { email: 'cand1@test.com' })
            const fullAccount = FusionAccount.fromIdentity({
                id: 'cand-2',
                name: 'Candidate Two',
                attributes: { email: 'cand2@test.com' },
            } as any)

            matchingService.buildTrigramIndex([candidate1, fullAccount])

            expect(run.blockingIdentityRoster.length).toBe(2)
            expect(run.blockingIdentityRoster[0].identityId).toBe('cand-1')
            expect(run.blockingIdentityRoster[1].identityId).toBe('cand-2')
            expect(run.blockingIdentityRoster[0].attributes.email).toBe('cand1@test.com')
            expect(run.blockingIdentityRoster[1].attributes.email).toBe('cand2@test.com')
        })
    })

    describe('Scenario: Candidate records provide attributes for matching, forms, and reporting', () => {
        it('exposes identityId, identityName, and attributes on FusionMatch for forms and reports without secondary API calls', () => {
            const fusionAccount = makeTestManagedAccount('managed-1')
            const candidateRecord = createMatchCandidateRecord('id-100', 'Jane Doe', {
                email: 'jane@example.com',
                department: 'Engineering',
            })

            fusionAccount.layers.addFusionMatch({
                identityId: candidateRecord.identityId,
                identityName: candidateRecord.identityName,
                candidateType: MatchCandidateType.Identity,
                scores: [{ attribute: 'email', algorithm: 'binary', fusionScore: 100, score: 100, isMatch: true, mandatory: true }],
                attributes: candidateRecord.attributes,
            })

            const candidates = buildCandidateList(fusionAccount, 5)
            expect(candidates.length).toBe(1)
            expect(candidates[0].id).toBe('id-100')
            expect(candidates[0].name).toBe('Jane Doe')
            expect(candidates[0].attributes.department).toBe('Engineering')

            const match = fusionAccount.fusionMatches[0]
            const reportFields = fusionReportMatchCandidateAccountFields(match)
            expect(reportFields.accountId).toBe('id-100')
            expect(reportFields.accountName).toBe('Jane Doe')
        })
    })

    describe('Memory release and clean heap profile when toggle is enabled', () => {
        it('drops full FusionAccount instances from run maps while retaining only compact candidate records', () => {
            const run = new FusionRun()
            const account1 = FusionAccount.fromIdentity({
                id: 'id-1',
                name: 'Identity One',
                attributes: { email: 'one@test.com', largeBlob: 'x'.repeat(1000) },
            } as any)

            const account2 = FusionAccount.fromIdentity({
                id: 'id-2',
                name: 'Identity Two',
                attributes: { email: 'two@test.com', largeBlob: 'y'.repeat(1000) },
            } as any)

            run.registerFusionAccount(account1)
            run.registerFusionAccount(account2)
            expect(run.totalFusionAccountCount).toBe(2)

            run.markFusionAccountEmitted(account1, account1.managedKey)
            run.markFusionAccountEmitted(account2, account2.managedKey)

            const cleared = run.clearEmittedFusionAccounts()
            expect(cleared).toBe(2)
            expect(run.totalFusionAccountCount).toBe(0)

            const candidateRecord = createMatchCandidateRecord(account1.identityId!, account1.identityName, { email: 'one@test.com' })
            run.blockingIdentityRoster = [candidateRecord]

            expect(run.blockingIdentityRoster.length).toBe(1)
            expect(run.blockingIdentityRoster[0].identityId).toBe('id-1')
            expect(run.blockingIdentityRoster[0].attributes).not.toHaveProperty('largeBlob')
        })
    })
})
