import { connector } from '../index'
import { createConnector } from '@sailpoint/connector-sdk'
import { createOperationHandler } from '../utils/operationHandler'
import { testConnection } from '../operations/testConnection'
import { accountList } from '../operations/accountList'
import { accountRead } from '../operations/accountRead'
import { accountCreate } from '../operations/accountCreate'
import { accountUpdate } from '../operations/accountUpdate'
import { accountEnable } from '../operations/accountEnable'
import { accountDisable } from '../operations/accountDisable'
import { entitlementList } from '../operations/entitlementList'
import { accountDiscoverSchema } from '../operations/accountDiscoverSchema'
import type { Mock } from 'vitest'

vi.mock('@sailpoint/connector-sdk', () => ({ createConnector: vi.fn() }))
vi.mock('../utils/operationHandler', () => ({ createOperationHandler: vi.fn() }))
vi.mock('../operations/testConnection', () => ({ testConnection: vi.fn() }))
vi.mock('../operations/accountList', () => ({ accountList: vi.fn() }))
vi.mock('../operations/accountRead', () => ({ accountRead: vi.fn() }))
vi.mock('../operations/accountCreate', () => ({ accountCreate: vi.fn() }))
vi.mock('../operations/accountUpdate', () => ({ accountUpdate: vi.fn() }))
vi.mock('../operations/accountEnable', () => ({ accountEnable: vi.fn() }))
vi.mock('../operations/accountDisable', () => ({ accountDisable: vi.fn() }))
vi.mock('../operations/entitlementList', () => ({ entitlementList: vi.fn() }))
vi.mock('../operations/accountDiscoverSchema', () => ({ accountDiscoverSchema: vi.fn() }))

describe('connector factory', () => {
    let mockConnector: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockConnector = {
            stdTestConnection: vi.fn().mockReturnThis(),
            stdAccountList: vi.fn().mockReturnThis(),
            stdAccountRead: vi.fn().mockReturnThis(),
            stdAccountCreate: vi.fn().mockReturnThis(),
            stdAccountUpdate: vi.fn().mockReturnThis(),
            stdAccountEnable: vi.fn().mockReturnThis(),
            stdAccountDisable: vi.fn().mockReturnThis(),
            stdEntitlementList: vi.fn().mockReturnThis(),
            stdAccountDiscoverSchema: vi.fn().mockReturnThis(),
            command: vi.fn().mockReturnThis(),
        }
        ;(createConnector as Mock).mockReturnValue(mockConnector)
        ;(createOperationHandler as Mock).mockImplementation((name) => `handler_${name}`)
    })

    it('should configure and return a connector with all standard operations', async () => {
        const result = await connector()

        expect(createConnector).toHaveBeenCalledTimes(1)

        expect(result).toBe(mockConnector)

        // Verify handlers were created
        expect(createOperationHandler).toHaveBeenCalledWith(
            'testConnection',
            testConnection,
            expect.objectContaining({
                errorMessage: 'Failed to test connection',
            })
        )
        expect(createOperationHandler).toHaveBeenCalledWith(
            'accountList',
            accountList,
            expect.objectContaining({
                errorMessage: 'Failed to aggregate accounts',
                keepAlive: 'memory',
            })
        )
        expect(createOperationHandler).toHaveBeenCalledWith('accountRead', accountRead, expect.any(Object))
        expect(createOperationHandler).toHaveBeenCalledWith('accountCreate', accountCreate, expect.any(Object))
        expect(createOperationHandler).toHaveBeenCalledWith(
            'accountUpdate',
            accountUpdate,
            expect.objectContaining({
                keepAlive: 'simple',
            })
        )
        expect(createOperationHandler).toHaveBeenCalledWith('accountEnable', accountEnable, expect.any(Object))
        expect(createOperationHandler).toHaveBeenCalledWith('accountDisable', accountDisable, expect.any(Object))
        expect(createOperationHandler).toHaveBeenCalledWith('entitlementList', entitlementList, expect.any(Object))
        expect(createOperationHandler).toHaveBeenCalledWith(
            'accountDiscoverSchema',
            accountDiscoverSchema,
            expect.objectContaining({
                errorMessage: 'Failed to discover schema',
            })
        )
        // Verify operations were bound
        expect(mockConnector.stdTestConnection).toHaveBeenCalledWith('handler_testConnection')
        expect(mockConnector.stdAccountList).toHaveBeenCalledWith('handler_accountList')
        expect(mockConnector.stdAccountRead).toHaveBeenCalledWith('handler_accountRead')
        expect(mockConnector.stdAccountCreate).toHaveBeenCalledWith('handler_accountCreate')
        expect(mockConnector.stdAccountUpdate).toHaveBeenCalledWith('handler_accountUpdate')
        expect(mockConnector.stdAccountEnable).toHaveBeenCalledWith('handler_accountEnable')
        expect(mockConnector.stdAccountDisable).toHaveBeenCalledWith('handler_accountDisable')
        expect(mockConnector.stdEntitlementList).toHaveBeenCalledWith('handler_entitlementList')
        expect(mockConnector.stdAccountDiscoverSchema).toHaveBeenCalledWith('handler_accountDiscoverSchema')
    })

    it('should test errorMessage function callbacks correctly', async () => {
        await connector()

        // Find calls and extract errorMessage functions
        const calls = (createOperationHandler as Mock).mock.calls

        const accountReadCall = calls.find((c: any) => c[0] === 'accountRead')

        const accountCreateCall = calls.find((c: any) => c[0] === 'accountCreate')

        const accountUpdateCall = calls.find((c: any) => c[0] === 'accountUpdate')

        const accountEnableCall = calls.find((c: any) => c[0] === 'accountEnable')

        const accountDisableCall = calls.find((c: any) => c[0] === 'accountDisable')

        const entitlementListCall = calls.find((c: any) => c[0] === 'entitlementList')

        expect(accountReadCall[2].errorMessage({ identity: 'test-user' })).toBe('Failed to read account test-user')
        expect(accountCreateCall[2].errorMessage({ identity: 'test-user', attributes: { name: 'Test User' } })).toBe(
            'Failed to create account Test User'
        )
        expect(accountCreateCall[2].errorMessage({ identity: 'test-user', attributes: {} })).toBe(
            'Failed to create account test-user'
        )
        expect(accountUpdateCall[2].errorMessage({ identity: 'test-user' })).toBe('Failed to update account test-user')
        expect(accountEnableCall[2].errorMessage({ identity: 'test-user' })).toBe('Failed to enable account test-user')
        expect(accountDisableCall[2].errorMessage({ identity: 'test-user' })).toBe(
            'Failed to disable account test-user'
        )
        expect(entitlementListCall[2].errorMessage({ type: 'group' })).toBe(
            'Failed to list entitlements for type group'
        )
    })
})
