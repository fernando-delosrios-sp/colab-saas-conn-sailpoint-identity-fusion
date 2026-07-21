import https from 'https'
import { Configuration, AccountsV2025Api, IdentitiesV2025Api, SearchApi, SourcesV2025Api, CustomFormsV2025Api, WorkflowsV2025Api, EntitlementsV2025Api, TransformsApi, GovernanceGroupsV2025Api, TaskManagementV2025Api, IdentityProfilesV2025Api, IdentityAttributesV2025Api } from 'sailpoint-api-client'
import { IscApiAdapter } from './iscApiAdapter'
import { FusionConfig } from '../../model/config'
import { createRetriesConfig } from './helpers'
import { LogService } from '../logService'

/**
 * Production implementation of IscApiAdapter backed by the SailPoint SDK.
 */
export class SdkApiAdapter implements IscApiAdapter {
    public readonly config: Configuration

    // Lazy-loaded API instances
    private _accountsApi?: AccountsV2025Api
    private _identitiesApi?: IdentitiesV2025Api
    private _searchApi?: SearchApi
    private _sourcesApi?: SourcesV2025Api
    private _customFormsApi?: CustomFormsV2025Api
    private _workflowsApi?: WorkflowsV2025Api
    private _entitlementsApi?: EntitlementsV2025Api
    private _transformsApi?: TransformsApi
    private _governanceGroupsApi?: GovernanceGroupsV2025Api
    private _taskManagementApi?: TaskManagementV2025Api
    private _identityProfilesApi?: IdentityProfilesV2025Api
    private _identityAttributesApi?: IdentityAttributesV2025Api

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

        // Inject https agent with keepAlive: true to reuse TCP connections
        const agent = new https.Agent({ keepAlive: true })

        this.config = new Configuration({ ...fusionConfig, tokenUrl, baseOptions: { httpsAgent: agent } } as any)
        this.config.retriesConfig = retriesConfig

    }

    public get accountsApi(): AccountsV2025Api {
        return (this._accountsApi ??= new AccountsV2025Api(this.config))
    }

    public get identitiesApi(): IdentitiesV2025Api {
        return (this._identitiesApi ??= new IdentitiesV2025Api(this.config))
    }

    public get searchApi(): SearchApi {
        return (this._searchApi ??= new SearchApi(this.config))
    }

    public get sourcesApi(): SourcesV2025Api {
        return (this._sourcesApi ??= new SourcesV2025Api(this.config))
    }

    public get customFormsApi(): CustomFormsV2025Api {
        return (this._customFormsApi ??= new CustomFormsV2025Api(this.config))
    }

    public get workflowsApi(): WorkflowsV2025Api {
        return (this._workflowsApi ??= new WorkflowsV2025Api(this.config))
    }

    public get entitlementsApi(): EntitlementsV2025Api {
        return (this._entitlementsApi ??= new EntitlementsV2025Api(this.config))
    }

    public get transformsApi(): TransformsApi {
        return (this._transformsApi ??= new TransformsApi(this.config))
    }

    public get governanceGroupsApi(): GovernanceGroupsV2025Api {
        return (this._governanceGroupsApi ??= new GovernanceGroupsV2025Api(this.config))
    }

    public get taskManagementApi(): TaskManagementV2025Api {
        return (this._taskManagementApi ??= new TaskManagementV2025Api(this.config))
    }

    public get identityProfilesApi(): IdentityProfilesV2025Api {
        return (this._identityProfilesApi ??= new IdentityProfilesV2025Api(this.config))
    }

    public get identityAttributesApi(): IdentityAttributesV2025Api {
        return (this._identityAttributesApi ??= new IdentityAttributesV2025Api(this.config))
    }
}
