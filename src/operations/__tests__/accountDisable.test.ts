import { accountDisable } from '../accountDisable'
import { rebuildFusionAccount } from '../helpers/rebuildFusionAccount'
import type { Mock } from 'vitest'

vi.mock('../helpers/rebuildFusionAccount', () => ({
    rebuildFusionAccount: vi.fn(),
}))

import { createRegistry } from './harness/registryMocking'

describe('accountDisable', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('disables a fusion account and returns updated ISC account', async () => {
        const registry = createRegistry()
        registry.fusion.getISCAccount.mockResolvedValue({ id: 'isc-disabled' })
        const fusionAccount = { managedKey: 'fusion-1', disable: vi.fn() }
        ;(rebuildFusionAccount as Mock).mockResolvedValue(fusionAccount)

        await accountDisable(registry, { identity: 'fusion-1', schema: { attributes: [] } } as any)

        expect(registry.sources.fetchAllSources).toHaveBeenCalledTimes(1)
        expect(registry.schemas.setFusionAccountSchema).toHaveBeenCalledTimes(1)
        expect(rebuildFusionAccount).toHaveBeenCalledWith(
            'fusion-1',
            expect.any(Object),
            expect.objectContaining({
                fusion: expect.any(Object),
                identities: expect.any(Object),
                sources: expect.any(Object),
                log: expect.any(Object),
            })
        )
        expect(fusionAccount.disable).toHaveBeenCalledTimes(1)
        expect(registry.fusion.normalizePendingFormStateForOutput).toHaveBeenCalledTimes(1)
        expect(registry.res.send).toHaveBeenCalledWith({ id: 'isc-disabled' })
    })
})
