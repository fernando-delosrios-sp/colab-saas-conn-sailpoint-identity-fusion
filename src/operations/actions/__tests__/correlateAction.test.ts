import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAction } from '../../../model/fusionAction'
import { correlateAction } from '../correlateAction'

function makeFusionAccount() {
    return {
        name: 'Fusion User',
        collections: {
            actions: {
                remove: vi.fn(),
            },
        },
    } as any
}

describe('correlateAction', () => {
    it('correlates missing accounts on Add', async () => {
        const fusionAccount = makeFusionAccount()
        const serviceRegistry = {
            log: { debug: vi.fn() },
            fusion: { correlateMissingAccountsPerSource: vi.fn().mockResolvedValue(undefined) },
        } as any

        await correlateAction(fusionAccount, { op: AttributeChangeOp.Add, value: FusionAction.Correlated }, serviceRegistry)

        expect(serviceRegistry.fusion.correlateMissingAccountsPerSource).toHaveBeenCalledWith(fusionAccount)
        expect(fusionAccount.collections.actions.remove).not.toHaveBeenCalled()
    })

    it('removes correlated action entitlement on Remove', async () => {
        const fusionAccount = makeFusionAccount()
        const serviceRegistry = {
            log: { debug: vi.fn() },
            fusion: { correlateMissingAccountsPerSource: vi.fn().mockResolvedValue(undefined) },
        } as any

        await correlateAction(fusionAccount, { op: AttributeChangeOp.Remove, value: FusionAction.Correlated }, serviceRegistry)

        expect(fusionAccount.collections.actions.remove).toHaveBeenCalledWith(FusionAction.Correlated)
        expect(serviceRegistry.fusion.correlateMissingAccountsPerSource).not.toHaveBeenCalled()
    })
})
