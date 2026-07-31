import { StandardCommand } from '@sailpoint/connector-sdk'

/** Maps scenario step operation names to SDK connector command types. */
export const OPERATION_TYPE_MAP: Readonly<Record<string, StandardCommand>> = {
    testConnection: StandardCommand.StdTestConnection,
    accountList: StandardCommand.StdAccountList,
    accountRead: StandardCommand.StdAccountRead,
    accountCreate: StandardCommand.StdAccountCreate,
    accountUpdate: StandardCommand.StdAccountUpdate,
    accountEnable: StandardCommand.StdAccountEnable,
    accountDisable: StandardCommand.StdAccountDisable,
    entitlementList: StandardCommand.StdEntitlementList,
    accountDiscoverSchema: StandardCommand.StdAccountDiscoverSchema,
}

/** Resolves a scenario step operation name to its SDK command type, if known. */
export function resolveOperationType(operation: string): StandardCommand | undefined {
    return OPERATION_TYPE_MAP[operation]
}

/** Returns true when the operation name maps to a standard SDK connector command. */
export function isKnownScenarioOperation(operation: string): boolean {
    return Object.prototype.hasOwnProperty.call(OPERATION_TYPE_MAP, operation)
}
