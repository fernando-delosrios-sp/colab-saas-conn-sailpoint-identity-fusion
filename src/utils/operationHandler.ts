import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { safeReadConfig } from '../data/config'
import { FusionConfig } from '../model/config'
import { ServiceRegistry } from '../services/serviceRegistry'
import { ProxyService } from '../services/proxyService'
import { assertProxyRouting } from './proxyRole'
import { unwrapOutputStream } from './responseBackpressure'

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

interface ActiveAccountListRun {
    abort: (reason: Error) => void
}

/**
 * Tracks the active persistent `accountList` run per connector instance in this process.
 * When the platform abandons an invocation on a warm container and dispatches a new
 * `std:account:list` for the same instance, superseding the zombie prevents two massive
 * runs from accumulating in the same V8 heap simultaneously.
 */
const activeAccountListRuns = new Map<string, ActiveAccountListRun>()

function resolveAccountListInstanceKey(
    operationName: string,
    config: FusionConfig,
    input: any,
    runMode: RunMode
): string | undefined {
    if (operationName !== 'accountList' || runMode === RunMode.Proxy) return undefined
    if (input?.dryRun?.enabled === true) return undefined
    const instanceId = typeof config.spConnectorInstanceId === 'string' ? config.spConnectorInstanceId.trim() : ''
    return instanceId.length > 0 ? instanceId : undefined
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

/** Upper bound on the keep-alive period, leaving headroom under the 180s platform limit for event-loop stalls. */
const MAX_KEEP_ALIVE_INTERVAL_MS = 45_000

function scheduleKeepAlive(
    handlerOptions: OperationHandlerOptions,
    config: FusionConfig,
    runMode: RunMode,
    isProxyServer: boolean,
    res: { keepAlive: () => void },
    abortSignal: AbortSignal
): ReturnType<typeof setInterval> | undefined {
    // processingWait defaults to the platform's 180s ceiling, so one blocked tick would exceed it.
    // Keep-alive is a no-cost call: always fire well inside the ceiling.
    const everyMs = Math.min(
        handlerOptions.keepAliveIntervalMs ?? config.processingWait ?? MAX_KEEP_ALIVE_INTERVAL_MS,
        MAX_KEEP_ALIVE_INTERVAL_MS
    )

    const sendKeepAlive = () => {
        if (abortSignal.aborted) return
        res.keepAlive()
    }

    if (handlerOptions.keepAlive === 'memory') {
        if (isProxyServer) {
            return undefined
        }
        return setInterval(sendKeepAlive, everyMs)
    }

    if (handlerOptions.keepAlive === 'simple' && runMode !== RunMode.Proxy) {
        return setInterval(sendKeepAlive, everyMs)
    }

    return undefined
}

function watchResponseStreamDisconnect(res: any, onDisconnect: (reason: Error) => void): () => void {
    const stream = unwrapOutputStream(res)
    if (!stream || typeof stream.on !== 'function' || typeof stream.removeListener !== 'function') {
        return () => {}
    }

    if (stream.destroyed && !stream.writableFinished) {
        onDisconnect(new Error('Operation aborted: response stream was already destroyed'))
        return () => {}
    }

    const onClose = () => {
        if (!stream.writableFinished) {
            onDisconnect(new Error('Operation aborted: response stream closed prematurely'))
        }
    }
    const onError = (error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error)
        onDisconnect(new Error(`Operation aborted: response stream error (${detail})`))
    }

    stream.on('close', onClose)
    stream.on('error', onError)

    return () => {
        stream.removeListener('close', onClose)
        stream.removeListener('error', onError)
    }
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
        logger.info(`[${operationName}] DETAIL action=start`)
        const config: FusionConfig = await safeReadConfig()
        let interval: ReturnType<typeof setInterval> | undefined
        const operationAbort = new AbortController()
        const serviceRegistry = new ServiceRegistry(config, context, res, operationName)
        serviceRegistry.abortSignal = operationAbort.signal
        const replayStepTimestamp = config.recording?.replayStepTimestamp ?? process.env.REPLAY_STEP_TIMESTAMP
        if (replayStepTimestamp) {
            serviceRegistry.run.setSimulatedTime(replayStepTimestamp)
        }

        const stopBackgroundActivity = () => {
            if (interval) {
                clearInterval(interval)
                interval = undefined
                serviceRegistry.log.stopEventLoopWatchdog()
            }
            serviceRegistry.log.stopOperationHeartbeat?.()
        }

        const abortOperation = (reason: Error) => {
            if (operationAbort.signal.aborted) return
            serviceRegistry.log.warn?.(reason.message)
            operationAbort.abort(reason)
            stopBackgroundActivity()
            serviceRegistry.client?.getQueue?.()?.clear?.()
            serviceRegistry.run?.clearManagedAccountState?.()
        }

        let stopWatchingStream: () => void = () => {}
        let activeRunKey: string | undefined
        let activeRunEntry: ActiveAccountListRun | undefined

        try {
            assertProxyRouting(config)
            const { runMode, isProxyServer } = resolveRunMode(context, serviceRegistry.proxy, operationName)

            activeRunKey = resolveAccountListInstanceKey(operationName, config, input, runMode)
            if (activeRunKey) {
                const previous = activeAccountListRuns.get(activeRunKey)
                if (previous) {
                    previous.abort(
                        new Error(
                            `Operation aborted: superseded by a newer ${operationName} invocation for instance ${activeRunKey}`
                        )
                    )
                }
                activeRunEntry = { abort: abortOperation }
                activeAccountListRuns.set(activeRunKey, activeRunEntry)
            }

            interval = scheduleKeepAlive(options, config, runMode, isProxyServer, res, operationAbort.signal)
            if (interval) {
                serviceRegistry.log.startEventLoopWatchdog()
            }
            stopWatchingStream = watchResponseStreamDisconnect(res, abortOperation)

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
            stopWatchingStream()
            if (activeRunKey && activeAccountListRuns.get(activeRunKey) === activeRunEntry) {
                activeAccountListRuns.delete(activeRunKey)
            }
            serviceRegistry.run?.clearSimulatedTime?.()
            stopBackgroundActivity()
        }
    }
}





