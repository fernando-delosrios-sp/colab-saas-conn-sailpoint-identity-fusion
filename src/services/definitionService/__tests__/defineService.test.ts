import { describe, it, expect, vi } from 'vitest'
import { DefinitionService } from '../definitionService'

describe('DefinitionService', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any
    const config = {
        normalAttributeDefinitions: [],
        uniqueAttributeDefinitions: [],
        attributeMaps: [],
    } as any

    it('is instantiable', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        expect(service).toBeDefined()
    })
})
