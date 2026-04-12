import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { FusionConfig } from '../model/config'
import { ServiceRegistry } from '../services/serviceRegistry'
import { ProxyService } from '../services/proxyService'

type RunMode = 'custom' | 'proxy' | 'default'

type KeepAliveMode = 'memory' | 'simple'

export interface OperationHandlerOptions {
    errorMessage: string | ((input: any) => string)
    keepAlive?: KeepAliveMode
    /** Override `config.processingWait` for the keepAlive timer (ms). Use when pre-output work can exceed client idle timeouts. */
    keepAliveIntervalMs?: number
}

function resolveRunMode(context: any, proxy: ProxyService, operationName: string): { runMode: RunMode; isProxyServer: boolean } {
    const isProxyServer = proxy.isProxyService()
    const isCustom = context[operationName] !== undefined
    const isProxyClient = !isProxyServer && proxy.isProxyMode()
    const runMode: RunMode = isCustom ? 'custom' : isProxyClient ? 'proxy' : 'default'
    return { runMode, isProxyServer }
}

function scheduleKeepAlive(
    handlerOptions: OperationHandlerOptions,
    config: FusionConfig,
    runMode: RunMode,
    isProxyServer: boolean,
    res: { keepAlive: () => void }
): ReturnType<typeof setInterval> | undefined {
    const everyMs = handlerOptions.keepAliveIntervalMs ?? config.processingWait

    if (handlerOptions.keepAlive === 'memory') {
        if (isProxyServer) {
            return undefined
        }
        return setInterval(() => {
            const memoryUsage = process.memoryUsage()
            logger.info(
                `Memory usage - RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB, Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB, Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`
            )
            res.keepAlive()
        }, everyMs)
    }

    if (handlerOptions.keepAlive === 'simple' && runMode !== 'proxy') {
        return setInterval(() => {
            res.keepAlive()
        }, everyMs)
    }

    return undefined
}

async function runOperation(
    runMode: RunMode,
    operationName: string,
    context: any,
    serviceRegistry: ServiceRegistry,
    input: any,
    defaultFn: (...args: any[]) => Promise<void>
): Promise<void> {
    switch (runMode) {
        case 'custom':
            await context[operationName](serviceRegistry, input)
            return
        case 'proxy':
            await serviceRegistry.proxy.execute(input)
            return
        default:
            await defaultFn(serviceRegistry, input)
    }
}

/**
 * Standard wrapper for connector operations: resolves custom vs proxy vs default execution,
 * optional keep-alive, unified errors, and registry lifecycle.
 */
export function createOperationHandler(
    operationName: string,
    defaultFn: (...args: any[]) => Promise<void>,
    config: FusionConfig,
    options: OperationHandlerOptions
): any {
    return async (context: any, input: any, res: any) => {
        let interval: ReturnType<typeof setInterval> | undefined
        try {
            const serviceRegistry = new ServiceRegistry(config, context, res, operationName)
            const { runMode, isProxyServer } = resolveRunMode(context, serviceRegistry.proxy, operationName)
            interval = scheduleKeepAlive(options, config, runMode, isProxyServer, res)

            logger.info(`Running ${operationName} in ${runMode} mode`)
            await runOperation(runMode, operationName, context, serviceRegistry, input, defaultFn)
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
