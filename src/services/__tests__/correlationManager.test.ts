import { CorrelationManager } from '../correlationManager'
import { FusionAccountKind } from '../../model/fusionAccountTypes'

function createManager(
    sourceConfig: { correlationMode?: string; name?: string } | null = { correlationMode: 'correlate', name: 'HR' },
    configSources: Array<{ name: string; correlationMode?: string }> = [
        { name: sourceConfig?.name ?? 'HR', correlationMode: sourceConfig?.correlationMode ?? 'correlate' },
    ]
) {
    const identities = { correlateAccounts: vi.fn().mockResolvedValue(undefined) } as any
    const sources = { getSourceConfig: vi.fn().mockReturnValue(sourceConfig) } as any
    const log = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        recordCorrelationSkipped: vi.fn(),
    } as any
    const manager = new CorrelationManager({ sources: configSources } as any, log, sources, identities, () => true)
    return { manager, identities, log, sources }
}

function createFusionAccount(overrides: Record<string, unknown> = {}) {
    const getManagedInfo = vi.fn().mockReturnValue({ source: { name: 'HR' } })
    const base = {
        missingAccountIdsSet: new Set(['acct-1']),
        missingAccountIds: ['acct-1'],
        identityId: 'id-1',
        name: 'Test User',
        isManaged: false,
        type: FusionAccountKind.Fusion,
        fromIdentity: false,
        collections: {
            managedAccountInfo: {
                get: getManagedInfo,
            },
        },
    }
    const { getManagedAccountInfo, collections, ...rest } = overrides as any
    if (typeof getManagedAccountInfo === 'function') {
        getManagedInfo.mockImplementation(getManagedAccountInfo)
    }
    return {
        ...base,
        ...(collections ? { collections } : {}),
        ...rest,
    } as any
}

describe('CorrelationManager aggregation correlation', () => {
    it('applies correlation-on-aggregation when missing accounts exist on a persisted fusion account', async () => {
        const { manager, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount())
        expect(identities.correlateAccounts).toHaveBeenCalledWith(expect.anything(), ['acct-1'], 'link')
    })

    it('applies correlation-on-aggregation for identity-origin fusion accounts', async () => {
        const { manager, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(
            createFusionAccount({
                type: FusionAccountKind.Identity,
                fromIdentity: true,
            })
        )
        expect(identities.correlateAccounts).toHaveBeenCalledWith(expect.anything(), ['acct-1'], 'link')
    })

    it('passes merge kind when explicitly requested', async () => {
        const { manager, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount(), undefined, 'merge')
        expect(identities.correlateAccounts).toHaveBeenCalledWith(expect.anything(), ['acct-1'], 'merge')
    })

    it('allows merge correlation on provisional managed-origin accounts', async () => {
        const { manager, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(
            createFusionAccount({ isManaged: true, type: FusionAccountKind.Managed }),
            undefined,
            'merge'
        )
        expect(identities.correlateAccounts).toHaveBeenCalledWith(expect.anything(), ['acct-1'], 'merge')
    })

    it('does not run link correlation on provisional managed-origin accounts', async () => {
        const { manager, log, identities } = createManager()
        await manager.applyPerSourceCorrelationIfNeeded(
            createFusionAccount({ isManaged: true, type: FusionAccountKind.Managed })
        )
        expect(log.recordCorrelationSkipped).not.toHaveBeenCalled()
        expect(identities.correlateAccounts).not.toHaveBeenCalled()
    })

    it('does not run link correlation when no source uses correlationMode correlate', async () => {
        const { manager, log, identities } = createManager(
            { correlationMode: 'none', name: 'HR' },
            [{ name: 'HR', correlationMode: 'none' }]
        )
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount())
        expect(log.recordCorrelationSkipped).not.toHaveBeenCalled()
        expect(identities.correlateAccounts).not.toHaveBeenCalled()
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
            createFusionAccount({
                collections: {
                    managedAccountInfo: {
                        get: vi.fn().mockReturnValue(undefined),
                    },
                },
            })
        )
        expect(log.recordCorrelationSkipped).toHaveBeenCalledWith('noSourceContext')
        expect(identities.correlateAccounts).not.toHaveBeenCalled()
    })

    it('records wrongMode skip when source correlationMode is not correlate', async () => {
        const { manager, log, identities } = createManager(
            { correlationMode: 'none', name: 'HR' },
            [
                { name: 'HR', correlationMode: 'none' },
                { name: 'Payroll', correlationMode: 'correlate' },
            ]
        )
        await manager.applyPerSourceCorrelationIfNeeded(createFusionAccount())
        expect(log.recordCorrelationSkipped).toHaveBeenCalledWith('wrongMode')
        expect(identities.correlateAccounts).not.toHaveBeenCalled()
    })
})
