import { Configuration, AccountsV2025Api, IdentitiesV2025Api, SearchApi, SourcesV2025Api, CustomFormsV2025Api, WorkflowsV2025Api, EntitlementsV2025Api, TransformsApi, GovernanceGroupsV2025Api, TaskManagementV2025Api, IdentityProfilesV2025Api, IdentityAttributesV2025Api } from 'sailpoint-api-client'
import { IscApiAdapter } from '../../../../services/clientService/iscApiAdapter'

/**
 * A test-only IscApiAdapter that returns mock API objects.
 * Each API getter returns a vi.fn()-backed object whose methods can be configured
 * to return prerecorded data from ChainState.
 */
export class FakeApiAdapter implements IscApiAdapter {
    public readonly config: Configuration

    // Mocks for all API endpoints
    private _accountsApi: AccountsV2025Api = {} as any
    private _identitiesApi: IdentitiesV2025Api = {} as any
    private _searchApi: SearchApi = { searchPost: vi.fn() } as any
    private _sourcesApi: SourcesV2025Api = {} as any
    private _customFormsApi: CustomFormsV2025Api = {} as any
    private _workflowsApi: WorkflowsV2025Api = {} as any
    private _entitlementsApi: EntitlementsV2025Api = {} as any
    private _transformsApi: TransformsApi = {} as any
    private _governanceGroupsApi: GovernanceGroupsV2025Api = {} as any
    private _taskManagementApi: TaskManagementV2025Api = {} as any
    private _identityProfilesApi: IdentityProfilesV2025Api = {} as any
    private _identityAttributesApi: IdentityAttributesV2025Api = {} as any

    constructor(config: any) {
        this.config = config as Configuration
    }

    get accountsApi() { return this._accountsApi }
    get identitiesApi() { return this._identitiesApi }
    get searchApi() { return this._searchApi }
    get sourcesApi() { return this._sourcesApi }
    get customFormsApi() { return this._customFormsApi }
    get workflowsApi() { return this._workflowsApi }
    get entitlementsApi() { return this._entitlementsApi }
    get transformsApi() { return this._transformsApi }
    get governanceGroupsApi() { return this._governanceGroupsApi }
    get taskManagementApi() { return this._taskManagementApi }
    get identityProfilesApi() { return this._identityProfilesApi }
    get identityAttributesApi() { return this._identityAttributesApi }
}
