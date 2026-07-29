import { createFusionServiceTestContext, seedRunInventory, type FusionServiceTestContext } from './fusionService.testFixtures'
import { FusionAccount } from '../../../model/account'
import { StatusEntitlement } from '../../../model/statusEntitlement'
import { AggregationTracker } from '../aggregationTracker'
import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionService } from '../fusionService'
import { StandardCommand } from '@sailpoint/connector-sdk'

describe('FusionService — decisions', () => {
    let ctx: FusionServiceTestContext

    beforeEach(() => {
        ctx = createFusionServiceTestContext()
    })

    describe('processFusionIdentityDecision sourceType branches', () => {
        it('updates the existing fusion identity account for authorized decisions', async () => {
            const existingIdentity = {
                id: 'identity-1',
                name: 'Existing Identity',
                accounts: [],
                attributes: {},
            } as unknown as IdentityDocument
            const existingFusionAccount = FusionAccount.fromIdentity(existingIdentity)
            existingFusionAccount.setNonMatched()
            ctx.fusionService.setFusionAccount(existingFusionAccount)

            const managedAccount = {
                id: 'acct-authz-existing-1',
                name: 'LH2 User',
                sourceId: 'src-lh2',
                nativeIdentity: 'lh2-authz-existing',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedKey = 'src-lh2::lh2-authz-existing'
            const managedMap = new Map<string, Account>([[managedKey, managedAccount]])

            vi.spyOn(ctx.mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(ctx.mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(ctx.run, new Map([[managedKey, managedAccount]]))
            ctx.mockMappingService.mapAttributes.mockImplementation((account) => account)
            ctx.mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            ctx.mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            ctx.mockIdentities.correlateAccounts.mockResolvedValue(true)
            vi.spyOn(ctx.mockSources, 'getSourceConfig').mockReturnValue({
                name: 'LH2',
                correlationMode: 'correlate',
                sourceType: 'authoritative',
            } as any)

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKey,
                    name: 'LH2 User',
                    sourceName: 'LH2',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'lh2-authz-existing',
                },
                newIdentity: false,
                identityId: 'identity-1',
                comments: 'Assign into existing identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            const result = await ctx.fusionService.processFusionIdentityDecision(decision)

            expect(result).toBe(existingFusionAccount)
            expect(result?.needsReset).toBe(false)
            expect(result?.statuses).toContain('authorized')
            expect(result?.statuses).not.toContain('auto')
            expect(result?.statuses).not.toContain('nonMatched')
            expect(result?.history.some((h) => h.includes('into existing identity by Reviewer'))).toBe(true)
            expect(result?.history.some((h) => h.includes('Associated managed account LH2 User [LH2]'))).toBe(false)
            expect(ctx.mockIdentities.correlateAccounts).toHaveBeenCalledWith(existingFusionAccount, [managedKey], 'merge')
            expect(ctx.fusionService.getFusionIdentity('identity-1')).toBe(existingFusionAccount)
        })

        it('writes auto-merge history for system automatic-assignment decisions', async () => {
            const existingIdentity = {
                id: 'identity-2',
                name: 'Existing Identity Two',
                accounts: [],
                attributes: {},
            } as unknown as IdentityDocument
            const existingFusionAccount = FusionAccount.fromIdentity(existingIdentity)
            ctx.fusionService.setFusionAccount(existingFusionAccount)

            const managedAccount = {
                id: 'acct-auto-1',
                name: 'LH2 User',
                sourceId: 'src-lh2',
                nativeIdentity: 'lh2-auto',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedKeyAuto = 'src-lh2::lh2-auto'
            const managedMap = new Map<string, Account>([[managedKeyAuto, managedAccount]])

            vi.spyOn(ctx.mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(ctx.mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(ctx.run, new Map([[managedKeyAuto, managedAccount]]))
            ctx.mockMappingService.mapAttributes.mockImplementation((account) => account)
            ctx.mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            ctx.mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            ctx.mockIdentities.correlateAccounts.mockResolvedValue(true)
            vi.spyOn(ctx.mockSources, 'getSourceConfig').mockReturnValue({
                name: 'LH2',
                correlationMode: 'none',
                sourceType: 'authoritative',
            } as any)

            const decision = {
                submitter: { id: 'system', email: '', name: 'System (automatic merge)' },
                account: {
                    id: managedKeyAuto,
                    name: 'LH2 User',
                    sourceName: 'LH2',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'lh2-auto',
                },
                newIdentity: false,
                identityId: 'identity-2',
                comments: 'Automatically assigned: exact attribute match (all rules 100, none skipped)',
                finished: true,
                sourceType: 'authoritative',
                automaticMerge: true,
            } as any

            const result = await ctx.fusionService.processFusionIdentityDecision(decision)
            expect(result?.statuses).toContain('auto')
            expect(result?.statuses).not.toContain('authorized')
            expect(result?.history.some((h) => h.includes('Auto-merged LH2 User [LH2] into existing identity'))).toBe(
                true
            )
            expect(result?.history.some((h) => h.includes('Associated managed account LH2 User [LH2]'))).toBe(false)
            expect(ctx.mockIdentities.correlateAccounts).not.toHaveBeenCalled()
        })

        it('system automatic merge still PATCHes accounts when source correlationMode is correlate', async () => {
            const existingIdentity = {
                id: 'identity-auto-corr',
                name: 'Identity Auto Corr',
                accounts: [],
                attributes: {},
            } as unknown as IdentityDocument
            const existingFusionAccount = FusionAccount.fromIdentity(existingIdentity)
            ctx.fusionService.setFusionAccount(existingFusionAccount)

            const managedAccount = {
                id: 'acct-auto-corr-1',
                name: 'User',
                sourceId: 'src-lh2',
                nativeIdentity: 'lh2-auto-corr',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedKeyAutoCorr = 'src-lh2::lh2-auto-corr'
            const managedMap = new Map<string, Account>([[managedKeyAutoCorr, managedAccount]])

            vi.spyOn(ctx.mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(ctx.mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(ctx.run, new Map([[managedKeyAutoCorr, managedAccount]]))
            ctx.mockMappingService.mapAttributes.mockImplementation((account) => account)
            ctx.mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            ctx.mockIdentities.getIdentityById.mockReturnValue(existingIdentity)
            ctx.mockIdentities.correlateAccounts.mockResolvedValue(true)
            vi.spyOn(ctx.mockSources, 'getSourceConfig').mockReturnValue({
                name: 'LH2',
                correlationMode: 'correlate',
                sourceType: 'authoritative',
            } as any)

            const decision = {
                submitter: { id: 'system', email: '', name: 'System (automatic merge)' },
                account: {
                    id: managedKeyAutoCorr,
                    name: 'User',
                    sourceName: 'LH2',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'lh2-auto-corr',
                },
                newIdentity: false,
                identityId: 'identity-auto-corr',
                comments: 'Automatically assigned: exact attribute match (all rules 100, none skipped)',
                finished: true,
                sourceType: 'authoritative',
                automaticMerge: true,
            } as any

            await ctx.fusionService.processFusionIdentityDecision(decision)
            expect(ctx.mockIdentities.correlateAccounts).toHaveBeenCalledWith(
                expect.any(FusionAccount),
                [managedKeyAutoCorr],
                'merge'
            )
        })

        it('suppresses generic association history for authorized decisions without identityId', async () => {
            const managedAccount = {
                id: 'acct-authz-no-id-1',
                name: 'LH2 User',
                sourceId: 'src-lh2',
                nativeIdentity: 'lh2-authz-noid',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const managedKeyNoId = 'src-lh2::lh2-authz-noid'
            const managedMap = new Map<string, Account>([[managedKeyNoId, managedAccount]])

            vi.spyOn(ctx.mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(ctx.mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(ctx.run, new Map([[managedKeyNoId, managedAccount]]))
            ctx.mockMappingService.mapAttributes.mockImplementation((account) => account)
            ctx.mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKeyNoId,
                    name: 'LH2 User',
                    sourceName: 'LH2',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'lh2-authz-noid',
                },
                newIdentity: false,
                identityId: undefined,
                comments: 'Assign into existing identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            const result = await ctx.fusionService.processFusionIdentityDecision(decision)
            expect(result?.history.some((h) => h.includes('into existing identity by Reviewer'))).toBe(true)
            expect(result?.history.some((h) => h.includes('Associated managed account LH2 User [LH2]'))).toBe(false)
        })

        it('correlates accounts for authorized decisions to the selected identity in the same ctx.run', async () => {
            const managedAccount = {
                id: 'acct-authz-1',
                name: 'Authorized User',
                sourceId: 'src-auth-src',
                nativeIdentity: 'auth-src-native-1',
                sourceName: 'Authoritative Source',
                attributes: {},
            } as Account
            const managedKeyAuthz = 'src-auth-src::auth-src-native-1'
            const managedMap = new Map<string, Account>([[managedKeyAuthz, managedAccount]])

            vi.spyOn(ctx.mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(ctx.mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(ctx.run, new Map([[managedKeyAuthz, managedAccount]]))
            ctx.mockMappingService.mapAttributes.mockImplementation((account) => account)
            ctx.mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            ctx.mockIdentities.getIdentityById.mockReturnValue(undefined as any)
            ctx.mockIdentities.fetchIdentityById.mockResolvedValue({
                id: 'identity-1',
                name: 'Identity One',
                accounts: [],
                attributes: {},
            } as unknown as IdentityDocument)
            ctx.mockIdentities.correlateAccounts.mockResolvedValue(true)
            vi.spyOn(ctx.mockSources, 'getSourceConfig').mockReturnValue({
                name: 'Authoritative Source',
                correlationMode: 'correlate',
                sourceType: 'authoritative',
            } as any)

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKeyAuthz,
                    name: 'Authorized User',
                    sourceName: 'Authoritative Source',
                    sourceId: 'src-auth-src',
                    nativeIdentity: 'auth-src-native-1',
                },
                newIdentity: false,
                identityId: 'identity-1',
                comments: 'Assign into existing identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            await ctx.fusionService.processFusionIdentityDecision(decision)

            expect(ctx.mockIdentities.correlateAccounts).toHaveBeenCalledTimes(1)
            expect(ctx.mockIdentities.correlateAccounts).toHaveBeenCalledWith(
                expect.any(FusionAccount),
                [managedKeyAuthz],
                'merge'
            )
        })

        it('registers unique attributes and skips output for record no-match decisions', async () => {
            const managedKey = 'src-record-src::record-native-1'
            const managedAccount = {
                id: managedKey,
                name: 'Record User',
                sourceName: 'Record Source',
                sourceId: 'src-record-src',
                nativeIdentity: 'record-native-1',
                attributes: {},
            } as Account
            const managedMap = new Map<string, Account>([[managedKey, managedAccount]])
            Object.defineProperty(ctx.run, 'managedAccountsById', {
                get: () => managedMap,
                configurable: true,
            })
            vi.spyOn(ctx.mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(ctx.run, new Map([[managedKey, managedAccount]]))
            ctx.run.sourcesByName.set('Record Source', {
                id: 'src-record-src',
                name: 'Record Source',
                sourceType: 'record',
                config: {},
            })
            ctx.mockMappingService.mapAttributes.mockImplementation((account) => account)
            ctx.mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            ctx.mockDefinitionService.registerUniqueAttributes.mockResolvedValue()
            const registerRecordSpy = vi
                .spyOn(ctx.mockDefinitionService, 'registerUniqueValuesFromRecordManagedAccount')
                .mockResolvedValue(undefined)

            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKey,
                    name: 'Record User',
                    sourceName: 'Record Source',
                    sourceId: 'src-record-src',
                    nativeIdentity: 'record-native-1',
                },
                newIdentity: true,
                identityId: undefined,
                comments: 'No matching identity',
                finished: true,
                sourceType: 'record',
            } as any

            const result = await ctx.fusionService.processFusionIdentityDecision(decision)

            expect(result).toBeUndefined()
            expect(registerRecordSpy).toHaveBeenCalledWith(managedAccount, ctx.mockMappingService, ctx.run)
            expect(ctx.mockDefinitionService.registerUniqueAttributes).not.toHaveBeenCalled()
        })

        it('safely skips orphan disable queue when account is no longer in managed map', async () => {
            const managedKeyOrphan = 'src-orphan-1::orphan-native-1'
            const managedMap = new Map<string, Account>()

            Object.defineProperty(ctx.run, 'managedAccountsById', {
                get: () => managedMap,
                configurable: true,
            })
            vi.spyOn(ctx.mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(ctx.run, new Map())
            ctx.mockMappingService.mapAttributes.mockImplementation((account) => account)
            ctx.mockDefinitionService.refreshNormalAttributes.mockResolvedValue()
            ;(ctx.fusionService as any).run.sourcesByName.set('Orphan Source', {
                id: 'src-orphan-1',
                name: 'Orphan Source',
                sourceType: 'orphan',
                config: { disableNonMatchingAccounts: true },
            })

            const queueDisableSpy = vi.spyOn(ctx.fusionService.run, 'queueDisableOperation').mockImplementation(() => {})
            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: managedKeyOrphan,
                    name: 'Orphan User',
                    sourceName: 'Orphan Source',
                    sourceId: 'src-orphan-1',
                    nativeIdentity: 'orphan-native-1',
                },
                newIdentity: true,
                identityId: undefined,
                comments: 'Reject orphan match',
                finished: true,
                sourceType: 'orphan',
            } as any

            const result = await ctx.fusionService.processFusionIdentityDecision(decision)

            expect(result).toBeUndefined()
            expect(queueDisableSpy).not.toHaveBeenCalled()
        })

        it('registers a new fusion account for authoritative new-identity decisions', async () => {
            vi.spyOn(ctx.mockSources, 'managedAccountsById', 'get').mockReturnValue(new Map())
            vi.spyOn(ctx.mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(ctx.run, new Map())
            ctx.mockMappingService.mapAttributes.mockImplementation((account) => account)
            ctx.mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const setFusionAccountSpy = vi.spyOn(ctx.fusionService.run, 'registerFusionAccount')
            const decision = {
                submitter: { id: 'reviewer-1', email: 'reviewer@example.com', name: 'Reviewer' },
                account: {
                    id: 'src-auth-src::auth-new-native-1',
                    name: 'Auth User',
                    sourceName: 'Authoritative Source',
                    sourceId: 'src-auth-src',
                    nativeIdentity: 'auth-new-native-1',
                },
                newIdentity: true,
                identityId: undefined,
                comments: 'Create new identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            const result = await ctx.fusionService.processFusionIdentityDecision(decision)

            expect(result).toBeDefined()
            expect(setFusionAccountSpy).toHaveBeenCalledTimes(1)
        })
    })

    describe('history consistency safeguards', () => {
        it('does not duplicate set-history messages on no-op add', () => {
            const fusionAccount = FusionAccount.fromManagedAccount({
                id: 'acct-history-noop-1',
                name: 'History User',
                sourceId: 'src-history',
                nativeIdentity: 'hist-noop',
                sourceName: 'History Source',
                attributes: {},
            } as Account)

            fusionAccount.addStatus(StatusEntitlement.Candidate, 'Set candidate status')
            fusionAccount.addStatus(StatusEntitlement.Candidate, 'Set candidate status')

            const duplicateMessages = fusionAccount.history.filter((h) => h.includes('Set candidate status'))
            expect(duplicateMessages).toHaveLength(1)
        })

        it('normalizes imported history by trimming and removing blank entries', () => {
            const fusionAccount = FusionAccount.fromManagedAccount({
                id: 'acct-history-import-1',
                name: 'History User',
                sourceId: 'src-history',
                nativeIdentity: 'hist-import',
                sourceName: 'History Source',
                attributes: {},
            } as Account)

            fusionAccount.importHistory(['   ', 'first-entry', 'first-entry', '  second-entry  '])

            expect(fusionAccount.history).toEqual(['first-entry', 'second-entry'])
        })

        it('uses fallback labels when decision names are blank', async () => {
            const managedAccount = {
                id: 'acct-history-fallback-1',
                name: 'LH2 User',
                sourceId: 'src-lh2',
                nativeIdentity: 'hist-fallback',
                sourceName: 'LH2',
                attributes: {},
            } as Account
            const histKey = 'src-lh2::hist-fallback'
            const managedMap = new Map<string, Account>([[histKey, managedAccount]])

            vi.spyOn(ctx.mockSources, 'managedAccountsById', 'get').mockReturnValue(managedMap)
            vi.spyOn(ctx.mockSources, 'managedAccountsByIdentityId', 'get').mockReturnValue(new Map())
            seedRunInventory(ctx.run, new Map([[histKey, managedAccount]]))
            ctx.mockMappingService.mapAttributes.mockImplementation((account) => account)
            ctx.mockDefinitionService.refreshNormalAttributes.mockResolvedValue()

            const decision = {
                submitter: { id: 'reviewer-1', email: ' ', name: ' ' },
                account: {
                    id: histKey,
                    name: '  ',
                    sourceName: '  ',
                    sourceId: 'src-lh2',
                    nativeIdentity: 'hist-fallback',
                },
                newIdentity: false,
                comments: 'Assign into existing identity',
                finished: true,
                sourceType: 'authoritative',
            } as any

            const result = await ctx.fusionService.processFusionIdentityDecision(decision)
            expect(
                result?.history.some((h) =>
                    h.includes('Merged Unknown account [Unknown source] into existing identity by Unknown reviewer')
                )
            ).toBe(true)
        })
    })

})
