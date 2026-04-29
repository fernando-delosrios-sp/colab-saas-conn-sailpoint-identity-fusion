import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import { correlateAction } from '../correlateAction'

describe('correlateAction', () => {
    it('correlates missing accounts on Add', async () => {
        const fusionAccount = {
            name: 'Fusion User',
            removeAction: jest.fn(),
        } as any
        const serviceRegistry = {
            log: { debug: jest.fn() },
            fusion: { correlateMissingAccountsPerSource: jest.fn().mockResolvedValue(undefined) },
        } as any

        await correlateAction(
            fusionAccount,
            { op: AttributeChangeOp.Add, value: 'correlated' },
            serviceRegistry
        )

        expect(serviceRegistry.fusion.correlateMissingAccountsPerSource).toHaveBeenCalledWith(fusionAccount)
        expect(fusionAccount.removeAction).not.toHaveBeenCalled()
    })

    it('removes correlated action entitlement on Remove', async () => {
        const fusionAccount = {
            name: 'Fusion User',
            removeAction: jest.fn(),
        } as any
        const serviceRegistry = {
            log: { debug: jest.fn() },
            fusion: { correlateMissingAccountsPerSource: jest.fn().mockResolvedValue(undefined) },
        } as any

        await correlateAction(
            fusionAccount,
            { op: AttributeChangeOp.Remove, value: 'correlated' },
            serviceRegistry
        )

        expect(fusionAccount.removeAction).toHaveBeenCalledWith('correlated')
        expect(serviceRegistry.fusion.correlateMissingAccountsPerSource).not.toHaveBeenCalled()
    })
})
