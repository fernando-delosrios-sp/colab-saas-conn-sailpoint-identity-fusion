// Raise EventEmitter listener limit before any FormData usage. The sailpoint-api-client uses
// form-data for OAuth and multipart requests; with axios-retry, retries add error listeners
// to the same FormData instance, exceeding the default limit of 10 (e.g. 1 + 10 retries = 11).
import { EventEmitter } from 'events'
EventEmitter.defaultMaxListeners = Math.max(EventEmitter.defaultMaxListeners || 0, 20)

import { createConnector } from '@sailpoint/connector-sdk'
import { safeReadConfig } from './data/config'

import { FusionConfig } from './model/config'
import { createOperationHandler } from './connector/operationHandler'
import { testConnection } from './operations/testConnection'
import { accountList } from './operations/accountList'
import { accountRead } from './operations/accountRead'
import { accountCreate } from './operations/accountCreate'
import { accountUpdate } from './operations/accountUpdate'
import { accountEnable } from './operations/accountEnable'
import { accountDisable } from './operations/accountDisable'
import { entitlementList } from './operations/entitlementList'
import { accountDiscoverSchema } from './operations/accountDiscoverSchema'
import { dryRun } from './operations/dryRun'

/**
 * Identity Fusion NG connector factory. Loads configuration and returns a configured
 * connector instance with all standard operations (test connection, account list/read/create/update,
 * entitlement list, schema discovery). Supports custom, proxy, and default run modes.
 *
 * @returns A promise that resolves to the configured connector
 */
export const connector = async () => {
    const config: FusionConfig = await safeReadConfig()

    return createConnector()
        .stdTestConnection(
            createOperationHandler('testConnection', testConnection, config, {
                errorMessage: 'Failed to test connection',
            })
        )
        .stdAccountList(
            createOperationHandler('accountList', accountList, config, {
                errorMessage: 'Failed to aggregate accounts',
                keepAlive: 'memory',
            })
        )
        .stdAccountRead(
            createOperationHandler('accountRead', accountRead, config, {
                errorMessage: (input) => `Failed to read account ${input.identity}`,
            })
        )
        .stdAccountCreate(
            createOperationHandler('accountCreate', accountCreate, config, {
                errorMessage: (input) => `Failed to create account ${input.attributes.name ?? input.identity}`,
            })
        )
        .stdAccountUpdate(
            createOperationHandler('accountUpdate', accountUpdate, config, {
                errorMessage: (input) => `Failed to update account ${input.identity}`,
                keepAlive: 'simple',
            })
        )
        .stdAccountEnable(
            createOperationHandler('accountEnable', accountEnable, config, {
                errorMessage: (input) => `Failed to enable account ${input.identity}`,
            })
        )
        .stdAccountDisable(
            createOperationHandler('accountDisable', accountDisable, config, {
                errorMessage: (input) => `Failed to disable account ${input.identity}`,
            })
        )
        .stdEntitlementList(
            createOperationHandler('entitlementList', entitlementList, config, {
                errorMessage: (input) => `Failed to list entitlements for type ${input.type}`,
            })
        )
        .stdAccountDiscoverSchema(
            createOperationHandler('accountDiscoverSchema', accountDiscoverSchema, config, {
                errorMessage: 'Failed to discover schema',
            })
        )
        .command(
            'custom:dryrun',
            createOperationHandler('custom:dryrun', dryRun, config, {
                errorMessage: 'Failed to run custom:dryrun',
                // Long fetch/analyze phases send no row output; peers often idle-timeout (~60s) before the first NDJSON line.
                keepAlive: 'simple',
                keepAliveIntervalMs: 15_000,
            })
        )
}
