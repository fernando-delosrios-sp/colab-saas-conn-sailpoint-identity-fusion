import { AsyncLocalStorage } from 'node:async_hooks'
import { Context, ConnectorError, ConnectorErrorType, Response, StandardCommand } from '@sailpoint/connector-sdk'
import { FusionConfig } from '../model/config'
import { OperationContext } from './fusionService/types'
import { LogService } from './logService'
import { InMemoryLockService, LockService } from './lockService'
import { ClientService, SdkApiAdapter, ApiQueue } from './clientService'
import { SourceService } from './sourceService'
import { FusionService } from './fusionService'
import { IdentityService } from './identityService'
import { SchemaService } from './schemaService'
import { FormService } from './formService'
import { AttributeService } from './attributeService'
import { EntitlementService } from './entitlementService'
import { ScoringService } from './scoringService'
import { MessagingService } from './messagingService'
import { ProxyService } from './proxyService'
import { ReportService } from './reportService'
import { RecordingService } from './recordingService'

/**
 * Central dependency injection container for all connector services.
 *
 * Instantiates and wires together all services in dependency order during construction.
 * Each service can be overridden via the SDK context (useful for testing). The active
 * registry for an in-flight operation is tracked via {@link AsyncLocalStorage} so that
 * deeply-nested code can access services without prop-drilling while still being
 * isolated per concurrent operation.
 */
export class ServiceRegistry {
    private static readonly storage = new AsyncLocalStorage<ServiceRegistry>()
    public log: LogService
    public locks: LockService
    public client: ClientService
    public sources: SourceService
    public fusion: FusionService
    public identities: IdentityService
    public schemas: SchemaService
    public forms: FormService
    public attributes: AttributeService
    public entitlements: EntitlementService
    public scoring: ScoringService
    public messaging: MessagingService
    public reports: ReportService
    public proxy: ProxyService
    public recording?: RecordingService

    /**
     * Creates a new ServiceRegistry, initializing all services in dependency order.
     * Services provided via `context` override the default implementations.
     *
     * @param config - The resolved fusion configuration
     * @param context - SDK context, optionally providing pre-built service overrides
     * @param res - SDK response object for sending results back to the platform
     * @param operationContext - Optional operation name for log attribution (e.g. "accountList")
     */
    constructor(
        public config: FusionConfig,
        context: Context,
        public res: Response<any>,
        operationContext?: string
    ) {
        // Initialize core services first
        const logConfig = operationContext ? { ...config, operationContext } : config
        this.log = context.logService ?? new LogService(logConfig)
        this.locks = context.lockService ?? new InMemoryLockService(this.log)

        if (context.connectionService) {
            this.client = context.connectionService
            this.log.setQueue(this.client.getQueue())
        } else {
            const adapter = new SdkApiAdapter(this.config, this.log)
            const queueConfig = this.config.enableQueue ? {
                requestsPerSecond: this.config.requestsPerSecond ?? this.config.requestsPerSecondConstant,
                maxConcurrentRequests: this.config.maxConcurrentRequests ?? Math.max(10, (this.config.requestsPerSecond ?? this.config.requestsPerSecondConstant) * 2),
                maxRetries: this.config.enableRetry ? (this.config.maxRetries ?? this.config.retriesConstant) : 0,
                enablePriority: this.config.enablePriority ?? true,
            } : null
            const queue = queueConfig ? new ApiQueue(queueConfig) : null
            this.client = new ClientService(adapter, queue, this.config, this.log)
            this.log.setQueue(queue)
        }

        // Initialize services that don't depend on others
        this.sources = context.sourceService ?? new SourceService(this.config, this.log, this.client)
        this.entitlements = context.entitlementService ?? new EntitlementService(this.sources)
        this.scoring = context.scoringService ?? new ScoringService(this.config, this.log)
        this.identities =
            context.identityService ?? new IdentityService(this.config, this.log, this.client, this.sources)
        this.messaging =
            context.messagingService ??
            new MessagingService(this.config, this.log, this.client, this.sources, this.identities)
        this.forms =
            context.formService ??
            new FormService(this.config, this.log, this.client, this.sources, this.identities, this.messaging)

        // Initialize services that depend on others (in dependency order)
        this.schemas = context.schemaService ?? new SchemaService(this.config, this.log, this.sources, this.identities)
        const commandType = context.commandType as StandardCommand | undefined
        this.attributes =
            context.attributesService ??
            new AttributeService(this.config, this.schemas, this.sources, this.log, this.locks)

        // Initialize FusionService last (depends on multiple services)
        this.fusion =
            context.fusionService ??
            new FusionService(
                this.config,
                this.log,
                this.identities,
                this.sources,
                this.forms,
                this.attributes,
                this.scoring,
                this.schemas,
                commandType,
                operationContext as OperationContext | undefined
            )

        this.reports = new ReportService(
            this.config.baseurl,
            this.log,
            this.sources,
            this.identities,
            this.forms,
            this.fusion,
            this.messaging
        )

        this.proxy = context.proxyService ?? new ProxyService(this.config, this.log, this.res, commandType)

        if (process.env.RECORD_MODE === 'true') {
            const recordingService = (context as any).recordingService as RecordingService | undefined
            this.recording = recordingService ?? RecordingService.init(this.log, this.config)
            this.log.info(`RecordingService enabled — chain: ${this.recording.getName()}`)
        }
    }

    /**
     * Runs a callback with `reg` bound as the active registry for the duration of the
     * async call tree. Nested service accessors (e.g. via {@link getCurrent}) read
     * the registry from the current `AsyncLocalStorage` context, so concurrent
     * operations each see their own registry without cross-contamination.
     *
     * The callback is invoked with no arguments and is expected to perform async
     * work; any value (including `undefined`) it resolves to is returned to the
     * caller.
     *
     * @param reg - The registry instance to make active
     * @param callback - Async work that may read the active registry
     * @returns The result of `callback`
     */
    static run<T>(reg: ServiceRegistry, callback: () => Promise<T>): Promise<T> {
        return this.storage.run(reg, callback)
    }

    /**
     * Retrieves the active registry singleton from the current `AsyncLocalStorage`
     * context. Replaces the previous process-global `static current` to make the
     * registry request-scoped.
     *
     * @returns The current ServiceRegistry instance
     * @throws {ConnectorError} If no registry is bound in the current context
     */
    static getCurrent(): ServiceRegistry {
        const reg = this.storage.getStore()
        if (!reg) {
            throw new ConnectorError('ServiceRegistry not found', ConnectorErrorType.Generic)
        }
        return reg
    }

    /**
     * Flushes pending logs for the active registry, if any. Retained for backward
     * compatibility with callers that previously invoked `clear()` to drop the
     * process-global reference. With `AsyncLocalStorage`, context cleanup is handled
     * by the call tree boundary established via {@link run}.
     */
    static clear() {
        void this.storage.getStore()?.log?.flush()
    }
}
