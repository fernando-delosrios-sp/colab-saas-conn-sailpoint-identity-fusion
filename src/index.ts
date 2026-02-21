// Raise EventEmitter listener limit before any FormData usage. The sailpoint-api-client uses
// form-data for OAuth and multipart requests; with axios-retry, retries add error listeners
// to the same FormData instance, exceeding the default limit of 10 (e.g. 1 + 10 retries = 11).
import { EventEmitter } from 'events'
EventEmitter.defaultMaxListeners = Math.max(EventEmitter.defaultMaxListeners || 0, 20)

import {
    ConnectorError,
    ConnectorErrorType,
    StdAccountCreateHandler,
    StdAccountDisableHandler,
    StdAccountDiscoverSchemaHandler,
    StdAccountEnableHandler,
    StdAccountListHandler,
    StdAccountReadHandler,
    StdAccountUpdateHandler,
    StdEntitlementListHandler,
    StdTestConnectionHandler,
    createConnector,
    logger,
} from '@sailpoint/connector-sdk'
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

/**
 * Identity Fusion NG connector factory. Loads configuration and returns a configured
 * connector instance with all standard operations (test connection, account list/read/create/update,
 * entitlement list, schema discovery). Supports custom, proxy, and default run modes.
 *
 * @returns A promise that resolves to the configured connector
 */
export const connector = async () => {
    const config: FusionConfig = await safeReadConfig()
    //==============================================================================================================

    const stdTest: StdTestConnectionHandler = async (context, input, res) => {
        let serviceRegistry: ServiceRegistry | undefined
        try {
            serviceRegistry = new ServiceRegistry(config, context, res, 'testConnection')
            const isCustom = context.testConnection !== undefined
            const isProxy = serviceRegistry.proxy.isProxyMode()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            logger.info(`Running in ${runMode} mode`)

            switch (runMode) {
                case 'custom':
                    await context.testConnection(serviceRegistry, input)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await testConnection(serviceRegistry, input)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(`Failed to test connection: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            ServiceRegistry.clear()
        }
    }

    const stdAccountList: StdAccountListHandler = async (context, input, res): Promise<void> => {
        let serviceRegistry: ServiceRegistry | undefined
        let interval: ReturnType<typeof setInterval> | undefined
        try {
            serviceRegistry = new ServiceRegistry(config, context, res, 'accountList')
            const isCustom = context.accountList !== undefined
            const isProxy = serviceRegistry.proxy.isProxyMode()
            const isProxyServer = serviceRegistry.proxy.isProxyService()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            interval = isProxyServer ? undefined : setInterval(() => {
                const memoryUsage = process.memoryUsage()
                logger.info(`Memory usage - RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB, Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB, Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`)
                res.keepAlive()
            }, config.processingWait)

            logger.info(`Running accountList in ${runMode} mode`)

            switch (runMode) {
                case 'custom':
                    await context.accountList(serviceRegistry, input)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await accountList(serviceRegistry, input)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(`Failed to aggregate accounts: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            ServiceRegistry.clear()
            if (interval) {
                clearInterval(interval)
            }
        }
    }

    const stdAccountRead: StdAccountReadHandler = async (context, input, res): Promise<void> => {
        let serviceRegistry: ServiceRegistry | undefined
        try {
            serviceRegistry = new ServiceRegistry(config, context, res, 'accountRead')
            const isCustom = context.accountRead !== undefined
            const isProxy = serviceRegistry.proxy.isProxyMode()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            logger.info(`Running accountRead in ${runMode} mode`)
            switch (runMode) {
                case 'custom':
                    await context.accountRead(serviceRegistry, input)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await accountRead(serviceRegistry, input)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(`Failed to read account ${input.identity}: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            ServiceRegistry.clear()
        }
    }

    const stdAccountCreate: StdAccountCreateHandler = async (context, input, res) => {
        let serviceRegistry: ServiceRegistry | undefined
        try {
            serviceRegistry = new ServiceRegistry(config, context, res, 'accountCreate')
            const isCustom = context.accountCreate !== undefined
            const isProxy = serviceRegistry.proxy.isProxyMode()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            logger.info(`Running accountCreate in ${runMode} mode`)

            switch (runMode) {
                case 'custom':
                    await context.accountCreate(serviceRegistry, input)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await accountCreate(serviceRegistry, input)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(
                `Failed to create account ${input.attributes.name ?? input.identity}: ${detail}`,
                ConnectorErrorType.Generic
            )
        } finally {
            ServiceRegistry.clear()
        }
    }

    const stdAccountUpdate: StdAccountUpdateHandler = async (context, input, res) => {
        let serviceRegistry: ServiceRegistry | undefined
        let interval: ReturnType<typeof setInterval> | undefined
        try {
            serviceRegistry = new ServiceRegistry(config, context, res, 'accountUpdate')
            const isCustom = context.accountUpdate !== undefined
            const isProxy = serviceRegistry.proxy.isProxyMode()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            interval =
                runMode === 'proxy'
                    ? undefined
                    : setInterval(() => {
                        res.keepAlive()
                    }, config.processingWait)

            logger.info(`Running accountUpdate in ${runMode} mode`)

            switch (runMode) {
                case 'custom':
                    await context.accountUpdate(serviceRegistry, input)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await accountUpdate(serviceRegistry, input)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(`Failed to update account ${input.identity}: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            ServiceRegistry.clear()
            if (interval) {
                clearInterval(interval)
            }
        }
    }

    const stdAccountEnable: StdAccountEnableHandler = async (context, input, res) => {
        let serviceRegistry: ServiceRegistry | undefined
        try {
            serviceRegistry = new ServiceRegistry(config, context, res, 'accountEnable')
            const isCustom = context.accountEnable !== undefined
            const isProxy = serviceRegistry.proxy.isProxyMode()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            logger.info(`Running accountEnable in ${runMode} mode`)

            switch (runMode) {
                case 'custom':
                    await context.accountEnable(serviceRegistry, input)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await accountEnable(serviceRegistry, input)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(`Failed to enable account ${input.identity}: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            ServiceRegistry.clear()
        }
    }

    const stdAccountDisable: StdAccountDisableHandler = async (context, input, res) => {
        let serviceRegistry: ServiceRegistry | undefined
        try {
            serviceRegistry = new ServiceRegistry(config, context, res, 'accountDisable')
            const isCustom = context.accountDisable !== undefined
            const isProxy = serviceRegistry.proxy.isProxyMode()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            logger.info(`Running accountDisable in ${runMode} mode`)

            switch (runMode) {
                case 'custom':
                    await context.accountDisable(serviceRegistry, input)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await accountDisable(serviceRegistry, input)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(`Failed to disable account ${input.identity}: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            ServiceRegistry.clear()
        }
    }

    const stdEntitlementList: StdEntitlementListHandler = async (context, input, res) => {
        let serviceRegistry: ServiceRegistry | undefined
        try {
            serviceRegistry = new ServiceRegistry(config, context, res, 'entitlementList')
            const isCustom = context.entitlementList !== undefined
            const isProxy = serviceRegistry.proxy.isProxyMode()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            logger.info(`Running entitlementList in ${runMode} mode`)

            switch (runMode) {
                case 'custom':
                    await context.entitlementList(serviceRegistry, input)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await entitlementList(serviceRegistry, input)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(`Failed to list entitlements for type ${input.type}: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            ServiceRegistry.clear()
        }
    }

    const stdAccountDiscoverSchema: StdAccountDiscoverSchemaHandler = async (context, input, res) => {
        let serviceRegistry: ServiceRegistry | undefined
        try {
            serviceRegistry = new ServiceRegistry(config, context, res, 'accountDiscoverSchema')
            const isCustom = context.accountDiscoverSchema !== undefined
            const isProxy = serviceRegistry.proxy.isProxyMode()
            const runMode = isCustom ? 'custom' : isProxy ? 'proxy' : 'default'

            logger.info(`Running accountDiscoverSchema in ${runMode} mode`)

            switch (runMode) {
                case 'custom':
                    await context.accountDiscoverSchema(serviceRegistry)
                    break
                case 'proxy':
                    await serviceRegistry.proxy.execute(input)
                    break
                default:
                    await accountDiscoverSchema(serviceRegistry)
            }
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            throw new ConnectorError(`Failed to discover schema: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            ServiceRegistry.clear()
        }
    }

    return createConnector()
        .stdTestConnection(stdTest)
        .stdAccountList(stdAccountList)
        .stdAccountRead(stdAccountRead)
        .stdAccountCreate(stdAccountCreate)
        .stdAccountUpdate(stdAccountUpdate)
        .stdAccountEnable(stdAccountEnable)
        .stdAccountDisable(stdAccountDisable)
        .stdEntitlementList(stdEntitlementList)
        .stdAccountDiscoverSchema(stdAccountDiscoverSchema)
}
