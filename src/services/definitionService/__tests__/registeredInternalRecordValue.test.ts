import { DefinitionService } from '../definitionService'
import { InMemoryLockService } from '../../lockService'

describe('Scenario: Candidate collides with a registered Internal Record value', () => {
    it('reports jdoe as not unique for sAMAccountName', () => {
        const log = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            getLogLevel: vi.fn(() => 'info'),
        }
        const service = new DefinitionService(
            {
                normalAttributeDefinitions: [],
                uniqueAttributeDefinitions: [],
                attributeMaps: [],
                skipAccountsWithMissingId: false,
                forceAttributeRefresh: false,
                sources: [],
            } as any,
            { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any,
            log as any,
            new InMemoryLockService(log as any)
        )

        service.registerExistingValues('sAMAccountName', ['jdoe'])

        expect(service.isCandidateValueUnique('sAMAccountName', 'jdoe')).toBe(false)
        expect(service.isCandidateValueUnique('sAMAccountName', 'jsmith')).toBe(true)
    })
})
