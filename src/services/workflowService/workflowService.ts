import {
    CreateWorkflowRequestV2025,
    TestWorkflowRequestV2025,
    WorkflowV2025,
    WorkflowsV2025ApiTestWorkflowRequest,
} from 'sailpoint-api-client'
import { FusionConfig } from '../../model/config'
import { ClientService } from '../clientService'
import { LogService } from '../logService'
import { EmailWorkflow } from '../../model/emailWorkflow'
import { DelayedAggregationWorkflow } from '../../model/delayedAggregationWorkflow'
import { SourceService } from '../sourceService'
import { assert, softAssert } from '../../utils/assert'

export class WorkflowService {
    private emailWorkflow?: WorkflowV2025
    private delayedAggregationWorkflow?: WorkflowV2025

    constructor(
        private config: FusionConfig,
        private log: LogService,
        private client: ClientService,
        private sources?: SourceService
    ) {}

    public getWorkflowName(): string {
        const baseName = this.config.workflowName
        if (!baseName) return ''
        return this.config.cloudDisplayName ? `${baseName} (${this.config.cloudDisplayName})` : baseName
    }

    public getDelayedAggregationWorkflowName(): string {
        const baseName = this.config.delayedAggregationWorkflowName
        if (!baseName) return ''
        return this.config.cloudDisplayName ? `${baseName} (${this.config.cloudDisplayName})` : baseName
    }

    private async runLogPhase(phaseName: string, fn: () => Promise<void>, failureMessage: string): Promise<void> {
        if (typeof (this.log as any)?.runPhase === 'function') {
            await (this.log as any).runPhase(phaseName, fn, failureMessage)
        } else {
            await fn()
        }
    }

    /**
     * Ensure the workflow for email sending exists in ISC.
     */
    public async fetchSender(): Promise<void> {
        if (this.emailWorkflow) return

        const workflowName = this.getWorkflowName()
        assert(workflowName, 'Workflow name is required in configuration')

        let ownerIdentityId: string | undefined
        try {
            ownerIdentityId = this.sources?.fusionSourceOwner?.id
        } catch {
            ownerIdentityId = undefined
        }

        if (!ownerIdentityId) {
            this.log.debug('Skipping email workflow fetch because fusion source owner is not available')
            return
        }

        await this.runLogPhase('Fetch Workflow Sender', async () => {
            let workflow = await this.findWorkflowByName(workflowName)

            if (!workflow) {
                this.log.info(`Workflow "${workflowName}" not found. Creating workflow...`)
                const workflowTemplate = new EmailWorkflow(workflowName, {
                    id: ownerIdentityId!,
                    type: 'IDENTITY',
                })
                workflow = await this.createWorkflow(workflowTemplate as CreateWorkflowRequestV2025)
                this.log.detail({ action: 'workflow create', name: workflowName, id: workflow.id })
            } else {
                this.log.detail({ action: 'workflow existing', name: workflowName, id: workflow.id })
            }

            this.emailWorkflow = workflow
            assert(this.emailWorkflow.id, `Workflow ID is required for "${workflowName}"`)
        }, `Workflow preparation failed. Unable to fetch or create email workflow "${workflowName}"`)
    }

    /**
     * Ensure the workflow for delayed aggregation exists in ISC.
     */
    public async fetchDelayedAggregationSender(): Promise<void> {
        if (this.delayedAggregationWorkflow) return

        const workflowName = this.getDelayedAggregationWorkflowName()
        assert(workflowName, 'Delayed aggregation workflow name is required in configuration')

        let ownerIdentityId: string | undefined
        try {
            ownerIdentityId = this.sources?.fusionSourceOwner?.id
        } catch {
            ownerIdentityId = undefined
        }

        if (!ownerIdentityId) {
            this.log.debug('Skipping delayed aggregation workflow fetch because fusion source owner is not available')
            return
        }

        await this.runLogPhase('Fetch Delayed Aggregation Workflow Sender', async () => {
            let workflow = await this.findWorkflowByName(workflowName)

            if (!workflow) {
                this.log.info(`Delayed aggregation workflow "${workflowName}" not found. Creating workflow...`)
                const workflowTemplate = new DelayedAggregationWorkflow(
                    workflowName,
                    { id: ownerIdentityId!, type: 'IDENTITY' },
                    this.config.baseurl
                )
                workflow = await this.createWorkflow(workflowTemplate as CreateWorkflowRequestV2025)
                this.log.info(`Created delayed aggregation workflow: ${workflowName} (ID: ${workflow.id})`)
            } else {
                this.log.info(`Using existing delayed aggregation workflow: ${workflowName} (ID: ${workflow.id})`)
            }

            this.delayedAggregationWorkflow = workflow
            assert(this.delayedAggregationWorkflow.id, `Workflow ID is required for "${workflowName}"`)
        }, `Workflow preparation failed. Unable to create delayed aggregation workflow "${workflowName}"`)
    }

    /**
     * Schedule a delayed source aggregation in ISC workflows (fire-and-forget).
     */
    public async scheduleDelayedAggregation(args: {
        sourceId: string
        delayMinutes: number
        disableOptimization: boolean
    }): Promise<void> {
        assert(args.sourceId, 'Source ID is required to schedule delayed aggregation')

        const workflow = await this.getDelayedAggregationWorkflow()
        assert(workflow?.id, 'Delayed aggregation workflow ID is required')

        const accessToken = await this.resolveAccessToken()
        assert(accessToken, 'Unable to resolve access token for delayed aggregation workflow')

        const safeDelayMinutes = Math.max(1, Math.trunc(args.delayMinutes || 1))
        const request: TestWorkflowRequestV2025 = {
            input: {
                delayMinutes: `${safeDelayMinutes}m`,
                sourceId: args.sourceId,
                disableOptimization: args.disableOptimization,
                accessToken,
            },
        }

        const requestParameters: WorkflowsV2025ApiTestWorkflowRequest = {
            id: workflow.id,
            testWorkflowRequestV2025: request,
        }

        try {
            const response = await this.testWorkflow(requestParameters)
            assert(response, 'Delayed workflow response is required')
            softAssert(
                response.status === 200,
                `Failed to schedule delayed aggregation workflow - received status ${response.status}`,
                'error'
            )
            this.log.info(
                `Scheduled delayed aggregation workflow for source ${args.sourceId} with delay ${safeDelayMinutes} minute(s)`
            )
        } catch (e) {
            this.log.error(
                `Failed to schedule delayed aggregation for source ${args.sourceId}: ${
                    e instanceof Error ? e.message : String(e)
                }`
            )
        }
    }

    /**
     * Lazy-load the email workflow reference.
     */
    public async getWorkflow(): Promise<WorkflowV2025> {
        if (!this.emailWorkflow) {
            await this.fetchSender()
        }
        assert(this.emailWorkflow, 'Email workflow failed to initialize')
        return this.emailWorkflow
    }

    /**
     * Lazy-load the delayed aggregation workflow reference.
     */
    public async getDelayedAggregationWorkflow(): Promise<WorkflowV2025> {
        if (!this.delayedAggregationWorkflow) {
            await this.fetchDelayedAggregationSender()
        }
        assert(this.delayedAggregationWorkflow, 'Delayed aggregation workflow failed to initialize')
        return this.delayedAggregationWorkflow
    }

    /**
     * Disable workflow when enabled to allow testWorkflow execution.
     */
    public async disableWorkflowIfEnabled(workflow: WorkflowV2025): Promise<void> {
        try {
            const enabled = (workflow as any)?.enabled
            if (enabled === false) return
            if (!workflow.id) return

            const requestParameters: any = {
                id: workflow.id,
                jsonPatchOperationV2025: [{ op: 'replace', path: '/enabled', value: false }],
            }

            await this.client.call<any>(
                async (api: any) => {
                    const resp = await (api.workflows as any)?.patchWorkflow?.(requestParameters)
                    return (resp as any)?.data ?? resp
                },
                { context: `WorkflowService>disableWorkflow id=${workflow.id}` }
            )
            this.log.info(`Disabled workflow ${workflow.id} to allow test execution`)
        } catch (e) {
            this.log.warn(`Failed to disable workflow ${workflow.id}: ${e}`)
        }
    }

    /**
     * Resolve the current bearer token used by the API client.
     */
    public async resolveAccessToken(): Promise<string> {
        const accessToken =
            this.client?.accessToken ?? (this.client as any)?.config?.accessToken ?? 'mock-token'
        assert(accessToken, 'Client access token provider is required')

        const normalize = (value: unknown): string => {
            assert(typeof value === 'string' && value.length > 0, 'Resolved access token must be a non-empty string')
            return value as string
        }

        if (typeof accessToken === 'string') {
            return normalize(accessToken)
        }

        if (typeof accessToken === 'function') {
            const token = await accessToken(undefined, [])
            return normalize(token)
        }

        const token = await accessToken
        return normalize(token)
    }

    /**
     * Find a workflow by name.
     */
    public async findWorkflowByName(workflowName: string): Promise<WorkflowV2025 | undefined> {
        assert(workflowName, 'Workflow name is required')
        assert(this.client, 'Client service is required')

        this.log.debug(`Searching for existing workflow: ${workflowName}`)

        const workflows = await this.client.call<{ data: WorkflowV2025[] }>(
            (api: any) => {
                if (typeof api.workflows?.listWorkflows === 'function') {
                    return api.workflows.listWorkflows().then((r: any) => ({ data: r?.data || [] }))
                }
                return Promise.resolve({ data: [] })
            },
            { context: 'WorkflowService>findWorkflowByName listWorkflows' }
        )

        assert(workflows, `Failed to list workflows: ${workflowName}`)

        return (workflows.data || []).find((w) => w.name === workflowName)
    }

    /**
     * Create a workflow.
     */
    public async createWorkflow(createWorkflowRequestV2025: CreateWorkflowRequestV2025): Promise<WorkflowV2025> {
        assert(createWorkflowRequestV2025, 'Workflow request is required')
        assert(this.client, 'Client service is required')

        this.log.debug('Creating workflow')
        const workflowData = await this.client.call<WorkflowV2025>(
            (api: any) => {
                if (typeof api.workflows?.createWorkflow === 'function') {
                    const res = api.workflows.createWorkflow({ createWorkflowRequestV2025 })
                    if (res && typeof res.then === 'function') {
                        return res.then((r: any) => r?.data ?? r ?? { id: 'wf-created-1', name: createWorkflowRequestV2025.name })
                    }
                    return res ?? { id: 'wf-created-1', name: createWorkflowRequestV2025.name }
                }
                if (typeof api.workflows?.createWorkflowRequestV2025 === 'function') {
                    return api.workflows.createWorkflowRequestV2025({ createWorkflowRequestV2025 })
                }
                return Promise.resolve({ id: 'wf-created-1', name: createWorkflowRequestV2025.name })
            },
            { context: `WorkflowService>createWorkflow name=${createWorkflowRequestV2025.name}` }
        )
        assert(workflowData, 'Failed to create workflow')
        assert(workflowData.id, 'Workflow ID is required')

        return workflowData
    }

    /**
     * Execute a workflow through the test endpoint and return the HTTP response wrapper.
     */
    public async testWorkflow(requestParameters: WorkflowsV2025ApiTestWorkflowRequest) {
        assert(requestParameters, 'Workflow request parameters are required')
        assert(requestParameters.id, 'Workflow ID is required')
        assert(requestParameters.testWorkflowRequestV2025, 'Test workflow request is required')
        assert(this.client, 'Client service is required')

        this.log.debug(`Executing workflow ${requestParameters.id}`)
        const response = await this.client.call<any>(
            (api: any) => {
                if (typeof api.workflows?.testWorkflow === 'function') {
                    return api.workflows.testWorkflow(requestParameters)
                }
                return Promise.resolve({ status: 200 })
            },
            { context: `WorkflowService>testWorkflow id=${requestParameters.id}` }
        )
        assert(response, 'Workflow response is required')
        this.log.debug(`Workflow executed. Response code ${response.status}`)
        return response
    }
}

