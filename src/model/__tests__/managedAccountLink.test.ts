import { AccountV2025 as Account } from 'sailpoint-api-client'
import { FusionAccount } from '../account'
import { FusionRun } from '../fusionRun'
import { isManagedAccountLinkedInFusion } from '../managedAccountLink'

describe('isManagedAccountLinkedInFusion', () => {
    const WORKDAY_SOURCE_ID = '355fb49e084e4f35adb755410affe0c8'
    const MANAGED_KEY = `${WORKDAY_SOURCE_ID}::116144`

    it('detects a key listed only in persisted accounts (previousAccountIds)', () => {
        FusionAccount.configure({ sources: [] } as any)
        const run = new FusionRun()

        const fusionAccount = FusionAccount.fromFusionAccount({
            nativeIdentity: 'fusion-managed-key',
            id: 'isc-fusion-1',
            name: 'Existing Fusion Account',
            sourceName: 'Identity Fusion NG',
            attributes: {
                accounts: [MANAGED_KEY],
            },
        } as unknown as Account)
        run.registerFusionAccount(fusionAccount)

        const managedAccount = {
            id: 'isc-workday-116144',
            sourceId: WORKDAY_SOURCE_ID,
            nativeIdentity: '116144',
            name: '116144',
            sourceName: 'Workday - Employees',
            uncorrelated: true,
            attributes: {},
        } as Account

        run.initLinkedAccountIndex()
        for (const key of fusionAccount.previousAccountIdsSet) {
            run.addToLinkedAccountIndex(key)
        }

        expect(isManagedAccountLinkedInFusion(managedAccount, run)).toBe(true)
    })
})
