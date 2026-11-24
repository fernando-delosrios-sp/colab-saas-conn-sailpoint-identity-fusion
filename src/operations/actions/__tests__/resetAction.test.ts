import { AttributeChangeOp } from '@sailpoint/connector-sdk'
import type { Mock } from 'vitest'
import { resetAction } from '../resetAction'
import { ATTR_OPS_RESET } from '../../../services/definitionService/types'

vi.mock('../../helpers/rebuildFusionAccount', () => ({
    rebuildFusionAccount: vi.fn(),
}))

import { rebuildFusionAccount } from '../../helpers/rebuildFusionAccount'

function createRegistry() {
    const sources = {
        fetchFusionAccounts: vi.fn().mockResolvedValue(undefined),
        fusionAccounts: [{ id: 'existing-1' }],
    }
    const definition = {
        initializeCounters: vi.fn().mockResolvedValue(undefined),
        registerUniqueValuesFromManagedSourceAccounts: vi.fn(),
        refreshUniqueAttributes: vi.fn().mockResolvedValue(undefined),
    }
    const fusion = {
        preProcessFusionAccounts: vi.fn().mockResolvedValue([]),
    }
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), crash: vi.fn() },
        fusion,
        sources,
        definition,
        identities: {},
    } as any
}

describe('resetAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('pre-processes fusion accounts, rebuilds with ATTR_OPS_RESET, and copies updated attributes on Add', async () => {
        const registry = createRegistry()
        const fusionAccount = {
            managedKey: 'NG000147',
            attributes: { id: 'NG000147', name: 'barrett.cline', username: 'barrett.cline', stale: 'old' },
        } as any
        const rebuilt = {
            managedKey: 'NG000147',
            attributes: { id: 'NG000147', name: 'barrett.cline', username: 'barrett.cline2' },
        }
        ;(rebuildFusionAccount as Mock).mockResolvedValue(rebuilt)

        await resetAction(fusionAccount, { op: AttributeChangeOp.Add, value: 'reset' }, registry)

        expect(registry.definition.initializeCounters).toHaveBeenCalledTimes(1)
        expect(registry.sources.fetchFusionAccounts).toHaveBeenCalledTimes(1)
        expect(registry.definition.registerUniqueValuesFromManagedSourceAccounts).toHaveBeenCalledWith([
            { id: 'existing-1' },
        ])
        expect(registry.fusion.preProcessFusionAccounts).toHaveBeenCalledTimes(1)
        expect(rebuildFusionAccount).toHaveBeenCalledWith(
            'NG000147',
            ATTR_OPS_RESET,
            expect.objectContaining({ fusion: registry.fusion, sources: registry.sources })
        )
        expect(registry.definition.refreshUniqueAttributes).toHaveBeenCalledWith(rebuilt)
        expect(fusionAccount.attributes).toEqual({
            id: 'NG000147',
            name: 'barrett.cline',
            username: 'barrett.cline2',
        })
    })

    it('does nothing on Remove', async () => {
        const registry = createRegistry()
        const fusionAccount = { managedKey: 'NG000147', attributes: { id: 'NG000147' } } as any

        await resetAction(fusionAccount, { op: AttributeChangeOp.Remove, value: 'reset' }, registry)

        expect(registry.definition.initializeCounters).not.toHaveBeenCalled()
        expect(registry.sources.fetchFusionAccounts).not.toHaveBeenCalled()
        expect(rebuildFusionAccount).not.toHaveBeenCalled()
    })
})
