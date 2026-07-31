import { StandardCommand } from '@sailpoint/connector-sdk'
import { OPERATION_TYPE_MAP, resolveOperationType, isKnownScenarioOperation } from '../operationTypeMap'

describe('operationTypeMap', () => {
    it('maps standard connector operations to SDK command types', () => {
        expect(OPERATION_TYPE_MAP.accountList).toBe(StandardCommand.StdAccountList)
        expect(OPERATION_TYPE_MAP.accountRead).toBe(StandardCommand.StdAccountRead)
        expect(OPERATION_TYPE_MAP.testConnection).toBe(StandardCommand.StdTestConnection)
        expect(OPERATION_TYPE_MAP.accountDiscoverSchema).toBe(StandardCommand.StdAccountDiscoverSchema)
    })

    it('resolveOperationType returns undefined for unknown operations', () => {
        expect(resolveOperationType('customDryRun')).toBeUndefined()
    })

    it('resolveOperationType returns SDK type for known operations', () => {
        expect(resolveOperationType('accountUpdate')).toBe(StandardCommand.StdAccountUpdate)
    })

    it('isKnownScenarioOperation reflects map membership', () => {
        expect(isKnownScenarioOperation('entitlementList')).toBe(true)
        expect(isKnownScenarioOperation('unknownOp')).toBe(false)
    })
})
