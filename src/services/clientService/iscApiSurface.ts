import type {
    AccountsV2025Api,
    IdentitiesV2025Api,
    SearchApi,
    SourcesV2025Api,
    CustomFormsV2025Api,
    WorkflowsV2025Api,
    EntitlementsV2025Api,
    TransformsApi,
    GovernanceGroupsV2025Api,
    TaskManagementV2025Api,
    IdentityProfilesV2025Api,
    IdentityAttributesV2025Api,
} from 'sailpoint-api-client'

/**
 * The ISC API surface exposed to callbacks in `client.call()`.
 * Mirrors `IscApiAdapter` without the `config` property — callers
 * receive API instances scoped to the callback, preventing reference capture.
 */
export interface IscApiSurface {
    readonly accounts: AccountsV2025Api
    readonly identities: IdentitiesV2025Api
    readonly search: SearchApi
    readonly sources: SourcesV2025Api
    readonly customForms: CustomFormsV2025Api
    readonly workflows: WorkflowsV2025Api
    readonly entitlements: EntitlementsV2025Api
    readonly transforms: TransformsApi
    readonly governanceGroups: GovernanceGroupsV2025Api
    readonly taskManagement: TaskManagementV2025Api
    readonly identityProfiles: IdentityProfilesV2025Api
    readonly identityAttributes: IdentityAttributesV2025Api
}
