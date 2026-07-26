import { Configuration } from 'sailpoint-api-client'
import { IscApiAdapter } from './iscApiAdapter'
import { isWriteMethod, stableApiCallKey, syntheticDryRunId } from './apiWriteClassification'

type ShadowResponse = unknown

function extractRequestBody(args: unknown[]): Record<string, unknown> | undefined {
    const first = args[0]
    if (!first || typeof first !== 'object') return undefined
    const params = first as Record<string, unknown>
    const body = params.body
    if (body && typeof body === 'object') {
        return body as Record<string, unknown>
    }
    return params
}

/**
 * Wraps a live SDK adapter and inhibits write API calls during dry-run aggregation.
 * Reads delegate to the inner adapter; writes return synthetic SDK-shaped responses
 * from an in-memory shadow store keyed by stable call identity.
 */
export class DryRunApiAdapter implements IscApiAdapter {
    public readonly config: Configuration
    private readonly shadowStore = new Map<string, ShadowResponse>()

    constructor(private readonly inner: IscApiAdapter) {
        this.config = inner.config
    }

    private resolveSyntheticResponse(apiName: string, method: string, args: unknown[]): ShadowResponse {
        const key = stableApiCallKey(apiName, method, args)
        const cached = this.shadowStore.get(key)
        if (cached !== undefined) {
            return cached
        }

        const id = syntheticDryRunId(apiName, method, args)
        const lower = method.toLowerCase()
        let response: ShadowResponse

        if (lower.includes('formdefinition') || method === 'createFormDefinition') {
            response = { data: { id, name: `dry-run-form-${id}` } }
        } else if (lower.includes('forminstance') || method === 'createFormInstance') {
            const body = extractRequestBody(args)
            response = {
                data: {
                    id,
                    formDefinitionId: body?.formDefinitionId ?? id,
                    state: 'ASSIGNED',
                    recipients: body?.recipients ?? [],
                    formInput: body?.formInput,
                },
            }
        } else if (lower.startsWith('delete')) {
            response = { data: undefined }
        } else if (lower.startsWith('update') || lower.startsWith('patch') || lower.startsWith('put')) {
            response = { data: { id } }
        } else {
            response = { data: { id } }
        }

        this.shadowStore.set(key, response)
        return response
    }

    private createApiProxy<T extends object>(apiName: string, realApi: T): T {
        return new Proxy(realApi, {
            get: (_target, method: string | symbol) => {
                if (typeof method !== 'string') return Reflect.get(realApi, method)
                const original = Reflect.get(realApi, method)
                if (typeof original !== 'function') return original

                return (...args: unknown[]) => {
                    if (isWriteMethod(method)) {
                        return Promise.resolve(this.resolveSyntheticResponse(apiName, method, args))
                    }
                    return original.apply(realApi, args)
                }
            },
        })
    }

    get accountsApi() {
        return this.createApiProxy('accounts', this.inner.accountsApi)
    }
    get identitiesApi() {
        return this.createApiProxy('identities', this.inner.identitiesApi)
    }
    get searchApi() {
        return this.createApiProxy('search', this.inner.searchApi)
    }
    get sourcesApi() {
        return this.createApiProxy('sources', this.inner.sourcesApi)
    }
    get customFormsApi() {
        return this.createApiProxy('customForms', this.inner.customFormsApi)
    }
    get workflowsApi() {
        return this.createApiProxy('workflows', this.inner.workflowsApi)
    }
    get entitlementsApi() {
        return this.createApiProxy('entitlements', this.inner.entitlementsApi)
    }
    get transformsApi() {
        return this.createApiProxy('transforms', this.inner.transformsApi)
    }
    get governanceGroupsApi() {
        return this.createApiProxy('governanceGroups', this.inner.governanceGroupsApi)
    }
    get taskManagementApi() {
        return this.createApiProxy('taskManagement', this.inner.taskManagementApi)
    }
    get identityProfilesApi() {
        return this.createApiProxy('identityProfiles', this.inner.identityProfilesApi)
    }
    get identityAttributesApi() {
        return this.createApiProxy('identityAttributes', this.inner.identityAttributesApi)
    }
}

