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

    constructor(name: string, owner: WorkflowBodyOwnerV2025) {
        this.name = name
        this.owner = owner
        this.definition = {
            start: 'Wait Delay',
            steps: {
                'End Step - Success': {
                    type: 'success',
                },
                'Wait Delay': {
                    actionId: 'sp:wait',
                    attributes: {
                        type: 'waitFor',
                        'waitDuration.$': '$.trigger.delay',
                    },
                    nextStep: 'Trigger Aggregation',
                    type: 'action',
                    versionNumber: 1,
                },
                'Trigger Aggregation': {
                    actionId: 'sp:http-request',
                    attributes: {
                        authenticationType: 'customAuthorization',
                        headerName: 'X-SailPoint-Experimental',
                        headerValue: 'true',
                        method: 'POST',
                        'requestUrl.$': '$.trigger.requestUrl',
                        requestHeaders: [
                            {
                                key: 'Authorization',
                                'value.$': '$.trigger.authorizationHeader',
                            },
                        ],
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
                id: 'idn:external:id',
            },
        } as WorkflowTriggerV2025
    }
}
