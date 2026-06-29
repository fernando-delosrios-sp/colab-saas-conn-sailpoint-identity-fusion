import { Configuration, AccountsV2025Api, IdentitiesV2025Api, SearchApi, SourcesV2025Api, CustomFormsV2025Api, WorkflowsV2025Api, EntitlementsV2025Api, TransformsApi, GovernanceGroupsV2025Api, TaskManagementV2025Api, IdentityProfilesV2025Api, IdentityAttributesV2025Api } from 'sailpoint-api-client'

/**
 * Interface defining the ISC API communication seam.
 * Exposes lazy API getters and configuration.
 */
export interface IscApiAdapter {
    readonly config: Configuration
    readonly accountsApi: AccountsV2025Api
    readonly identitiesApi: IdentitiesV2025Api
    readonly searchApi: SearchApi
    readonly sourcesApi: SourcesV2025Api
    readonly customFormsApi: CustomFormsV2025Api
    readonly workflowsApi: WorkflowsV2025Api
    readonly entitlementsApi: EntitlementsV2025Api
    readonly transformsApi: TransformsApi
    readonly governanceGroupsApi: GovernanceGroupsV2025Api
    readonly taskManagementApi: TaskManagementV2025Api
    readonly identityProfilesApi: IdentityProfilesV2025Api
    readonly identityAttributesApi: IdentityAttributesV2025Api
}
