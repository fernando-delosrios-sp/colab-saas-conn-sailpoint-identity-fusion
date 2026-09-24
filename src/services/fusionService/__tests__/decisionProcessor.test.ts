import { DecisionProcessor } from '../decisionProcessor'
import { FusionRun } from '../../../model/fusionRun'
import { LogService } from '../../logService'
import { FusionAccount } from '../../../model/account'
import { StatusEntitlement } from '../../../model/statusEntitlement'
import { FusionConfig } from '../../../model/config'
import { AccountV2025 as Account } from 'sailpoint-api-client'

describe('DecisionProcessor', () => {
    let run: FusionRun
    let log: LogService
    let processor: DecisionProcessor

    beforeEach(() => {
        run = new FusionRun()
        log = new LogService({ spConnDebugLoggingEnabled: false })
        run.log = log
        FusionAccount.configure({ sources: [] } as any)

        processor = new DecisionProcessor({} as FusionConfig, log, run, {
            forms: { fetchFormData: vi.fn().mockResolvedValue(undefined) } as any,
            identities: {} as any,
            correlationManager: {} as any,
            definitionService: {} as any,
            mappingService: {} as any,
            accountAssembly: {} as any,
        })
    })

    it('reconcilePendingFormState clears stale candidate status and re-applies for pending ids', () => {
        const account = FusionAccount.fromManagedAccount({
            id: 'acct-1',
            name: 'User One',
            sourceId: 'src-1',
            nativeIdentity: 'native-1',
            sourceName: 'Source 1',
            attributes: {},
        } as Account)
        account.collections.statuses.add(StatusEntitlement.Candidate, 'stale')
        account.setIdentityIdAttribute('identity-pending')
        run.registerFusionAccount(account)
        run.pendingCandidateIdentityIds.add('identity-pending')

        processor.reconcilePendingFormState()

        expect(account.statuses).toContain(StatusEntitlement.Candidate)
    })

    it('reconcilePendingFormState removes candidate status when not pending', () => {
        const account = FusionAccount.fromManagedAccount({
            id: 'acct-2',
            name: 'User Two',
            sourceId: 'src-1',
            nativeIdentity: 'native-2',
            sourceName: 'Source 1',
            attributes: {},
        } as Account)
        account.collections.statuses.add(StatusEntitlement.Candidate, 'was candidate')
        account.setIdentityIdAttribute('identity-done')
        run.registerFusionAccount(account)

        processor.reconcilePendingFormState()

        expect(account.statuses).not.toContain(StatusEntitlement.Candidate)
    })

    it('normalizePendingFormStateForOutput fetches forms then reconciles', async () => {
        const forms = { fetchFormData: vi.fn().mockResolvedValue(undefined) }
        processor = new DecisionProcessor({} as FusionConfig, log, run, {
            forms: forms as any,
            identities: {} as any,
            correlationManager: {} as any,
            definitionService: {} as any,
            mappingService: {} as any,
            accountAssembly: {} as any,
        })

        await processor.normalizePendingFormStateForOutput()

        expect(forms.fetchFormData).toHaveBeenCalled()
    })

    it('processes an authorized merge still sitting in the work queue when no Fusion account exists', async () => {
        const managedKey = 'src-ad::CN=OAM Edward Bakers'
        const assembleAccount = vi.fn().mockResolvedValue(undefined)
        const registerFusionAccount = vi.fn()
        const applyPerSourceCorrelationIfNeeded = vi.fn().mockResolvedValue(undefined)
        processor = new DecisionProcessor({} as FusionConfig, log, run, {
            forms: { fetchFormData: vi.fn() } as any,
            identities: {
                getIdentityById: vi.fn().mockReturnValue({
                    id: 'identity-edward',
                    name: 'Edward Baker',
                    attributes: {},
                }),
            } as any,
            correlationManager: { applyPerSourceCorrelationIfNeeded } as any,
            definitionService: {} as any,
            mappingService: {} as any,
            accountAssembly: {
                assembleAccount,
                registerFusionAccount,
                isAggregationAccountListMode: () => true,
            } as any,
        })

        run.setManagedAccount(managedKey, {
            id: 'acct-bakers',
            name: 'oam.bakers',
            sourceId: 'src-ad',
            nativeIdentity: 'CN=OAM Edward Bakers',
            sourceName: 'AD',
            attributes: {},
        } as Account)
        run.addFinishedFusionDecision({
            submitter: { id: 'reviewer-1', email: 'r@example.com', name: 'Reviewer' },
            account: {
                id: managedKey,
                name: 'oam.bakers',
                sourceName: 'AD',
                sourceId: 'src-ad',
                nativeIdentity: 'CN=OAM Edward Bakers',
            },
            newIdentity: false,
            identityId: 'identity-edward',
            comments: 'Merge',
            finished: true,
            sourceType: 'orphan' as any,
        })

        const applied = await processor.processFusionIdentityDecisions()

        expect(applied).toHaveLength(1)
        expect(applyPerSourceCorrelationIfNeeded).toHaveBeenCalledWith(
            expect.any(FusionAccount),
            expect.objectContaining({ identityId: 'identity-edward', newIdentity: false }),
            'merge'
        )
        expect(registerFusionAccount).toHaveBeenCalled()
    })

    it('does not reprocess an authorized merge after the managed account left the work queue', async () => {
        const assembleAccount = vi.fn().mockResolvedValue(undefined)
        processor = new DecisionProcessor({} as FusionConfig, log, run, {
            forms: { fetchFormData: vi.fn() } as any,
            identities: { getIdentityById: vi.fn() } as any,
            correlationManager: { applyPerSourceCorrelationIfNeeded: vi.fn() } as any,
            definitionService: {} as any,
            mappingService: {} as any,
            accountAssembly: {
                assembleAccount,
                registerFusionAccount: vi.fn(),
                isAggregationAccountListMode: () => true,
            } as any,
        })
        run.addFinishedFusionDecision({
            submitter: { id: 'reviewer-1', email: 'r@example.com', name: 'Reviewer' },
            account: { id: 'src-ad::already-claimed', name: 'claimed', sourceName: 'AD' },
            newIdentity: false,
            identityId: 'identity-1',
            comments: '',
            finished: true,
        })

        const applied = await processor.processFusionIdentityDecisions()

        expect(applied).toHaveLength(0)
        expect(assembleAccount).not.toHaveBeenCalled()
    })
})
