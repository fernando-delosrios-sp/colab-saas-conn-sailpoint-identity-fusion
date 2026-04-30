import { accountCreate } from '../accountCreate'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { executeActions } from '../actions'

jest.mock('../actions', () => ({
    executeActions: jest.fn(),
}))

import { createRegistry as createMockRegistry } from './harness/registryMocking'

function createRegistry() {
    const registry = createMockRegistry()
    return registry
}

describe('accountCreate', () => {
    beforeEach(() => {
        jest.spyOn(ServiceRegistry, 'setCurrent').mockImplementation(() => undefined)
    })

    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('creates fusion account from identity and executes actions', async () => {
        const registry = createRegistry()
        const input = {
            identity: 'Alice Doe',
            schema: { attributes: [] },
            attributes: {
                name: 'Alice Doe',
                actions: ['report:high', 'correlate:id-1'],
            },
        } as any

        await accountCreate(registry, input)

        expect(registry.identities.fetchIdentityByName).toHaveBeenCalledWith('Alice Doe')
        expect(registry.sources.fetchFusionAccounts).toHaveBeenCalledTimes(1)
        expect(registry.attributes.registerUniqueValuesFromRawAccounts).toHaveBeenCalledWith(registry.sources.fusionAccounts)
        expect(registry.fusion.preProcessFusionAccounts).toHaveBeenCalledTimes(1)
        expect(registry.fusion.processIdentity).toHaveBeenCalledWith({ id: 'id-1', name: 'Alice Doe' })
        expect(registry.fusion.getFusionIdentity().addStatus).toHaveBeenCalledWith(
            'requested',
            'Status set by accountCreate operation'
        )
        expect(executeActions).toHaveBeenCalledTimes(2)
        expect(registry.fusion.normalizePendingFormStateForOutput).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-created' })
    })

    it('executes a single report action when actions is a string (not char-split)', async () => {
        const registry = createRegistry()
        const input = {
            identity: 'Alice Doe',
            schema: { attributes: [] },
            attributes: {
                name: 'Alice Doe',
                actions: 'report',
            },
        } as any

        await accountCreate(registry, input)

        expect(executeActions).toHaveBeenCalledTimes(1)
        expect(executeActions).toHaveBeenCalledWith(
            registry.fusion.getFusionIdentity(),
            { op: expect.anything(), attribute: 'actions', value: 'report' },
            registry
        )
    })

    it('creates account using attributes.name when identity is missing', async () => {
        const registry = createRegistry()
        const input = {
            schema: { attributes: [] },
            attributes: {
                name: 'Alice Doe',
            },
        } as any

        await accountCreate(registry, input)

        expect(registry.identities.fetchIdentityByName).toHaveBeenCalledWith('Alice Doe')
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-created' })
    })
})
