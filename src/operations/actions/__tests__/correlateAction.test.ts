import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { FusionAction } from '../../../model/fusionAction'
import { correlateAction } from '../correlateAction'

describe('correlateAction', () => {
    it('correlates missing accounts on Add', async () => {
        const fusionAccount = {
            name: 'Fusion User',
            removeAction: vi.fn(),
        } as any
        const serviceRegistry = {
            log: { debug: vi.fn() },
            fusion: { correlateMissingAccountsPerSource: vi.fn().mockResolvedValue(undefined) },
        } as any

        await correlateAction(fusionAccount, { op: AttributeChangeOp.Add, value: FusionAction.Correlated }, serviceRegistry)

        expect(serviceRegistry.fusion.correlateMissingAccountsPerSource).toHaveBeenCalledWith(fusionAccount)
        expect(fusionAccount.removeAction).not.toHaveBeenCalled()
    })

    it('removes correlated action entitlement on Remove', async () => {
        const fusionAccount = {
            name: 'Fusion User',
            removeAction: vi.fn(),
        } as any
        const serviceRegistry = {
            log: { debug: vi.fn() },
            fusion: { correlateMissingAccountsPerSource: vi.fn().mockResolvedValue(undefined) },
        } as any

        await correlateAction(fusionAccount, { op: AttributeChangeOp.Remove, value: FusionAction.Correlated }, serviceRegistry)

        expect(fusionAccount.removeAction).toHaveBeenCalledWith(FusionAction.Correlated)
        expect(serviceRegistry.fusion.correlateMissingAccountsPerSource).not.toHaveBeenCalled()
    })
})
