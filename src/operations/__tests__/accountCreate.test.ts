import { accountCreate } from '../accountCreate'
import { ServiceRegistry } from '../../services/serviceRegistry'
import { executeActions } from '../actions'

jest.mock('../actions', () => ({
    executeActions: jest.fn(),
}))

function createRegistry() {
    const fusionIdentity = {
        nativeIdentity: 'fusion-id-1',
        addStatus: jest.fn(),
    }

    const timer = {
        phase: jest.fn(),
        end: jest.fn(),
    }

    return {
        log: {
            info: jest.fn(),
            debug: jest.fn(),
            crash: jest.fn(),
            timer: jest.fn(() => timer),
        },
        identities: {
            fetchIdentityByName: jest.fn().mockResolvedValue({ id: 'id-1', name: 'Alice Doe' }),
        },
        sources: {
            fetchAllSources: jest.fn().mockResolvedValue(undefined),
            fetchFusionAccounts: jest.fn().mockResolvedValue(undefined),
            fusionAccounts: [{ id: 'fusion-existing-1' }],
        },
        schemas: {
            setFusionAccountSchema: jest.fn().mockResolvedValue(undefined),
            fusionDisplayAttribute: 'name',
        },
        fusion: {
            preProcessFusionAccounts: jest.fn().mockResolvedValue(undefined),
            processIdentity: jest.fn().mockResolvedValue(undefined),
            getFusionIdentity: jest.fn().mockReturnValue(fusionIdentity),
            getISCAccount: jest.fn().mockResolvedValue({ id: 'isc-created' }),
        },
        attributes: {
            initializeCounters: jest.fn().mockResolvedValue(undefined),
            registerUniqueValuesFromRawAccounts: jest.fn(),
            refreshUniqueAttributes: jest.fn().mockResolvedValue(undefined),
        },
        res: {
            send: jest.fn(),
        },
    } as any
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
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-created' })
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
