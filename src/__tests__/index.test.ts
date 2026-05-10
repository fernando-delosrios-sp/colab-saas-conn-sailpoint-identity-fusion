import { connector } from '../index'
import { createConnector } from '@sailpoint/connector-sdk'
import { safeReadConfig } from '../data/config'
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
import { dryRun } from '../operations/dryRun'

jest.mock('@sailpoint/connector-sdk')
jest.mock('../data/config')
jest.mock('../utils/operationHandler')
jest.mock('../operations/testConnection', () => ({ testConnection: jest.fn() }))
jest.mock('../operations/accountList', () => ({ accountList: jest.fn() }))
jest.mock('../operations/accountRead', () => ({ accountRead: jest.fn() }))
jest.mock('../operations/accountCreate', () => ({ accountCreate: jest.fn() }))
jest.mock('../operations/accountUpdate', () => ({ accountUpdate: jest.fn() }))
jest.mock('../operations/accountEnable', () => ({ accountEnable: jest.fn() }))
jest.mock('../operations/accountDisable', () => ({ accountDisable: jest.fn() }))
jest.mock('../operations/entitlementList', () => ({ entitlementList: jest.fn() }))
jest.mock('../operations/accountDiscoverSchema', () => ({ accountDiscoverSchema: jest.fn() }))
jest.mock('../operations/dryRun', () => ({ dryRun: jest.fn() }))

describe('connector factory', () => {
    let mockConnector: any

    beforeEach(() => {
        jest.clearAllMocks()

        mockConnector = {
            stdTestConnection: jest.fn().mockReturnThis(),
            stdAccountList: jest.fn().mockReturnThis(),
            stdAccountRead: jest.fn().mockReturnThis(),
            stdAccountCreate: jest.fn().mockReturnThis(),
            stdAccountUpdate: jest.fn().mockReturnThis(),
            stdAccountEnable: jest.fn().mockReturnThis(),
            stdAccountDisable: jest.fn().mockReturnThis(),
            stdEntitlementList: jest.fn().mockReturnThis(),
            stdAccountDiscoverSchema: jest.fn().mockReturnThis(),
            command: jest.fn().mockReturnThis(),
        }
        ;(createConnector as jest.Mock).mockReturnValue(mockConnector)
        ;(safeReadConfig as jest.Mock).mockResolvedValue({ some: 'config' })
        ;(createOperationHandler as jest.Mock).mockImplementation((name) => `handler_${name}`)
    })

    it('should configure and return a connector with all standard operations', async () => {
        const result = await connector()

        expect(safeReadConfig).toHaveBeenCalledTimes(1)
        expect(createConnector).toHaveBeenCalledTimes(1)

        expect(result).toBe(mockConnector)

        const config = { some: 'config' }

        // Verify handlers were created
        expect(createOperationHandler).toHaveBeenCalledWith(
            'testConnection',
            testConnection,
            config,
            expect.objectContaining({
                errorMessage: 'Failed to test connection',
            })
        )
        expect(createOperationHandler).toHaveBeenCalledWith(
            'accountList',
            accountList,
            config,
            expect.objectContaining({
                errorMessage: 'Failed to aggregate accounts',
                keepAlive: 'memory',
            })
        )
        expect(createOperationHandler).toHaveBeenCalledWith('accountRead', accountRead, config, expect.any(Object))
        expect(createOperationHandler).toHaveBeenCalledWith('accountCreate', accountCreate, config, expect.any(Object))
        expect(createOperationHandler).toHaveBeenCalledWith(
            'accountUpdate',
            accountUpdate,
            config,
            expect.objectContaining({
                keepAlive: 'simple',
            })
        )
        expect(createOperationHandler).toHaveBeenCalledWith('accountEnable', accountEnable, config, expect.any(Object))
        expect(createOperationHandler).toHaveBeenCalledWith(
            'accountDisable',
            accountDisable,
            config,
            expect.any(Object)
        )
        expect(createOperationHandler).toHaveBeenCalledWith(
            'entitlementList',
            entitlementList,
            config,
            expect.any(Object)
        )
        expect(createOperationHandler).toHaveBeenCalledWith(
            'accountDiscoverSchema',
            accountDiscoverSchema,
            config,
            expect.objectContaining({
                errorMessage: 'Failed to discover schema',
            })
        )
        expect(createOperationHandler).toHaveBeenCalledWith(
            'custom:dryrun',
            dryRun,
            config,
            expect.objectContaining({
                errorMessage: 'Failed to run custom:dryrun',
                keepAlive: 'simple',
                keepAliveIntervalMs: 15000,
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
        expect(mockConnector.command).toHaveBeenCalledWith('custom:dryrun', 'handler_custom:dryrun')
    })

    it('should test errorMessage function callbacks correctly', async () => {
        await connector()

        // Find calls and extract errorMessage functions
        const calls = (createOperationHandler as jest.Mock).mock.calls

        const accountReadCall = calls.find((c: any) => c[0] === 'accountRead')

        const accountCreateCall = calls.find((c: any) => c[0] === 'accountCreate')

        const accountUpdateCall = calls.find((c: any) => c[0] === 'accountUpdate')

        const accountEnableCall = calls.find((c: any) => c[0] === 'accountEnable')

        const accountDisableCall = calls.find((c: any) => c[0] === 'accountDisable')

        const entitlementListCall = calls.find((c: any) => c[0] === 'entitlementList')

        expect(accountReadCall[3].errorMessage({ identity: 'test-user' })).toBe('Failed to read account test-user')
        expect(accountCreateCall[3].errorMessage({ identity: 'test-user', attributes: { name: 'Test User' } })).toBe(
            'Failed to create account Test User'
        )
        expect(accountCreateCall[3].errorMessage({ identity: 'test-user', attributes: {} })).toBe(
            'Failed to create account test-user'
        )
        expect(accountUpdateCall[3].errorMessage({ identity: 'test-user' })).toBe('Failed to update account test-user')
        expect(accountEnableCall[3].errorMessage({ identity: 'test-user' })).toBe('Failed to enable account test-user')
        expect(accountDisableCall[3].errorMessage({ identity: 'test-user' })).toBe(
            'Failed to disable account test-user'
        )
        expect(entitlementListCall[3].errorMessage({ type: 'group' })).toBe(
            'Failed to list entitlements for type group'
        )
    })
})
