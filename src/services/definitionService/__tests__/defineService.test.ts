import { describe, it, expect, vi, beforeAll } from 'vitest'
import { DefinitionService } from '../definitionService'
import { FusionAccount } from '../../../model/account'
import { FusionConfig } from '../../../model/config'

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

describe('DefinitionService.applyDisplayAttributeOverride', () => {
    const mockLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    const mockLocks = { withLock: vi.fn((_key: string, fn: () => Promise<any>) => fn()) } as any
    const mockSchemas = { fusionIdentityAttribute: 'id', fusionDisplayAttribute: 'name' } as any
    const config = {
        normalAttributeDefinitions: [],
        uniqueAttributeDefinitions: [],
        attributeMaps: [],
    } as any

    beforeAll(() => {
        const minimalConfig = {
            sources: [
                { name: 'Source A', id: 'src-a', type: 'authoritative' },
                { name: 'Source B', id: 'src-b', type: 'record' },
            ],
            fusionAccountRefreshThresholdInSeconds: 3600,
            maxHistoryMessages: 50,
            resetAccounts: false,
            resetForms: false,
        } as unknown as FusionConfig
        FusionAccount.configure(minimalConfig)
    })

    function buildAccountWithIdentity(displayName: string, loginName: string): FusionAccount {
        const acc = FusionAccount.fromIdentity({ id: 'id-1', name: loginName, displayName } as any)
        acc.setNeedsReset(true)
        return acc
    }

    it('writes the identity alias (displayName) to the display attribute when an identity is linked', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = buildAccountWithIdentity('Alice Anderson', 'aanderson')
        acc.attributeBag.current['name'] = 'persisted-old-value'
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('Alice Anderson')
    })

    it('uses the alias even when it differs from the login', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = buildAccountWithIdentity('Display Name', 'login')
        acc.attributeBag.current['name'] = undefined
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('Display Name')
        expect(acc.attributeBag.current['name']).not.toBe('login')
    })

    it('skips the override when isIdentity is false', () => {
        const service = new DefinitionService(config, mockSchemas, mockLog, mockLocks)
        const acc = FusionAccount.fromManagedAccount({
            id: 'src-b::acc-1',
            name: 'source-name',
            sourceId: 'src-b',
            nativeIdentity: 'acc-1',
        } as any)
        acc.attributeBag.current['name'] = 'persisted'
        service.applyDisplayAttributeOverride(acc)
        expect(acc.attributeBag.current['name']).toBe('persisted')
    })
})

