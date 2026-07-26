import { CorrelationManager } from '../correlationManager'

function createManager() {
    const identities = { correlateAccounts: vi.fn().mockResolvedValue(undefined) } as any
    const sources = { getSourceConfig: vi.fn().mockReturnValue({ correlationMode: 'correlate' }) } as any
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } as any
    const manager = new CorrelationManager({} as any, log, sources, identities, () => true)
    return { manager, identities }
}

function createFusionAccount() {
    return {
        missingAccountIdsSet: new Set(['acct-1']),
        missingAccountIds: ['acct-1'],
        identityId: 'id-1',
        name: 'Test User',
        getManagedAccountInfo: vi.fn().mockReturnValue({ source: { name: 'HR' } }),
    } as any
}

describe('CorrelationManager aggregation correlation', () => {
    it('applies correlation-on-aggregation when missing accounts exist', async () => {
        const { manager, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount())
        expect(identities.correlateAccounts).toHaveBeenCalledWith(expect.anything(), ['acct-1'])
    })
})
