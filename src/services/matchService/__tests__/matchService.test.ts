import { describe, it, expect } from 'vitest'
import { MatchService } from '../scoringService'

describe('MatchService', () => {
    const mockLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any
    const config = { matchingConfigs: [], fusionManualReviewScore: 0 } as any

    it('is instantiable', () => {
        const service = new MatchService(config, mockLog)
        expect(service).toBeDefined()
    })

    it('returns 0 comparisons when no matching configs', async () => {
        const service = new MatchService(config, mockLog)
        const fusionAccount = {} as any
        const identities: any[] = []
        const result = await service.scoreFusionAccount(fusionAccount, identities)
        expect(result).toBe(0)
    })
})
