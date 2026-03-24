import { ConnectorError, ConnectorErrorType, logger } from '@sailpoint/connector-sdk'
import { ApiQueue } from './clientService/queue'
import { QueuePriority } from './clientService/types'
import { getCallerInfo } from './logCallerInfo'

export { getCallerInfo, getCallerFunctionName } from './logCallerInfo'

type Logger = typeof logger

/**
 * Log levels in order of priority (lowest to highest)
 * debug < info < warn < error
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type AggregationIssueSummary = {
    warningCount: number
    errorCount: number
    warningSamples: string[]
    errorSamples: string[]
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
}

type LogConfig = {
    spConnDebugLoggingEnabled: boolean
    logLevel?: LogLevel
    // External logging configuration
    externalLoggingEnabled?: boolean
    externalLoggingUrl?: string
    externalLoggingLevel?: LogLevel
    /** Optional operation name for log attribution, e.g. "accountList" */
    operationContext?: string
}

/**
 * Lightweight timer for tracking per-phase elapsed time within an operation.
 * Created via {@link LogService.timer}. Calls delegate to the parent LogService
 * so caller-origin detection and external logging continue to work.
 */
export class PhaseTimer {
    private log: LogService
    private operationStart: number
    private phaseStart: number

    constructor(log: LogService) {
        this.log = log
        this.operationStart = Date.now()
        this.phaseStart = this.operationStart
    }

    /** Logs message with elapsed time since last checkpoint, then resets the phase clock. */
    phase(message: string, level: LogLevel = 'info'): void {
        const now = Date.now()
        const elapsed = now - this.phaseStart
        this.log[level](`${message} (${PhaseTimer.formatElapsed(elapsed)})`)
        this.phaseStart = now
    }

    /** Logs message with total elapsed time since timer creation. */
    end(message: string, level: LogLevel = 'info'): void {
        const totalElapsed = Date.now() - this.operationStart
        this.log[level](`${message} (total: ${PhaseTimer.formatElapsed(totalElapsed)})`)
    }

    /** Returns formatted total elapsed time since timer creation. */
    totalElapsed(): string {
        return PhaseTimer.formatElapsed(Date.now() - this.operationStart)
    }

    /** Formats milliseconds as "Xms" (<1s) or "X.Ys" (>=1s). */
    static formatElapsed(ms: number): string {
        if (ms < 1000) return `${ms}ms`
        return `${(ms / 1000).toFixed(1)}s`
    }
}

/**
 * Structured logging service wrapping the SailPoint SDK logger.
 *
 * Features:
 * - Configurable log levels (debug, info, warn, error)
 * - Automatic caller origin detection via stack trace analysis
 * - Optional external logging to a remote HTTP endpoint
 * - Assertion-style logging (similar to `console.assert`)
 * - Crash method that logs and throws a ConnectorError
 * - Flush support for serverless environments
 */
export class LogService {
    private logger: Logger
    private configuredLevel: LogLevel
    /** Operation name for log attribution (e.g. accountList, accountCreate) */
    private operationContext?: string
    // External logging settings
    private externalLoggingEnabled: boolean
    private externalLoggingUrl?: string
    private externalLoggingLevel: LogLevel
    // Track pending external log promises so they can be flushed before process exit.
    // Uses a Set for O(1) add/delete instead of array indexOf which is O(n).
    private pendingExternalLogs: Set<Promise<void>> = new Set()
    /** Per-request timeout for external log fetches to prevent unbounded memory growth
     *  when the endpoint is unreachable (TCP timeouts can be 30-120s+ at the OS level). */
    private static readonly EXTERNAL_LOG_TIMEOUT_MS = 5_000
    private apiQueue: ApiQueue | null = null
    private issueSummary: AggregationIssueSummary = {
        warningCount: 0,
        errorCount: 0,
        warningSamples: [],
        errorSamples: [],
    }
    private static readonly ISSUE_SAMPLE_LIMIT = 6
    private static readonly ISSUE_MESSAGE_MAX_LENGTH = 180

    /**
     * @param config - Logging configuration including level, debug flag, and external logging settings
     */
    constructor(config: LogConfig) {
        this.logger = logger
        // Determine configured log level: explicit logLevel > debug flag > default 'info'
        if (config.logLevel) {
            this.configuredLevel = config.logLevel
        } else if (config.spConnDebugLoggingEnabled) {
            this.configuredLevel = 'debug'
        } else {
            this.configuredLevel = 'info'
        }

        // External logging configuration
        this.externalLoggingEnabled = config.externalLoggingEnabled ?? false
        this.externalLoggingUrl = config.externalLoggingUrl
        this.externalLoggingLevel = config.externalLoggingLevel ?? 'error'
        this.operationContext = config.operationContext

        // Also set the underlying logger level
        logger.level = this.configuredLevel
    }

    /**
     * Injects the API queue for routing external log calls with LOW priority.
     * Called by ServiceRegistry after ClientService is created.
     */
    setQueue(queue: ApiQueue | null): void {
        this.apiQueue = queue
    }

    /**
     * Checks if a message at the given level should be sent to the external service.
     * Returns true if external logging is enabled and the message level is
     * at or above (less verbose than) the configured external logging level.
     */
    private shouldSendExternal(messageLevel: LogLevel): boolean {
        if (!this.externalLoggingEnabled || !this.externalLoggingUrl) {
            return false
        }
        return LOG_LEVEL_PRIORITY[messageLevel] >= LOG_LEVEL_PRIORITY[this.externalLoggingLevel]
    }

    /**
     * Pads log level to ensure alignment (7 characters including brackets)
     * Used for external logging service
     */
    private padLogLevel(level: LogLevel): string {
        const levelMap: Record<LogLevel, string> = {
            debug: '[DEBUG]',
            info: '[INFO] ',
            warn: '[WARN] ',
            error: '[ERROR]',
        }
        return levelMap[level]
    }

    /**
     * Sends a log message to the external logging service in plain text.
     * This is fire-and-forget to avoid blocking the main execution.
     * Sends plain text: HH:MM:SS [LEVEL] origin: message
     * The log server will handle colorization for console display.
     */
    private sendToExternalService(level: LogLevel, message: string, data?: any, origin?: string): void {
        if (!this.externalLoggingUrl) return

        // Format timestamp as HH:MM:SS
        const now = new Date()
        const timestamp = now.toTimeString().split(' ')[0]

        // Build the log message with padding (no colors - log server handles that)
        const paddedLevel = this.padLogLevel(level)
        const fn = origin || 'unknown'
        const opPrefix = this.operationContext ? `[${this.operationContext}] ` : ''
        // When run from an operation, operation tag is sufficient; omit origin to avoid redundancy
        const originPart = this.operationContext ? '' : `${fn}: `
        let logMessage = `${timestamp} ${paddedLevel} ${opPrefix}${originPart}${message}`

        // Append data if present
        if (data !== undefined && data !== null) {
            if (data instanceof Error) {
                logMessage += ` [Error: ${data.name}: ${data.message}]`
            } else if (typeof data === 'object') {
                try {
                    logMessage += ` ${JSON.stringify(data)}`
                } catch {
                    logMessage += ` ${String(data)}`
                }
            } else {
                logMessage += ` ${String(data)}`
            }
        }

        const url = this.externalLoggingUrl
        const doFetch = () =>
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: logMessage,
                signal: AbortSignal.timeout(LogService.EXTERNAL_LOG_TIMEOUT_MS),
            }).then(() => {})

        const pending: Promise<void> = (
            this.apiQueue ? this.apiQueue.enqueue(doFetch, { priority: QueuePriority.LOW }).then(() => {}) : doFetch()
        )
            .catch(() => {})
            .finally(() => {
                this.pendingExternalLogs.delete(pending)
            })
        this.pendingExternalLogs.add(pending)
    }

    /**
     * Formats a log message with caller origin and optional data payload.
     * Handles Error objects, primitives, and JSON-serializable objects.
     *
     * @param message - The base log message
     * @param data - Optional data to append (Error, primitive, or object)
     * @param origin - The caller origin string (e.g. "FusionService>processFusionAccount")
     * @returns The formatted log string
     */
    private formatMessage(message: string, data?: any, origin?: string): string {
        const fn = origin || 'unknown'
        const prefix = this.operationContext ? `[${this.operationContext}] ` : ''
        // When run from an operation, operation tag is sufficient; omit origin to avoid redundancy
        const originPart = this.operationContext ? '' : `${fn}: `

        if (data === undefined || data === null) {
            return `${prefix}${originPart}${message}`
        }

        // Handle Error objects
        if (data instanceof Error) {
            return `${prefix}${originPart}${message} [Error: ${data.name}: ${data.message}${data.stack ? ' | Stack: ' + data.stack : ''}]`
        }

        // Handle primitives (string, number, boolean, bigint, symbol)
        if (['string', 'number', 'boolean', 'bigint', 'symbol'].includes(typeof data)) {
            return `${prefix}${originPart}${message} ${String(data)}`
        }

        // Handle objects and arrays
        try {
            return `${prefix}${originPart}${message} ${JSON.stringify(data)}`
        } catch (e) {
            // If data is not serializable
            return `${prefix}${originPart}${message} [Unserializable data: ${JSON.stringify(data)}] ${e}`
        }
    }

    /**
     * Internal log method that handles both regular and external logging.
     *
     * Performance Optimization:
     * Stack trace capture (getCallerInfo) is one of the most expensive operations in V8.
     * We only pay that cost when caller origin is actually needed: when external logging
     * is enabled for this level, or when debug-level logging is configured.
     */
    private log(level: LogLevel, message: string, data?: any): void {
        this.trackIssue(level, message)
        const needsOrigin = this.shouldSendExternal(level) || this.configuredLevel === 'debug'
        const origin = needsOrigin ? getCallerInfo(3).origin : undefined

        const output = this.formatMessage(message, data, origin)

        // Use SDK logger - it handles timestamp and level formatting
        this.logger[level](output)

        // Send to external service if enabled and level threshold is met
        if (this.shouldSendExternal(level)) {
            this.sendToExternalService(level, message, data, origin)
        }
    }

    private trackIssue(level: LogLevel, message: string): void {
        if (level !== 'warn' && level !== 'error') return

        const normalized = message.replace(/\s+/g, ' ').trim()
        const truncated =
            normalized.length > LogService.ISSUE_MESSAGE_MAX_LENGTH
                ? `${normalized.slice(0, LogService.ISSUE_MESSAGE_MAX_LENGTH - 3)}...`
                : normalized

        if (level === 'warn') {
            this.issueSummary.warningCount += 1
            if (
                this.issueSummary.warningSamples.length < LogService.ISSUE_SAMPLE_LIMIT &&
                !this.issueSummary.warningSamples.includes(truncated)
            ) {
                this.issueSummary.warningSamples.push(truncated)
            }
            return
        }

        this.issueSummary.errorCount += 1
        if (
            this.issueSummary.errorSamples.length < LogService.ISSUE_SAMPLE_LIMIT &&
            !this.issueSummary.errorSamples.includes(truncated)
        ) {
            this.issueSummary.errorSamples.push(truncated)
        }
    }

    getAggregationIssueSummary(): AggregationIssueSummary {
        return {
            warningCount: this.issueSummary.warningCount,
            errorCount: this.issueSummary.errorCount,
            warningSamples: [...this.issueSummary.warningSamples],
            errorSamples: [...this.issueSummary.errorSamples],
        }
    }

    /**
     * Logs an informational message. Used for significant operational milestones.
     * @param message - The log message
     * @param data - Optional structured data to attach
     */
    info(message: string, data?: any): void {
        this.log('info', message, data)
    }

    /**
     * Logs a debug message. Only output when log level is "debug".
     * Used for detailed diagnostic information during development.
     * @param message - The log message
     * @param data - Optional structured data to attach
     */
    debug(message: string, data?: any): void {
        this.log('debug', message, data)
    }

    /**
     * Logs a warning message. Used for recoverable issues that deserve attention.
     * @param message - The log message
     * @param data - Optional structured data to attach
     */
    warn(message: string, data?: any): void {
        this.log('warn', message, data)
    }

    /**
     * Logs an error message. Used for failures that don't warrant an exception.
     * @param message - The log message
     * @param data - Optional structured data to attach
     */
    error(message: string, data?: any): void {
        this.log('error', message, data)
    }

    /**
     * Logs a message at the specified level only if the condition is false.
     * Also sends to external service if enabled and level threshold is met.
     * Similar to console.assert()
     * @param condition If false, the message will be logged
     * @param message The message to log
     * @param data Optional data to include
     * @param level The log level to use (default: 'error')
     */
    assert(condition: boolean, message: string, data?: any, level: LogLevel = 'error'): void {
        if (!condition) {
            this.trackIssue(level, message)
            const callerInfo = getCallerInfo(2)
            const { origin } = callerInfo
            const assertMessage = `Assertion failed: ${message}`
            const output = this.formatMessage(assertMessage, data, origin)

            // Use SDK logger - it handles timestamp and level formatting
            this.logger[level](output)

            // Send to external service if enabled and level threshold is met
            if (this.shouldSendExternal(level)) {
                this.sendToExternalService(level, assertMessage, data, origin)
            }
        }
    }

    /**
     * Logs an error message and immediately throws a {@link ConnectorError}.
     * Used for unrecoverable failures that should halt the current operation.
     *
     * @param message - The error message (also used as the ConnectorError message)
     * @param data - Optional error or structured data to attach
     * @throws {ConnectorError} Always thrown after logging
     */
    crash(message: string, data?: any): void {
        this.trackIssue('error', message)
        const callerInfo = getCallerInfo(2)
        const { origin } = callerInfo
        const output = this.formatMessage(message, data, origin)

        // Use SDK logger - it handles timestamp and level formatting
        this.logger.error(output)

        // Send to external service (crash is always error level)
        if (this.shouldSendExternal('error')) {
            this.sendToExternalService('error', message, data, origin)
        }

        // Build a descriptive error message that includes the original error detail.
        // This ensures the user sees context about what went wrong, not just the generic message.
        let errorMessage = message
        if (data instanceof Error && data.message && data.message !== message) {
            errorMessage = `${message}: ${data.message}`
        } else if (data !== undefined && data !== null && !(data instanceof Error)) {
            errorMessage = `${message}: ${String(data)}`
        }

        throw new ConnectorError(errorMessage, ConnectorErrorType.Generic)
    }

    /**
     * Creates a {@link PhaseTimer} for tracking per-phase elapsed time.
     * Call `phase()` after each phase/step completes, and `end()` for the final summary.
     */
    timer(): PhaseTimer {
        return new PhaseTimer(this)
    }

    /**
     * Gets the currently configured log level
     */
    getLogLevel(): LogLevel {
        return this.configuredLevel
    }

    /**
     * Sets the log level at runtime
     */
    setLogLevel(level: LogLevel): void {
        this.configuredLevel = level
        this.logger.level = level
    }

    /**
     * Gets the external logging level threshold
     */
    getExternalLogLevel(): LogLevel {
        return this.externalLoggingLevel
    }

    /**
     * Sets the external logging level threshold at runtime
     */
    setExternalLogLevel(level: LogLevel): void {
        this.externalLoggingLevel = level
    }

    /**
     * Checks if external logging is enabled
     */
    isExternalLoggingEnabled(): boolean {
        return this.externalLoggingEnabled && !!this.externalLoggingUrl
    }

    /**
     * Awaits all pending external log fetch calls.
     * Must be called before the operation handler returns to ensure all log
     * messages are delivered in cloud/serverless environments where the
     * container is recycled immediately after the handler completes.
     * @param timeoutMs Maximum time to wait for pending logs (default: 5000ms)
     */
    async flush(timeoutMs: number = 5000): Promise<void> {
        if (this.pendingExternalLogs.size === 0) return
        const pending = [...this.pendingExternalLogs]
        await Promise.race([
            Promise.allSettled(pending),
            new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
        ])
        // Clear any stragglers that didn't settle in time
        this.pendingExternalLogs.clear()
    }
}
