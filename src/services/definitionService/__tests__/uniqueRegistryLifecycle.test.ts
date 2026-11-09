import { DefinitionService } from '../definitionService'
import { FusionAccount } from '../../../model/account'
import { InMemoryLockService } from '../../lockService'

function service(): DefinitionService {
    const log = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        getLogLevel: vi.fn(() => 'info'),
    }
    return new DefinitionService(
        {
            normalAttributeDefinitions: [],
            uniqueAttributeDefinitions: [{ name: 'UID', expression: 'generated' }],
            attributeMaps: [],
            skipAccountsWithMissingId: false,
            forceAttributeRefresh: false,
            sources: [],
        } as any,
        { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any,
        log as any,
        new InMemoryLockService(log as any)
    )
}

function account(value: string): FusionAccount {
    return { managedKey: 'acct-1', attributes: { UID: value } } as FusionAccount
}

describe('DefinitionService unique registry', () => {
    it('Unique values registered after generation', async () => {
        const definitionService = service()
        expect(definitionService.isCandidateValueUnique('UID', 'generated')).toBe(true)

        await definitionService.registerUniqueAttributes(account('generated'))

        expect(definitionService.isCandidateValueUnique('UID', 'generated')).toBe(false)
    })

    it('Unique values unregistered on account removal', async () => {
        const definitionService = service()
        const fusionAccount = account('generated')
        await definitionService.registerUniqueAttributes(fusionAccount)
        expect(definitionService.isCandidateValueUnique('UID', 'generated')).toBe(false)

        await definitionService.unregisterUniqueAttributes(fusionAccount)

        expect(definitionService.isCandidateValueUnique('UID', 'generated')).toBe(true)
    })
})
