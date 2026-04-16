import {
    CreateWorkflowRequestV2025,
    WorkflowBodyOwnerV2025,
    WorkflowDefinitionV2025,
    WorkflowTriggerV2025,
} from 'sailpoint-api-client'

export class DelayedAggregationWorkflow implements CreateWorkflowRequestV2025 {
    name: string
    owner: WorkflowBodyOwnerV2025
    definition: WorkflowDefinitionV2025
    trigger: WorkflowTriggerV2025

    constructor(name: string, owner: WorkflowBodyOwnerV2025, apiBaseUrl: string) {
        this.name = name
        this.owner = owner
        this.definition = {
            start: 'Wait',
            steps: {
                'End Step - Success': {
                    type: 'success',
                },
                Wait: {
                    actionId: 'sp:sleep',
                    attributes: {
                        type: 'waitFor',
                        'duration.$': '$.trigger.delayMinutes',
                    },
                    nextStep: 'Trigger Aggregation',
                    type: 'action',
                    versionNumber: 1,
                },
                'Trigger Aggregation': {
                    actionId: 'sp:http',
                    attributes: {
                        authenticationType: null,
                        jsonRequestBody: {
                            disableOptimization: '{{$.trigger.disableOptimization}}',
                        },
                        method: 'post',
                        requestContentType: 'json',
                        requestHeaders: {
                            Authorization: 'Bearer {{$.trigger.accessToken}}',
                        },
                        url: `${apiBaseUrl}/v2025/sources/{{$.trigger.sourceId}}/load-accounts`,
                    },
                    nextStep: 'End Step - Success',
                    type: 'action',
                    versionNumber: 2,
                },
            },
        }

        // Type incorrectly requires a frequency property, but it causes an error if provided.
        this.trigger = {
            type: 'EXTERNAL',
            attributes: {
                id: 'idn:external-http',
            },
        } as WorkflowTriggerV2025
    }
}
