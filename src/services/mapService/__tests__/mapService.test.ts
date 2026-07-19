import { describe, it, vi } from 'vitest'
import { MapService } from '../mapService'
import { FusionRun } from '../../../model/fusionRun'
import { FusionAccount } from '../../../model/account'
import { FusionAccountKind } from '../../../model/fusionAccountTypes'

describe('MapService', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const config = {
        attributeMaps: [],
        attributeMerge: 'first' as const,
        sources: [{ name: 'SourceA' }],
    } as any

    it('skips identity-type accounts', () => {
        const service = new MapService(config, mockLog)
        const run = new FusionRun()
        const account = { type: FusionAccountKind.Identity, attributeBag: { current: {} } } as FusionAccount
        service.mapAttributes(account, run)
        // Should not throw; identity accounts are a no-op
    })
})
