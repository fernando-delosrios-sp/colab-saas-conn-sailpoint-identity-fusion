import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AccountV2025 as Account } from 'sailpoint-api-client'
import { StandardCommand } from '@sailpoint/connector-sdk'
import { AccountAssembly, AccountAssemblyDeps } from '../accountAssembly'
import { FusionAccount } from '../../../model/account'

describe('AccountAssembly', () => {
    let mockRun: any
    let mockSources: any
    let mockMappingService: any
    let mockDefinitionService: any
    let mockLog: any
    let mockConfig: any
    let deps: AccountAssemblyDeps
    let assembly: AccountAssembly

    beforeEach(() => {
        mockRun = {
            managedAccountsById: new Map(),
            managedAccountInventory: new Map(),
            registerFusionAccount: vi.fn(),
            recordFusionBlend: vi.fn(),
        }
        mockSources = {}
        mockMappingService = {
            mapAttributes: vi.fn(),
        }
        mockDefinitionService = {
            refreshNormalAttributes: vi.fn().mockResolvedValue(undefined),
            refreshReverseCorrelationAttributes: vi.fn(),
        }
        mockLog = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }
        mockConfig = { sources: [] }
        FusionAccount.configure(mockConfig as any)
        deps = {
            run: mockRun,
            sources: mockSources,
            mappingService: mockMappingService,
            definitionService: mockDefinitionService,
            log: mockLog,
            config: mockConfig,
            commandType: StandardCommand.StdAccountList,
        }
        assembly = new AccountAssembly(deps)
    })

    describe('isAggregationAccountListMode', () => {
        it('returns true when commandType is StdAccountList', () => {
            expect(assembly.isAggregationAccountListMode()).toBe(true)
        })

        it('returns true when operationContext is AccountList', () => {
            const listDeps = { ...deps, commandType: undefined, isAggregationMode: true }
            const listAssembly = new AccountAssembly(listDeps)
            expect(listAssembly.isAggregationAccountListMode()).toBe(true)
        })

        it('returns false for other commands', () => {
            const readDeps = { ...deps, commandType: StandardCommand.StdAccountRead }
            const readAssembly = new AccountAssembly(readDeps)
            expect(readAssembly.isAggregationAccountListMode()).toBe(false)
        })
    })

    describe('shouldPruneDeletedManagedAccounts', () => {
        it('returns true for list/read/update/enable/disable commands', () => {
            expect(assembly.shouldPruneDeletedManagedAccounts()).toBe(true)

            const readAssembly = new AccountAssembly({ ...deps, commandType: StandardCommand.StdAccountRead })
            expect(readAssembly.shouldPruneDeletedManagedAccounts()).toBe(true)
        })

        it('returns false for non-pruning command types', () => {
            const testAssembly = new AccountAssembly({ ...deps, commandType: StandardCommand.StdTestConnection })
            expect(testAssembly.shouldPruneDeletedManagedAccounts()).toBe(false)
        })
    })

    describe('assembleManagedAccount', () => {
        it('pre-processes a managed account by creating FusionAccount and mapping attributes', async () => {
            const account: Account = {
                id: 'acc-1',
                name: 'john.doe',
                sourceId: 'src-1',
                sourceName: 'Source 1',
                nativeIdentity: 'john.doe',
            }

            const fusionAccount = await assembly.assembleManagedAccount(account)
            expect(fusionAccount).toBeInstanceOf(FusionAccount)
            expect(mockMappingService.mapAttributes).toHaveBeenCalledWith(fusionAccount, mockRun)
            expect(mockDefinitionService.refreshNormalAttributes).toHaveBeenCalledWith(fusionAccount)
            expect(mockDefinitionService.refreshReverseCorrelationAttributes).toHaveBeenCalledWith(fusionAccount)
        })
    })

    describe('applyAttributeProcessing', () => {
        it('invokes mapping and definition services', async () => {
            const account = FusionAccount.fromIdentity({ id: 'id-1', name: 'Identity 1' })
            await assembly.applyAttributeProcessing(account)

            expect(mockMappingService.mapAttributes).toHaveBeenCalledWith(account, mockRun)
            expect(mockDefinitionService.refreshNormalAttributes).toHaveBeenCalledWith(account)
            expect(mockDefinitionService.refreshReverseCorrelationAttributes).toHaveBeenCalledWith(account)
        })
    })

    describe('registerFusionAccount', () => {
        it('delegates registration to FusionRun', () => {
            const account = FusionAccount.fromIdentity({ id: 'id-1', name: 'Identity 1' })
            assembly.registerFusionAccount(account)
            expect(mockRun.registerFusionAccount).toHaveBeenCalledWith(account, undefined)
        })
    })
})
