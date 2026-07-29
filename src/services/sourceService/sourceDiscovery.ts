import { BaseConfig, SourceConfig, SourceType } from '../../model/config'
import { FusionRun } from '../../model/fusionRun'
import { assert } from '../../utils/assert'
import { wrapConnectorError } from '../../utils/error'
import { readPathString } from '../../utils/safeRead'
import { ClientService, QueuePriority } from '../clientService'
import { LogService } from '../logService'
import { getCompiledAccountJmespathFilter } from './managedAccountFetcher'
import { SourceInfo } from './types'

interface SourceDiscoveryState {
    sources: SourceConfig[]
    spConnectorInstanceId: string
    allSources?: SourceInfo[]
    fusionSourceId?: string
    fusionSourceOwner?: import('sailpoint-api-client').OwnerDto
    fusionSourceManagementWorkgroupId?: string
    sourcesById: Map<string, SourceInfo>
    workgroupMemberIdsByWorkgroupId: Map<string, string[]>
    accountJmespathFiltersBySourceName: Map<string, import('./accountFilters').CompiledAccountJmespathFilter>
}

export interface SourceDiscoveryDeps {
    log: LogService
    client: ClientService
    run: FusionRun
    state: SourceDiscoveryState
}

/**
 * Fetch all sources (managed and fusion) and cache them
 */
export async function fetchAllSources(deps: SourceDiscoveryDeps, requireFusionSource = true): Promise<void> {
    const { log, client, run, state } = deps
    log.debug('Fetching all sources')

    const apiSources = await wrapConnectorError(
        () =>
            client.call<any>(
                (api: any, params: any) => api.sources.listSources(params),
                { paginate: { mode: 'sequential', baseParams: {} }, priority: QueuePriority.HIGH, context: 'SourceService>fetchAllSources listSources' }
            ),
        'Failed to fetch sources from ISC. Please verify your connector configuration and API credentials'
    )
    assert(
        apiSources.length > 0,
        'No sources found in ISC. Please verify that the configured sources exist and the connector has access to them.'
    )

    const apiSourcesByName = new Map(apiSources.map((s) => [s.name!, s]))
    const resolvedSources: SourceInfo[] = []

    for (const sourceConfig of state.sources) {
        const apiSource = apiSourcesByName.get(sourceConfig.name)
        assert(
            apiSource,
            `Unable to find managed source "${sourceConfig.name}" in ISC. Please verify the source name is correct in the connector configuration.`
        )
        resolvedSources.push({
            id: apiSource.id!,
            name: apiSource.name!,
            isManaged: true,
            sourceType: sourceConfig.sourceType ?? SourceType.Authoritative,
            config: sourceConfig,
        })
    }

    const fusionSource = apiSources.find(
        (x) => (x.connectorAttributes as BaseConfig).spConnectorInstanceId === state.spConnectorInstanceId
    )
    if (fusionSource) {
        assert(
            fusionSource.owner,
            'Fusion source owner not found. The fusion source must have an owner configured in ISC.'
        )
        state.fusionSourceId = fusionSource.id!
        state.fusionSourceOwner = {
            id: fusionSource.owner.id!,
            type: (fusionSource.owner.type ?? 'IDENTITY') as import('sailpoint-api-client').OwnerDto['type'],
        }
        state.fusionSourceManagementWorkgroupId = readPathString(fusionSource, ['managementWorkgroup', 'id'])
        state.workgroupMemberIdsByWorkgroupId.clear()

        resolvedSources.push({
            id: fusionSource.id!,
            name: fusionSource.name!,
            isManaged: false,
            sourceType: SourceType.Authoritative,
            config: undefined,
            owner: state.fusionSourceOwner,
        })
    } else if (requireFusionSource) {
        assert(
            fusionSource,
            'Fusion source not found. The connector instance could not locate its own source in ISC. Verify the connector is properly deployed.'
        )
    } else {
        state.fusionSourceId = undefined
        state.fusionSourceOwner = undefined
        state.fusionSourceManagementWorkgroupId = undefined
        state.workgroupMemberIdsByWorkgroupId.clear()
        log.warn(
            'Fusion source not found for this run. Continuing with managed sources only (custom report mode).'
        )
    }

    state.allSources = resolvedSources
    state.sourcesById = new Map(resolvedSources.map((x) => [x.id, x]))
    run.sourcesByName.clear()
    for (const source of resolvedSources) {
        run.sourcesByName.set(source.name, source)
    }

    const managedCount = resolvedSources.filter((s) => s.isManaged).length
    if (fusionSource) {
        log.debug(`Found ${managedCount} managed source(s) and fusion source: ${fusionSource.name}`)
    } else {
        log.debug(`Found ${managedCount} managed source(s); no fusion source resolved`)
    }
}

/**
 * Compile/validate configured Accounts JMESPath filters for managed sources.
 * Throws ConnectorError when any expression is invalid.
 */
export function validateAccountJmespathFilters(deps: SourceDiscoveryDeps): void {
    const { state } = deps
    assert(state.allSources, 'Sources have not been loaded')
    const managedSources = state.fusionSourceId
        ? state.allSources.filter((s) => s.id !== state.fusionSourceId)
        : state.allSources

    for (const source of managedSources) {
        getCompiledAccountJmespathFilter(source, state.accountJmespathFiltersBySourceName)
    }
}
