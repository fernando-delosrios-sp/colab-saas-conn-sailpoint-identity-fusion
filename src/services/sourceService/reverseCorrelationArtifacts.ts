import {
    AttributeDefinitionTypeV2025,
    AttributeDefinitionV2025,
    CorrelationConfigV2025,
    JsonPatchOperationV2025OpV2025,
    SchemaV2025,
    SourcesV2025ApiGetCorrelationConfigRequest,
    SourcesV2025ApiPutCorrelationConfigRequest,
    SourcesV2025ApiPutSourceSchemaRequest,
} from 'sailpoint-api-client'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'
import { FusionConfig, SourceConfig, SourceType } from '../../model/config'
import { FusionRun } from '../../model/fusionRun'
import { assert } from '../../utils/assert'
import { ClientService, QueuePriority } from '../clientService'
import { LogService } from '../logService'
import {
    buildIdentityAttributeCreateErrorMessage,
    buildIdentityProfileUpsertErrorMessage,
    IDENTITY_PROFILE_PENDING_OPERATIONS_HINT,
} from './sourceReverseCorrelationErrors'
import { SourceInfo } from './types'

type ReverseCorrelationArtifact =
    | 'fusion_schema_attribute'
    | 'identity_attribute'
    | 'identity_profile_mapping'
    | 'managed_source_correlation'

export interface ReverseCorrelationSetupStatus {
    isConsistent: boolean
    missingArtifacts: ReverseCorrelationArtifact[]
}

/** Authoritative sources need fusion schema + identity profile mapping for reverse correlation; record/orphan only identity attribute + managed-source correlation. */
export function requiresFullReverseCorrelationArtifacts(sourceConfig: SourceConfig): boolean {
    return (sourceConfig.sourceType ?? SourceType.Authoritative) === SourceType.Authoritative
}

export interface ReverseCorrelationDeps {
    log: LogService
    client: ClientService
    config: FusionConfig
    run: FusionRun
    getFusionSourceId: () => string
    getFusionSource: () => SourceInfo | undefined
    listSourceSchemas: (sourceId: string) => Promise<SchemaV2025[]>
    invalidateSourceSchemasCache: (sourceId: string) => void
    reverseCorrelationReadinessBySourceName: Set<string>
    waitForIdentityProfileMapping: (
        profileId: string,
        attributeName: string,
        fusionSourceName: string,
        fusionSourceId: string
    ) => Promise<boolean>
}

/**
 * Validate that a reverse correlation attribute name does not overlap with
 * existing attribute mappings, normal/unique definitions, or source schema attributes.
 */
export function validateNoAttributeOverlap(
    config: FusionConfig,
    attributeName: string,
    schemaAttributeNames: Set<string>
): void {
    const lowerName = attributeName.toLowerCase()

    for (const attrMap of config.attributeMaps ?? []) {
        if (attrMap.newAttribute.toLowerCase() === lowerName) {
            throw new ConnectorError(
                `Reverse correlation attribute "${attributeName}" conflicts with attribute mapping "${attrMap.newAttribute}".`,
                ConnectorErrorType.Generic
            )
        }
    }

    for (const def of config.normalAttributeDefinitions ?? []) {
        if (def.name.toLowerCase() === lowerName) {
            throw new ConnectorError(
                `Reverse correlation attribute "${attributeName}" conflicts with normal attribute definition "${def.name}".`,
                ConnectorErrorType.Generic
            )
        }
    }

    for (const def of config.uniqueAttributeDefinitions ?? []) {
        if (def.name.toLowerCase() === lowerName) {
            throw new ConnectorError(
                `Reverse correlation attribute "${attributeName}" conflicts with unique attribute definition "${def.name}".`,
                ConnectorErrorType.Generic
            )
        }
    }

    if (schemaAttributeNames.has(lowerName)) {
        throw new ConnectorError(
            `Reverse correlation attribute "${attributeName}" conflicts with an existing source account schema attribute.`,
            ConnectorErrorType.Generic
        )
    }
}

/**
 * Ensure all ISC entities for reverse correlation are properly configured.
 * Called once per source with `correlationMode === 'reverse'` during aggregation setup.
 */
export async function runEnsureReverseCorrelationSetup(
    deps: ReverseCorrelationDeps,
    sourceConfig: SourceConfig,
    schemaAttributeNames: Set<string>,
    hooks: {
        ensureReverseCorrelationSetupPhases: (
            correlationAttribute: string,
            correlationDisplayName: string,
            managedSourceId: string,
            sourceConfig: SourceConfig
        ) => Promise<void>
        getReverseCorrelationSetupStatus: (
            correlationAttribute: string,
            managedSourceId: string,
            sourceConfig: SourceConfig
        ) => Promise<ReverseCorrelationSetupStatus>
        repairReverseCorrelationSetup: (
            correlationAttribute: string,
            correlationDisplayName: string,
            managedSourceId: string,
            status: ReverseCorrelationSetupStatus,
            sourceConfig: SourceConfig
        ) => Promise<void>
    }
): Promise<void> {
    const { log, reverseCorrelationReadinessBySourceName } = deps
    const { correlationAttribute, correlationDisplayName, name: sourceName } = sourceConfig
    assert(correlationAttribute, `Reverse correlation attribute name is required for source "${sourceName}"`)
    assert(correlationDisplayName, `Reverse correlation display name is required for source "${sourceName}"`)

    validateNoAttributeOverlap(deps.config, correlationAttribute, schemaAttributeNames)

    const sourceInfo = deps.run.sourcesByName.get(sourceName)
    assert(sourceInfo, `Source "${sourceName}" not found`)

    const scope = requiresFullReverseCorrelationArtifacts(sourceConfig) ? 'full' : 'minimal'
    log.info(
        `Setting up reverse correlation for source "${sourceName}" (${scope}): attribute="${correlationAttribute}", displayName="${correlationDisplayName}"`
    )

    await hooks.ensureReverseCorrelationSetupPhases(
        correlationAttribute,
        correlationDisplayName,
        sourceInfo.id,
        sourceConfig
    )

    const initialStatus = await hooks.getReverseCorrelationSetupStatus(
        correlationAttribute,
        sourceInfo.id,
        sourceConfig
    )
    if (initialStatus.isConsistent) {
        reverseCorrelationReadinessBySourceName.add(sourceName)
        return
    }

    log.warn(
        `Reverse correlation setup verification failed for source "${sourceName}" (missing: ${initialStatus.missingArtifacts.join(', ')}). Attempting one auto-repair pass.`
    )
    await hooks.repairReverseCorrelationSetup(
        correlationAttribute,
        correlationDisplayName,
        sourceInfo.id,
        initialStatus,
        sourceConfig
    )

    const repairedStatus = await hooks.getReverseCorrelationSetupStatus(
        correlationAttribute,
        sourceInfo.id,
        sourceConfig
    )
    if (!repairedStatus.isConsistent) {
        throw new ConnectorError(
            `Reverse correlation setup is inconsistent for source "${sourceName}" after auto-repair. Missing artifacts: ${repairedStatus.missingArtifacts.join(', ')}.`,
            ConnectorErrorType.Generic
        )
    }
    reverseCorrelationReadinessBySourceName.add(sourceName)
    log.info(`Reverse correlation setup verified for source "${sourceName}"`)
}

/**
 * Reset reverse-correlation readiness cache (e.g. at account-list aggregation start).
 */
export function clearReverseCorrelationReadinessCache(deps: ReverseCorrelationDeps): void {
    deps.reverseCorrelationReadinessBySourceName.clear()
}

/**
 * Set up reverse correlation for multiple sources sequentially.
 */
export async function setupReverseCorrelationSources(
    deps: ReverseCorrelationDeps,
    sources: SourceConfig[],
    schemaAttrNames: Set<string>,
    ensureSetup: (sourceConfig: SourceConfig, schemaAttributeNames: Set<string>) => Promise<void>
): Promise<number> {
    const { log } = deps
    const reverseCorrelationSources = sources.filter((sc) => sc.correlationMode === 'reverse')
    if (reverseCorrelationSources.length === 0) {
        return 0
    }
    for (const sc of reverseCorrelationSources) {
        try {
            await ensureSetup(sc, schemaAttrNames)
        } catch (error) {
            log.error(
                `Reverse correlation setup failed for source "${sc.name}" (attribute="${sc.correlationAttribute ?? 'unset'}"): ${error instanceof Error ? error.message : String(error)
                }`
            )
            throw error
        }
    }
    return reverseCorrelationSources.length
}

/**
 * Validate reverse-correlation prerequisites for runtime operations.
 */
export async function runAssertReverseCorrelationReady(
    deps: ReverseCorrelationDeps,
    sourceConfig: SourceConfig,
    getStatus: (
        correlationAttribute: string,
        managedSourceId: string,
        sourceConfig: SourceConfig
    ) => Promise<ReverseCorrelationSetupStatus>
): Promise<void> {
    const { correlationAttribute, name: sourceName } = sourceConfig
    assert(correlationAttribute, `Reverse correlation attribute name is required for source "${sourceName}"`)
    if (deps.reverseCorrelationReadinessBySourceName.has(sourceName)) {
        return
    }
    const sourceInfo = deps.run.sourcesByName.get(sourceName)
    assert(sourceInfo, `Source "${sourceName}" not found`)
    const status = await getStatus(correlationAttribute, sourceInfo.id, sourceConfig)
    if (!status.isConsistent) {
        throw new ConnectorError(
            `Reverse correlation prerequisites are not ready for source "${sourceName}". Missing artifacts: ${status.missingArtifacts.join(', ')}.`,
            ConnectorErrorType.Generic
        )
    }
    deps.reverseCorrelationReadinessBySourceName.add(sourceName)
}

export async function getReverseCorrelationSetupStatus(
    deps: ReverseCorrelationDeps,
    correlationAttribute: string,
    managedSourceId: string,
    sourceConfig: SourceConfig
): Promise<ReverseCorrelationSetupStatus> {
    const missingArtifacts: ReverseCorrelationArtifact[] = []
    const full = requiresFullReverseCorrelationArtifacts(sourceConfig)

    const [fusionSchemaReady, identityAttributeReady, identityProfileReady, managedCorrelationReady] =
        await Promise.all([
            full ? hasFusionSchemaAttribute(deps, correlationAttribute) : Promise.resolve(true),
            hasSearchableIdentityAttribute(deps, correlationAttribute),
            full ? hasIdentityProfileMapping(deps, correlationAttribute, sourceConfig) : Promise.resolve(true),
            hasManagedSourceCorrelation(deps, correlationAttribute, managedSourceId),
        ])

    if (full && !fusionSchemaReady) {
        missingArtifacts.push('fusion_schema_attribute')
    }

    if (!identityAttributeReady) {
        missingArtifacts.push('identity_attribute')
    }

    if (full && !identityProfileReady) {
        missingArtifacts.push('identity_profile_mapping')
    }

    if (!managedCorrelationReady) {
        missingArtifacts.push('managed_source_correlation')
    }

    return {
        isConsistent: missingArtifacts.length === 0,
        missingArtifacts,
    }
}

export async function ensureFusionSchemaAttribute(
    deps: ReverseCorrelationDeps,
    attributeName: string,
    displayName: string
): Promise<void> {
    const { log, client, invalidateSourceSchemasCache } = deps
    const fusionSourceId = deps.getFusionSourceId()
    const schemas = await deps.listSourceSchemas(fusionSourceId)
    const accountSchema = schemas.find((s) => s.name === 'account')
    assert(accountSchema, 'Fusion source account schema not found')

    const existingAttr = accountSchema.attributes?.find(
        (a) => a.name?.toLowerCase() === attributeName.toLowerCase()
    )
    if (existingAttr) {
        log.debug(`Fusion schema attribute "${attributeName}" already exists`)
        return
    }

    const newAttr: AttributeDefinitionV2025 = {
        name: attributeName,
        description: displayName,
        type: AttributeDefinitionTypeV2025.String,
        isMulti: false,
        isEntitlement: false,
        isGroup: false,
    }

    const updatedAttributes: AttributeDefinitionV2025[] = [...(accountSchema.attributes ?? []), newAttr]

    const updatedSchema: SchemaV2025 = {
        ...accountSchema,
        attributes: updatedAttributes,
    }

    const requestParameters: SourcesV2025ApiPutSourceSchemaRequest = {
        sourceId: fusionSourceId,
        schemaId: accountSchema.id!,
        schemaV2025: updatedSchema,
    }

    const updated = await client.call(
        (api: any) => api.sources.putSourceSchema(requestParameters).then((r: any) => r.data),
        { priority: QueuePriority.HIGH, context: `SourceService>ensureFusionSchemaAttribute ${attributeName}` }
    )
    if (!updated) {
        throw new ConnectorError(
            `Failed to add reverse correlation attribute "${attributeName}" to Fusion source schema.`,
            ConnectorErrorType.Generic
        )
    }

    invalidateSourceSchemasCache(fusionSourceId)

    log.info(`Added reverse correlation attribute "${attributeName}" to Fusion source schema`)
}

function buildSearchableIdentityAttributePayload(
    name: string,
    displayName: string
): { name: string; displayName: string; searchable: true; type: 'string'; multi: false; standard: false; system: false } {
    return {
        name,
        displayName,
        searchable: true,
        type: 'string',
        multi: false,
        standard: false,
        system: false,
    }
}

export async function ensureIdentityAttribute(
    deps: ReverseCorrelationDeps,
    attributeName: string,
    displayName: string
): Promise<void> {
    const { log, client } = deps
    const existing = await client.call<any>(
        (api: any) => api.identityAttributes.getIdentityAttribute({ name: attributeName }).then((r: any) => r.data),
        { priority: QueuePriority.HIGH, context: `SourceService>ensureIdentityAttribute get ${attributeName}` }
    )

    if (existing) {
        if (existing.searchable) {
            log.debug(`Identity attribute "${attributeName}" already exists and is searchable`)
            return
        }
        const updated = await client.call(
            (api: any) =>
                api.identityAttributes
                    .putIdentityAttribute({
                        name: attributeName,
                        identityAttributeV2025: buildSearchableIdentityAttributePayload(attributeName, displayName),
                    })
                    .then((r: any) => r.data),
            { priority: QueuePriority.HIGH, context: `SourceService>ensureIdentityAttribute update ${attributeName}` }
        )
        if (!updated) {
            throw new ConnectorError(
                `Failed to update identity attribute "${attributeName}" to searchable.`,
                ConnectorErrorType.Generic
            )
        }
        log.info(`Updated identity attribute "${attributeName}" to be searchable`)
        return
    }

    const createPayload = {
        identityAttributeV2025: buildSearchableIdentityAttributePayload(attributeName, displayName),
    }
    let created: any
    try {
        created = await client.call(
            (api: any) => api.identityAttributes.createIdentityAttribute(createPayload).then((r: any) => r.data),
            { priority: QueuePriority.HIGH, context: `SourceService>ensureIdentityAttribute create ${attributeName}`, throwOnError: true }
        )
    } catch (error: any) {
        if (isIdentityAttributeAlreadyExistsError(error)) {
            log.warn(
                `Create reported existing identity attribute "${attributeName}". Retrying as idempotent update to searchable=true.`
            )
            const updated = await client.call(
                (api: any) =>
                    api.identityAttributes
                        .putIdentityAttribute({
                            name: attributeName,
                            identityAttributeV2025: buildSearchableIdentityAttributePayload(attributeName, displayName),
                        })
                        .then((r: any) => r.data),
                { priority: QueuePriority.HIGH, context: `SourceService>ensureIdentityAttribute update-after-conflict ${attributeName}` }
            )
            if (updated) {
                log.info(
                    `Updated existing identity attribute "${attributeName}" to be searchable after create conflict`
                )
                return
            }
        }
        throw new ConnectorError(
            buildIdentityAttributeCreateErrorMessage(attributeName, error),
            ConnectorErrorType.Generic
        )
    }
    if (!created) {
        throw new ConnectorError(
            `Failed to create searchable identity attribute "${attributeName}".`,
            ConnectorErrorType.Generic
        )
    }
    log.info(`Created searchable identity attribute "${attributeName}"`)
}

function isIdentityAttributeAlreadyExistsError(error: any): boolean {
    const detailCode = String(error?.response?.data?.detailCode ?? '').toLowerCase()
    const detailMessage = String(error?.response?.data?.detailMessage ?? '').toLowerCase()
    const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? '').toLowerCase()
    const apiMessages = Array.isArray(error?.response?.data?.messages)
        ? error.response.data.messages.map((m: any) => String(m?.text ?? '').toLowerCase()).join(' | ')
        : ''
    const combined = `${detailCode} ${detailMessage} ${message} ${apiMessages}`
    return combined.includes('already exists') || combined.includes('duplicate')
}

export async function ensureIdentityProfileMapping(
    deps: ReverseCorrelationDeps,
    attributeName: string,
    sourceConfig: SourceConfig
): Promise<void> {
    const { log } = deps
    const fusionSourceId = deps.getFusionSourceId()
    const fusionSource = deps.getFusionSource()

    const matchingProfiles = await getMatchingIdentityProfiles(deps, fusionSourceId)
    if (matchingProfiles.length === 0) {
        if (!requiresFullReverseCorrelationArtifacts(sourceConfig)) {
            log.warn(
                `No identity profile found with authoritative source "${fusionSource?.name ?? fusionSourceId}" while configuring reverse correlation attribute "${attributeName}". ` +
                'Skipping identity profile mapping (non-authoritative source).'
            )
            return
        }
        throw new ConnectorError(
            `No identity profile found with authoritative source "${fusionSource?.name ?? fusionSourceId}" while configuring reverse correlation attribute "${attributeName}". ` +
            IDENTITY_PROFILE_PENDING_OPERATIONS_HINT,
            ConnectorErrorType.Generic
        )
    }
    log.info(
        `Found ${matchingProfiles.length} identity profile(s) for fusion source "${fusionSource?.name ?? fusionSourceId}": ${matchingProfiles.map((p: any) => p.id).join(', ')}`
    )

    assert(fusionSource, 'Fusion source not found')

    for (const profile of matchingProfiles) {
        await upsertIdentityProfileTransform(deps, profile, attributeName, fusionSourceId, fusionSource.name)
    }
}

async function getMatchingIdentityProfiles(deps: ReverseCorrelationDeps, fusionSourceId: string): Promise<any[]> {
    const profiles = await deps.client.call(
        (api: any, params: any) => api.identityProfiles.listIdentityProfiles(params),
        { priority: QueuePriority.HIGH, context: 'SourceService>ensureIdentityProfileMapping listProfiles', paginate: { mode: 'sequential' } }
    )

    return profiles.filter(
        (p: any) => p.authoritativeSource?.id === fusionSourceId || p.source?.id === fusionSourceId
    )
}

async function upsertIdentityProfileTransform(
    deps: ReverseCorrelationDeps,
    profile: any,
    attributeName: string,
    fusionSourceId: string,
    fusionSourceName: string
): Promise<void> {
    const { log, client } = deps
    const newTransform = {
        identityAttributeName: attributeName,
        transformDefinition: {
            type: 'accountAttribute',
            attributes: {
                sourceId: fusionSourceId,
                sourceName: fusionSourceName,
                attributeName,
            },
        },
    }

    const transforms = profile.identityAttributeConfig?.attributeTransforms ?? []
    const existingIndex = transforms.findIndex((t: any) => t.identityAttributeName === attributeName)

    if (existingIndex >= 0) {
        const existing = transforms[existingIndex]
        if (isDesiredIdentityProfileTransform(existing, attributeName, fusionSourceName, fusionSourceId)) {
            log.info(
                `Identity profile ${profile.id} already maps "${attributeName}" from source "${fusionSourceName}"`
            )
        } else {
            log.info(
                `Identity profile ${profile.id} already defines a mapping for identity attribute "${attributeName}"; ` +
                'leaving it unchanged so a custom transform is not overwritten.'
            )
        }
        return
    }

    const nextTransforms = [...transforms, newTransform]
    const hasIdentityAttributeConfig = !!profile.identityAttributeConfig
    const jsonPatchOperationV2025 = hasIdentityAttributeConfig
        ? [
            {
                op: 'replace' as JsonPatchOperationV2025OpV2025,
                path: '/identityAttributeConfig/attributeTransforms',
                value: nextTransforms,
            },
        ]
        : [
            {
                op: 'add' as JsonPatchOperationV2025OpV2025,
                path: '/identityAttributeConfig',
                value: {
                    attributeTransforms: nextTransforms,
                },
            },
        ]

    let updatedProfile: any
    try {
        updatedProfile = await client.call(
            (api) => api.identityProfiles.updateIdentityProfile({
                identityProfileId: profile.id!,
                jsonPatchOperationV2025,
            }).then((r) => r.data),
            { priority: QueuePriority.HIGH, context: `SourceService>ensureIdentityProfileMapping upsert ${attributeName} profile=${profile.id}`, throwOnError: true }
        )
    } catch (error: any) {
        throw new ConnectorError(
            buildIdentityProfileUpsertErrorMessage(profile.id!, attributeName, error),
            ConnectorErrorType.Generic
        )
    }
    if (!updatedProfile) {
        throw new ConnectorError(
            `Failed to update identity profile ${profile.id} for reverse correlation attribute "${attributeName}". ` +
            IDENTITY_PROFILE_PENDING_OPERATIONS_HINT,
            ConnectorErrorType.Generic
        )
    }
    log.info(`Added identity profile mapping for attribute "${attributeName}" on profile ${profile.id}`)

    const verified = await deps.waitForIdentityProfileMapping(
        profile.id!,
        attributeName,
        fusionSourceName,
        fusionSourceId
    )
    if (!verified) {
        throw new ConnectorError(
            `Identity profile mapping verification failed for profile ${profile.id} and attribute "${attributeName}". ` +
            IDENTITY_PROFILE_PENDING_OPERATIONS_HINT,
            ConnectorErrorType.Generic
        )
    }
    log.info(`Verified identity profile mapping for profile ${profile.id} and attribute "${attributeName}"`)
}

export async function ensureManagedSourceCorrelation(
    deps: ReverseCorrelationDeps,
    attributeName: string,
    managedSourceId: string
): Promise<void> {
    const { log, client } = deps
    const schemas = await deps.listSourceSchemas(managedSourceId)
    const accountSchema = schemas.find((s) => s.name === 'account')
    assert(accountSchema, `Managed source ${managedSourceId} account schema not found`)
    const accountIdAttribute = accountSchema.identityAttribute
    assert(
        accountIdAttribute,
        `Managed source ${managedSourceId} account schema has no identity attribute (ID) defined`
    )

    const correlationConfig = await client.call<CorrelationConfigV2025>(
        (api: any) =>
            api.sources
                .getCorrelationConfig({
                    id: managedSourceId,
                } as SourcesV2025ApiGetCorrelationConfigRequest)
                .then((r: any) => r.data),
        { priority: QueuePriority.HIGH, context: `SourceService>ensureManagedSourceCorrelation get ${managedSourceId}` }
    )

    const assignments = correlationConfig?.attributeAssignments ?? []
    const alreadyExists = assignments.some((a: any) => a.property === attributeName && a.value === accountIdAttribute)
    if (alreadyExists) {
        log.debug(
            `Managed source ${managedSourceId} already has correlation rule for "${attributeName}" -> "${accountIdAttribute}"`
        )
        return
    }

    const updatedConfig: CorrelationConfigV2025 = {
        ...correlationConfig,
        attributeAssignments: [
            ...assignments,
            {
                property: attributeName,
                value: accountIdAttribute,
                operation: 'EQ' as any,
                complex: false,
                ignoreCase: false,
                matchMode: undefined,
                filterString: undefined,
            },
        ],
    }

    const updated = await client.call(
        (api: any) =>
            api.sources
                .putCorrelationConfig({
                    id: managedSourceId,
                    correlationConfigV2025: updatedConfig,
                } as SourcesV2025ApiPutCorrelationConfigRequest)
                .then((r: any) => r.data),
        { priority: QueuePriority.HIGH, context: `SourceService>ensureManagedSourceCorrelation put ${managedSourceId}` }
    )
    if (!updated) {
        throw new ConnectorError(
            `Failed to update managed source correlation config for source ${managedSourceId} and attribute "${attributeName}".`,
            ConnectorErrorType.Generic
        )
    }
    log.info(
        `Added correlation rule "${attributeName}" -> "${accountIdAttribute}" to managed source ${managedSourceId}`
    )
}

async function hasFusionSchemaAttribute(deps: ReverseCorrelationDeps, attributeName: string): Promise<boolean> {
    const schemas = await deps.listSourceSchemas(deps.getFusionSourceId())
    const accountSchema = schemas.find((s) => s.name === 'account')
    assert(accountSchema, 'Fusion source account schema not found')
    return (accountSchema.attributes ?? []).some((a) => a.name?.toLowerCase() === attributeName.toLowerCase())
}

async function hasSearchableIdentityAttribute(deps: ReverseCorrelationDeps, attributeName: string): Promise<boolean> {
    const existing = await deps.client.call<any>(
        (api: any) => api.identityAttributes.getIdentityAttribute({ name: attributeName }).then((r: any) => r.data),
        { priority: QueuePriority.HIGH, context: `SourceService>hasSearchableIdentityAttribute get ${attributeName}` }
    )
    return !!existing?.searchable
}

async function hasIdentityProfileMapping(
    deps: ReverseCorrelationDeps,
    attributeName: string,
    sourceConfig: SourceConfig
): Promise<boolean> {
    if (!requiresFullReverseCorrelationArtifacts(sourceConfig)) {
        return true
    }

    const fusionSource = deps.getFusionSource()
    const fusionSourceId = deps.getFusionSourceId()
    assert(fusionSource, 'Fusion source not found')
    const profiles = await deps.client.call(
        (api: any, params: any) => api.identityProfiles.listIdentityProfiles(params),
        { priority: QueuePriority.HIGH, context: `SourceService>hasIdentityProfileMapping listProfiles ${attributeName}`, paginate: { mode: 'sequential' } }
    )
    const matchingProfiles = profiles.filter(
        (p: any) => p.authoritativeSource?.id === fusionSourceId || p.source?.id === fusionSourceId
    )
    if (matchingProfiles.length === 0) {
        return false
    }
    return matchingProfiles.every((profile: any) =>
        profileHasIdentityAttributeTransform(profile, attributeName)
    )
}

export async function waitForIdentityProfileMapping(
    deps: ReverseCorrelationDeps,
    profileId: string,
    attributeName: string,
    fusionSourceName: string,
    fusionSourceId: string
): Promise<boolean> {
    const maxAttempts = 3
    const waitMs = 1500
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const profiles = await fetchIdentityProfiles(
            deps,
            `SourceService>waitForIdentityProfileMapping ${attributeName} profile=${profileId} attempt=${attempt}`
        )
        const profile = profiles.find((p: any) => p.id === profileId)
        const transforms = profile?.identityAttributeConfig?.attributeTransforms ?? []
        const verified = transforms.some((t: any) =>
            isDesiredIdentityProfileTransform(t, attributeName, fusionSourceName, fusionSourceId)
        )
        if (verified) {
            return true
        }
        if (attempt < maxAttempts) {
            await sleep(waitMs)
        }
    }
    return false
}

async function fetchIdentityProfiles(deps: ReverseCorrelationDeps, context: string): Promise<any[]> {
    return deps.client.call(
        (api: any, params: any) => api.identityProfiles.listIdentityProfiles(params),
        { priority: QueuePriority.HIGH, context, paginate: { mode: 'sequential' } }
    )
}

function profileHasIdentityAttributeTransform(profile: any, attributeName: string): boolean {
    const transforms = profile?.identityAttributeConfig?.attributeTransforms ?? []
    return transforms.some((t: any) => t?.identityAttributeName === attributeName)
}

function isDesiredIdentityProfileTransform(
    transform: any,
    attributeName: string,
    fusionSourceName: string,
    fusionSourceId: string
): boolean {
    if (transform?.identityAttributeName !== attributeName) {
        return false
    }
    if (transform?.transformDefinition?.type !== 'accountAttribute') {
        return false
    }
    const transformAttrs = transform?.transformDefinition?.attributes ?? {}
    const sourceMatches =
        transformAttrs.sourceName === fusionSourceName || transformAttrs.sourceId === fusionSourceId
    return sourceMatches && transformAttrs.attributeName === attributeName
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
}

async function hasManagedSourceCorrelation(
    deps: ReverseCorrelationDeps,
    attributeName: string,
    managedSourceId: string
): Promise<boolean> {
    const schemas = await deps.listSourceSchemas(managedSourceId)
    const accountSchema = schemas.find((s) => s.name === 'account')
    assert(accountSchema, `Managed source ${managedSourceId} account schema not found`)
    const accountIdAttribute = accountSchema.identityAttribute
    if (!accountIdAttribute) {
        return false
    }

    const correlationConfig = await deps.client.call<CorrelationConfigV2025>(
        (api: any) =>
            api.sources
                .getCorrelationConfig({
                    id: managedSourceId,
                } as SourcesV2025ApiGetCorrelationConfigRequest)
                .then((r: any) => r.data),
        { priority: QueuePriority.HIGH, context: `SourceService>hasManagedSourceCorrelation get ${managedSourceId}` }
    )
    const assignments = correlationConfig?.attributeAssignments ?? []
    return assignments.some((a: any) => a.property === attributeName && a.value === accountIdAttribute)
}
