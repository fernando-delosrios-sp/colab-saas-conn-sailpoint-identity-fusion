// Raise EventEmitter listener limit before any FormData usage. The sailpoint-api-client uses
// form-data for OAuth and multipart requests; with axios-retry, retries add error listeners
// to the same FormData instance, exceeding the default limit of 10 (e.g. 1 + 10 retries = 11).
import { EventEmitter } from 'events'
EventEmitter.defaultMaxListeners = Math.max(EventEmitter.defaultMaxListeners || 0, 20)

import { ConnectorError, ConnectorErrorType, createConnector, logger } from '@sailpoint/connector-sdk'
import { safeReadConfig } from './data/config'

import { FusionConfig } from './model/config'
import { ServiceRegistry } from './services/serviceRegistry'
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

type KeepAliveMode = 'memory' | 'simple'

interface HandlerOptions {
    errorMessage: string | ((input: any) => string)
    keepAlive?: KeepAliveMode
    /** Override `config.processingWait` for the keepAlive timer (ms). Use when pre-output work can exceed client idle timeouts. */
    keepAliveIntervalMs?: number
}

/**
 * Creates a standardized operation handler with run-mode detection (custom/proxy/default),
 * optional keep-alive intervals, unified error handling, and registry lifecycle management.
 */
function createHandler(
    operationName: string,
    defaultFn: (...args: any[]) => Promise<void>,
    config: FusionConfig,
    options: HandlerOptions
): any {
    return async (context: any, input: any, res: any) => {
        let interval: ReturnType<typeof setInterval> | undefined
        try {
            const serviceRegistry = new ServiceRegistry(config, context, res, operationName)
            const isCustom = context[operationName] !== undefined
            const isProxyServer = serviceRegistry.proxy.isProxyService()
            const isProxy = !isProxyServer && serviceRegistry.proxy.isProxyMode()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            const keepAliveEveryMs = options.keepAliveIntervalMs ?? config.processingWait
            if (options.keepAlive === 'memory') {
                if (!isProxyServer) {
                    interval = setInterval(() => {
                        const memoryUsage = process.memoryUsage()
                        logger.info(
                            `Memory usage - RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB, Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB, Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`
                        )
                        res.keepAlive()
                    }, keepAliveEveryMs)
                }
            } else if (options.keepAlive === 'simple' && runMode !== 'proxy') {
                interval = setInterval(() => {
                    res.keepAlive()
                }, keepAliveEveryMs)
            }

            logger.info(`Running ${operationName} in ${runMode} mode`)

            switch (runMode) {
                case 'custom':
                    await context[operationName](serviceRegistry, input)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await defaultFn(serviceRegistry, input)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            const msg = typeof options.errorMessage === 'function' ? options.errorMessage(input) : options.errorMessage
            throw new ConnectorError(`${msg}: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            ServiceRegistry.clear()
            if (interval) clearInterval(interval)
        }
    }
}

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
            createHandler('testConnection', testConnection, config, {
                errorMessage: 'Failed to test connection',
            })
        )
        .stdAccountList(
            createHandler('accountList', accountList, config, {
                errorMessage: 'Failed to aggregate accounts',
                keepAlive: 'memory',
            })
        )
        .stdAccountRead(
            createHandler('accountRead', accountRead, config, {
                errorMessage: (input) => `Failed to read account ${input.identity}`,
            })
        )
        .stdAccountCreate(
            createHandler('accountCreate', accountCreate, config, {
                errorMessage: (input) => `Failed to create account ${input.attributes.name ?? input.identity}`,
            })
        )
        .stdAccountUpdate(
            createHandler('accountUpdate', accountUpdate, config, {
                errorMessage: (input) => `Failed to update account ${input.identity}`,
                keepAlive: 'simple',
            })
        )
        .stdAccountEnable(
            createHandler('accountEnable', accountEnable, config, {
                errorMessage: (input) => `Failed to enable account ${input.identity}`,
            })
        )
        .stdAccountDisable(
            createHandler('accountDisable', accountDisable, config, {
                errorMessage: (input) => `Failed to disable account ${input.identity}`,
            })
        )
        .stdEntitlementList(
            createHandler('entitlementList', entitlementList, config, {
                errorMessage: (input) => `Failed to list entitlements for type ${input.type}`,
            })
        )
        .stdAccountDiscoverSchema(
            createHandler('accountDiscoverSchema', accountDiscoverSchema, config, {
                errorMessage: 'Failed to discover schema',
            })
        )
        .command(
            'custom:dryrun',
            createHandler('custom:dryrun', dryRun, config, {
                errorMessage: 'Failed to run custom:dryrun',
                // Long fetch/analyze phases send no row output; peers often idle-timeout (~60s) before the first NDJSON line.
                keepAlive: 'simple',
                keepAliveIntervalMs: 15_000,
            })
        )
}
