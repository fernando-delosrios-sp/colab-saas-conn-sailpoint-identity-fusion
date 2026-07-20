import { describe, it, expect } from 'vitest'
import { MatchingService } from '../matchingService'

describe('MatchingService', () => {
    const mockLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any
    const config = { matchingConfigs: [], fusionManualReviewScore: 0 } as any

    it('is instantiable', () => {
        const service = new MatchingService(config, mockLog)
        expect(service).toBeDefined()
    })

    it('returns 0 comparisons when no matching configs', async () => {
        const service = new MatchingService(config, mockLog)
        const fusionAccount = {} as any
        const identities: any[] = []
        const result = await service.scoreFusionAccount(fusionAccount, identities)
        expect(result).toBe(0)
    })
})
