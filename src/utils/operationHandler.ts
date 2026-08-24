import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { safeReadConfig } from '../data/config'
import { FusionConfig } from '../model/config'
import { ServiceRegistry } from '../services/serviceRegistry'
import { ProxyService } from '../services/proxyService'
import { assertProxyRouting } from './proxyRole'

/** Operation execution route selected at runtime. */
enum RunMode {
    Custom = 'custom',
    Proxy = 'proxy',
    Default = 'default',
}

/** Keep-alive signal style during long-running operations. */
type KeepAliveMode = 'memory' | 'simple'

export interface OperationHandlerOptions {
    errorMessage: string | ((input: any) => string)
    keepAlive?: KeepAliveMode
    /** Override `config.processingWait` for the keepAlive timer (ms). Use when pre-output work can exceed client idle timeouts. */
    keepAliveIntervalMs?: number
}

function resolveRunMode(
    context: any,
    proxy: ProxyService,
    operationName: string
): { runMode: RunMode; isProxyServer: boolean } {
    const isProxyClient = proxy.isProxyMode()
    const isProxyServer = !isProxyClient && proxy.isProxyService()
    const isCustom = context[operationName] !== undefined
    const runMode: RunMode = isCustom ? RunMode.Custom : isProxyClient ? RunMode.Proxy : RunMode.Default
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
            res.keepAlive()
        }, everyMs)
    }

    if (handlerOptions.keepAlive === 'simple' && runMode !== RunMode.Proxy) {
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
        case RunMode.Custom:
            await context[operationName](serviceRegistry, input)
            return
        case RunMode.Proxy:
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
    options: OperationHandlerOptions
): any {
    return async (context: any, input: any, res: any) => {
        const config: FusionConfig = await safeReadConfig()
        let interval: ReturnType<typeof setInterval> | undefined
        const serviceRegistry = new ServiceRegistry(config, context, res, operationName)
        const replayStepTimestamp = config.recording?.replayStepTimestamp ?? process.env.REPLAY_STEP_TIMESTAMP
        if (replayStepTimestamp) {
            serviceRegistry.run.setSimulatedTime(replayStepTimestamp)
        }
        try {
            assertProxyRouting(config)
            const { runMode, isProxyServer } = resolveRunMode(context, serviceRegistry.proxy, operationName)
            interval = scheduleKeepAlive(options, config, runMode, isProxyServer, res)
            if (interval) {
                serviceRegistry.log.startEventLoopWatchdog()
            }

            serviceRegistry.log.detail({ mode: runMode })
            serviceRegistry.recording?.startOperation(
                operationName,
                input,
                res,
                serviceRegistry.run
            )
            await ServiceRegistry.run(serviceRegistry, () =>
                runOperation(runMode, operationName, context, serviceRegistry, input, defaultFn)
            )
            serviceRegistry.recording?.endOperation(
                serviceRegistry.run
            )
        } catch (error) {
            if (error instanceof ConnectorError) throw error
            logger.error(error)
            const detail = error instanceof Error ? error.message : String(error)
            const msg = typeof options.errorMessage === 'function' ? options.errorMessage(input) : options.errorMessage
            throw new ConnectorError(`${msg}: ${detail}`, ConnectorErrorType.Generic)
        } finally {
            serviceRegistry.run?.clearSimulatedTime?.()
            if (interval) {
                clearInterval(interval)
                serviceRegistry.log.stopEventLoopWatchdog()
            }
        }
    }
}





