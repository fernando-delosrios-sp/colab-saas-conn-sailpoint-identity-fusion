import https from 'https'
import axios, { AxiosInstance } from 'axios'
import { Configuration, AccountsV2025Api, IdentitiesV2025Api, SearchApi, SourcesV2025Api, CustomFormsV2025Api, WorkflowsV2025Api, EntitlementsV2025Api, TransformsApi, GovernanceGroupsV2025Api, TaskManagementV2025Api, IdentityProfilesV2025Api, IdentityAttributesV2025Api } from 'sailpoint-api-client'
import { IscApiAdapter } from './iscApiAdapter'
import { FusionConfig } from '../../model/config'
import { createRetriesConfig, getRequestAbortSignal } from './helpers'
import { LogService } from '../logService'

/**
 * Production implementation of IscApiAdapter backed by the SailPoint SDK.
 */
export class SdkApiAdapter implements IscApiAdapter {
    public readonly config: Configuration
    private readonly axiosInstance: AxiosInstance

    // Lazy-loaded API instances
    private accountsApiValue?: AccountsV2025Api
    private identitiesApiValue?: IdentitiesV2025Api
    private searchApiValue?: SearchApi
    private sourcesApiValue?: SourcesV2025Api
    private customFormsApiValue?: CustomFormsV2025Api
    private workflowsApiValue?: WorkflowsV2025Api
    private entitlementsApiValue?: EntitlementsV2025Api
    private transformsApiValue?: TransformsApi
    private governanceGroupsApiValue?: GovernanceGroupsV2025Api
    private taskManagementApiValue?: TaskManagementV2025Api
    private identityProfilesApiValue?: IdentityProfilesV2025Api
    private identityAttributesApiValue?: IdentityAttributesV2025Api

    constructor(
        fusionConfig: FusionConfig,
        protected log: LogService
    ) {
        const tokenUrl = new URL(fusionConfig.baseurl).origin + fusionConfig.tokenUrlPath

        // The API queue is always enabled and acts as the sole retry authority (exponential backoff
        // + jitter via calculateRetryDelay). Enabling axios-retry at the same time would cause a
        // single failed request to be retried by axios first and then retried again by the queue
        // after axios exhausts its own budget — multiplying the effective retry count unexpectedly.
        const retriesConfig = createRetriesConfig(0)

        // Inject https agent with keepAlive and connection pool bounds
        const agent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 30000,
            maxSockets: 50,
            maxFreeSockets: 10,
            timeout: 60000,
        })

        this.axiosInstance = axios.create()
        this.axiosInstance.interceptors.request.use((requestConfig) => {
            const signal = getRequestAbortSignal()
            if (signal) {
                requestConfig.signal = signal
            }
            return requestConfig
        })

        this.config = new Configuration({ ...fusionConfig, tokenUrl, baseOptions: { httpsAgent: agent } } as any)
        this.config.retriesConfig = retriesConfig

    }

    public get accountsApi(): AccountsV2025Api {
        return (this.accountsApiValue ??= new AccountsV2025Api(this.config, undefined, this.axiosInstance))
    }

    public get identitiesApi(): IdentitiesV2025Api {
        return (this.identitiesApiValue ??= new IdentitiesV2025Api(this.config, undefined, this.axiosInstance))
    }

    public get searchApi(): SearchApi {
        return (this.searchApiValue ??= new SearchApi(this.config, undefined, this.axiosInstance))
    }

    public get sourcesApi(): SourcesV2025Api {
        return (this.sourcesApiValue ??= new SourcesV2025Api(this.config, undefined, this.axiosInstance))
    }

    public get customFormsApi(): CustomFormsV2025Api {
        return (this.customFormsApiValue ??= new CustomFormsV2025Api(this.config, undefined, this.axiosInstance))
    }

    public get workflowsApi(): WorkflowsV2025Api {
        return (this.workflowsApiValue ??= new WorkflowsV2025Api(this.config, undefined, this.axiosInstance))
    }

    public get entitlementsApi(): EntitlementsV2025Api {
        return (this.entitlementsApiValue ??= new EntitlementsV2025Api(this.config, undefined, this.axiosInstance))
    }

    public get transformsApi(): TransformsApi {
        return (this.transformsApiValue ??= new TransformsApi(this.config, undefined, this.axiosInstance))
    }

    public get governanceGroupsApi(): GovernanceGroupsV2025Api {
        return (this.governanceGroupsApiValue ??= new GovernanceGroupsV2025Api(this.config, undefined, this.axiosInstance))
    }

    public get taskManagementApi(): TaskManagementV2025Api {
        return (this.taskManagementApiValue ??= new TaskManagementV2025Api(this.config, undefined, this.axiosInstance))
    }

    public get identityProfilesApi(): IdentityProfilesV2025Api {
        return (this.identityProfilesApiValue ??= new IdentityProfilesV2025Api(this.config, undefined, this.axiosInstance))
    }

    public get identityAttributesApi(): IdentityAttributesV2025Api {
        return (this.identityAttributesApiValue ??= new IdentityAttributesV2025Api(this.config, undefined, this.axiosInstance))
    }
}


