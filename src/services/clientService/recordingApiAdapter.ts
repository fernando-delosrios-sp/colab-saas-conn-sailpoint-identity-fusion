import { Configuration } from 'sailpoint-api-client'
import { IscApiAdapter } from './iscApiAdapter'
import { sanitizeApiPayload } from '../../utils/sanitizeForJson'

export interface ApiLogEntry {
    api: string
    method: string
    args: unknown[]
    response: unknown
    timestamp: string
}

export class RecordingApiAdapter implements IscApiAdapter {
    public readonly config: Configuration

    constructor(
        private readonly inner: IscApiAdapter,
        private readonly onApiCall: (entry: ApiLogEntry) => void,
        private readonly onRecordError?: (message: string) => void
    ) {
        this.config = inner.config
    }

    private createApiProxy<T extends object>(apiName: string, realApi: T): T {
        return new Proxy(realApi, {
            get: (_target, method: string | symbol) => {
                if (typeof method !== 'string') return Reflect.get(realApi, method)
                const original = Reflect.get(realApi, method)
                if (typeof original !== 'function') return original
                return (...args: unknown[]) => {
                    const result = original.apply(realApi, args)
                    return Promise.resolve(result).then((response) => {
                        queueMicrotask(() => {
                            try {
                                this.onApiCall({
                                    api: apiName,
                                    method,
                                    args: args.map(sanitizeApiPayload),
                                    response: sanitizeApiPayload(response),
                                    timestamp: new Date().toISOString(),
                                })
                            } catch (err) {
                                this.onRecordError?.(
                                    `Failed to record ${apiName}.${method}: ${err instanceof Error ? err.message : String(err)}`
                                )
                            }
                        })
                        return response
                    })
                }
            },
        })
    }

    get accountsApi() { return this.createApiProxy('accounts', this.inner.accountsApi) }
    get identitiesApi() { return this.createApiProxy('identities', this.inner.identitiesApi) }
    get searchApi() { return this.createApiProxy('search', this.inner.searchApi) }
    get sourcesApi() { return this.createApiProxy('sources', this.inner.sourcesApi) }
    get customFormsApi() { return this.createApiProxy('customForms', this.inner.customFormsApi) }
    get workflowsApi() { return this.createApiProxy('workflows', this.inner.workflowsApi) }
    get entitlementsApi() { return this.createApiProxy('entitlements', this.inner.entitlementsApi) }
    get transformsApi() { return this.createApiProxy('transforms', this.inner.transformsApi) }
    get governanceGroupsApi() { return this.createApiProxy('governanceGroups', this.inner.governanceGroupsApi) }
    get taskManagementApi() { return this.createApiProxy('taskManagement', this.inner.taskManagementApi) }
    get identityProfilesApi() { return this.createApiProxy('identityProfiles', this.inner.identityProfilesApi) }
    get identityAttributesApi() { return this.createApiProxy('identityAttributes', this.inner.identityAttributesApi) }
}
