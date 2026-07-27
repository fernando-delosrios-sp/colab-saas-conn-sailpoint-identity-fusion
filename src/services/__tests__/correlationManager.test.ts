import { CorrelationManager } from '../correlationManager'

function createManager(sourceConfig: { correlationMode?: string } | null = { correlationMode: 'correlate' }) {
    const identities = { correlateAccounts: vi.fn().mockResolvedValue(undefined) } as any
    const sources = { getSourceConfig: vi.fn().mockReturnValue(sourceConfig) } as any
    const log = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        recordCorrelationSkipped: vi.fn(),
    } as any
    const manager = new CorrelationManager({} as any, log, sources, identities, () => true)
    return { manager, identities, log, sources }
}

function createFusionAccount(overrides: Record<string, unknown> = {}) {
    return {
        missingAccountIdsSet: new Set(['acct-1']),
        missingAccountIds: ['acct-1'],
        identityId: 'id-1',
        name: 'Test User',
        getManagedAccountInfo: vi.fn().mockReturnValue({ source: { name: 'HR' } }),
        ...overrides,
    } as any
}

describe('CorrelationManager aggregation correlation', () => {
    it('applies correlation-on-aggregation when missing accounts exist', async () => {
        const { manager, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount())
        expect(identities.correlateAccounts).toHaveBeenCalledWith(expect.anything(), ['acct-1'], 'link')
    })

    it('passes merge kind when explicitly requested', async () => {
        const { manager, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount(), undefined, 'merge')
        expect(identities.correlateAccounts).toHaveBeenCalledWith(expect.anything(), ['acct-1'], 'merge')
    })

    it('records noIdentity skip for each missing account without identityId', async () => {
        const { manager, log, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount({ identityId: undefined }))
        expect(log.recordCorrelationSkipped).toHaveBeenCalledWith('noIdentity')
        expect(identities.correlateAccounts).not.toHaveBeenCalled()
    })

    it('records noSourceContext skip when managed account metadata is missing', async () => {
        const { manager, log, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(
            createFusionAccount({ getManagedAccountInfo: vi.fn().mockReturnValue(undefined) })
        )
        expect(log.recordCorrelationSkipped).toHaveBeenCalledWith('noSourceContext')
        expect(identities.correlateAccounts).not.toHaveBeenCalled()
    })

    it('records wrongMode skip when source correlationMode is not correlate', async () => {
        const { manager, log, identities } = createManager({ correlationMode: 'none' })
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount())
        expect(log.recordCorrelationSkipped).toHaveBeenCalledWith('wrongMode')
        expect(identities.correlateAccounts).not.toHaveBeenCalled()
    })
})


