import { FusionAccount } from '../../model/account'
import { FusionConfig, SourceConfig, AttributeMap, DefaultAttributeMergeMode } from '../../model/config'
import { LogService } from '../logService'
import { FusionAttribute } from '../../data/schema'
import { FusionRun } from '../../model/fusionRun'
import { FusionAccountKind } from '../../model/fusionAccountTypes'
import { Attributes } from '@sailpoint/connector-sdk'
import { AttributeMappingConfig } from './types'
import { processAttributeMapping, buildAttributeMappingConfig } from './helpers'
import { trimStr } from '../../utils/safeRead'
import { getManagedAccountSnapshotKey } from '../../utils/velocityAccountSnapshot'
import { IDENTITIES_SOURCE_NAME } from '../../model/fusionAccount'

export interface MapAttributesOptions {
    onlyTargets?: ReadonlySet<string>
}

const IMPLICIT_KEY_DENYLIST = new Set<string>([
    ...Object.values(FusionAttribute),
    'id',
    'name',
    'source',
    'schema',
    'IIQDisabled',
])

function buildSnapshotIndex(sourceAttributeMap: Map<string, Attributes[]>): Map<string, Attributes> {
    const index = new Map<string, Attributes>()
    for (const accounts of sourceAttributeMap.values()) {
        for (const account of accounts) {
            const key = getManagedAccountSnapshotKey(account)
            const id = trimStr(account?._id)
            if (key && !index.has(key)) index.set(key, account)
            if (id && !index.has(id)) index.set(id, account)
        }
    }
    return index
}

function collectUnmappedSnapshotKeys(
    sourceAttributeMap: Map<string, Attributes[]>,
    explicitTargets: ReadonlySet<string>
): string[] {
    const names = new Set<string>()
    for (const accounts of sourceAttributeMap.values()) {
        for (const account of accounts) {
            if (!account || typeof account !== 'object') continue
            for (const key of Object.keys(account)) {
                if (!IMPLICIT_KEY_DENYLIST.has(key) && !explicitTargets.has(key)) {
                    names.add(key)
                }
            }
        }
    }
    return [...names]
}

export class MappingService {
    private cachedAttributeMappingConfig?: Map<string, AttributeMappingConfig>
    private readonly attributeMaps?: AttributeMap[]
    private readonly attributeMerge: DefaultAttributeMergeMode
    private readonly sourceConfigs: SourceConfig[]
    private readonly sourceOrder: string[]
    private readonly mappingTargetNames: string[]
    private readonly includeIdentities: boolean

    constructor(
        config: FusionConfig,
        _log: LogService
    ) {
        this.attributeMaps = config.attributeMaps
        this.attributeMerge = config.attributeMerge
        this.sourceConfigs = config.sources
        this.sourceOrder = this.sourceConfigs.map((sc) => sc.name)
        this.mappingTargetNames = this.getAttributeMappingTargetNames()
        this.includeIdentities = config.includeIdentities !== false
    }

    mapAttributes(fusionAccount: FusionAccount, _run: FusionRun, options?: MapAttributesOptions): void {
        if (fusionAccount.type === FusionAccountKind.Identity) return

        const { attributeBag, needsRefresh } = fusionAccount
        const sourceAttributeMap = attributeBag.sources
        for (const source of fusionAccount.sources) {
            if (!sourceAttributeMap.has(source)) {
                sourceAttributeMap.set(source, [])
            }
        }

        const mappingRuns = needsRefresh && sourceAttributeMap.size > 0
        const hasHistory = fusionAccount.history.length > 0

        if (!mappingRuns) {
            if (hasHistory) {
                attributeBag.current[FusionAttribute.History] = [...fusionAccount.history]
            }
            return
        }

        const attributes = { ...attributeBag.current }
        let sourceOrder = this.sourceOrder
        const identityBag = attributeBag.identity
        const identityInputsEnabled =
            this.includeIdentities ||
            fusionAccount.fromIdentity ||
            fusionAccount.type === FusionAccountKind.Identity
        const identityPresent = identityInputsEnabled && Object.keys(identityBag).length > 0
        if (identityPresent) {
            sourceAttributeMap.set(IDENTITIES_SOURCE_NAME, [identityBag])
            if (!sourceOrder.includes(IDENTITIES_SOURCE_NAME)) {
                sourceOrder = [...sourceOrder, IDENTITIES_SOURCE_NAME]
            }
        } else if (!identityInputsEnabled) {
            sourceAttributeMap.delete(IDENTITIES_SOURCE_NAME)
        }

        const hasManagedAccountContext = Array.from(sourceAttributeMap.values()).some((accounts) => accounts.length > 0)
        const shouldPreserveCurrentWithoutContext = !hasManagedAccountContext && !fusionAccount.isIdentity
        const snapshotIndex = buildSnapshotIndex(sourceAttributeMap)
        if (identityPresent) {
            const identityId = trimStr(fusionAccount.identityId) ?? trimStr(identityBag.id)
            if (identityId) {
                snapshotIndex.set(identityId, identityBag)
            }
        }
        const originSnapshot = this.getOriginAccountContextAccount(fusionAccount, snapshotIndex)
        let prioritizedAccount = this.getMainAccountContextAccount(fusionAccount, snapshotIndex)
        const mappingTargets = this.mappingTargetNames
        const explicitTargetSet = new Set(mappingTargets)

        const applyMappedValue = (attribute: string, processedValue: Attributes[string] | undefined): void => {
            if (processedValue === undefined) {
                if (fusionAccount.isIdentity && fusionAccount.attributeBag.identity[attribute] !== undefined) {
                    attributes[attribute] = fusionAccount.attributeBag.identity[attribute]
                } else if (!shouldPreserveCurrentWithoutContext) {
                    delete attributes[attribute]
                }
                if (attribute === FusionAttribute.MainAccount) {
                    delete attributes[attribute]
                    prioritizedAccount = undefined
                }
                return
            }

            attributes[attribute] = processedValue
            if (attribute === FusionAttribute.MainAccount) {
                const mainAccountId = trimStr(processedValue)
                prioritizedAccount = mainAccountId ? snapshotIndex.get(mainAccountId) : undefined
            }
            if (attribute === FusionAttribute.History) {
                this.applyHistoryMapping(processedValue, fusionAccount)
            }
        }

        for (const attribute of mappingTargets) {
            if (options?.onlyTargets && !options.onlyTargets.has(attribute)) {
                continue
            }

            if (this.isSystemProvenanceAttribute(attribute)) {
                continue
            }

            const processingConfig = this.attributeMappingConfig.get(attribute)!
            applyMappedValue(
                attribute,
                processAttributeMapping(
                    processingConfig,
                    sourceAttributeMap,
                    sourceOrder,
                    prioritizedAccount,
                    originSnapshot
                )
            )
        }

        if (!options?.onlyTargets) {
            for (const attribute of collectUnmappedSnapshotKeys(sourceAttributeMap, explicitTargetSet)) {
                const processingConfig = buildAttributeMappingConfig(attribute, this.attributeMaps, this.attributeMerge)
                applyMappedValue(
                    attribute,
                    processAttributeMapping(
                        processingConfig,
                        sourceAttributeMap,
                        sourceOrder,
                        prioritizedAccount,
                        originSnapshot
                    )
                )
            }
        }

        if (hasHistory) {
            attributes[FusionAttribute.History] = [...fusionAccount.history]
        }

        attributeBag.current = attributes
    }

    private isSystemProvenanceAttribute(name: string): boolean {
        return name === FusionAttribute.OriginAccount || name === FusionAttribute.OriginSource
    }

    private getAttributeMappingTargetNames(): string[] {
        const mappedAttributes = (this.attributeMaps ?? [])
            .map((attributeMap) => attributeMap.newAttribute)
            .filter((name): name is string => Boolean(name))

        return Array.from(new Set([...mappedAttributes]))
    }

    private get attributeMappingConfig(): Map<string, AttributeMappingConfig> {
        if (!this.cachedAttributeMappingConfig) {
            this.cachedAttributeMappingConfig = new Map()
            for (const attrName of this.mappingTargetNames) {
                this.cachedAttributeMappingConfig.set(
                    attrName,
                    buildAttributeMappingConfig(attrName, this.attributeMaps, this.attributeMerge)
                )
            }
        }
        return this.cachedAttributeMappingConfig
    }

    private getMainAccountContextAccount(
        fusionAccount: FusionAccount,
        snapshotIndex: Map<string, Attributes>
    ): Attributes | undefined {
        const mainAccountId = trimStr(fusionAccount.attributeBag.current[FusionAttribute.MainAccount])
        if (!mainAccountId) return undefined

        return snapshotIndex.get(mainAccountId)
    }

    private getOriginAccountContextAccount(
        fusionAccount: FusionAccount,
        snapshotIndex: Map<string, Attributes>
    ): Attributes | undefined {
        const originAccountId = trimStr(fusionAccount.originAccountId)
        if (!originAccountId) return undefined

        return snapshotIndex.get(originAccountId)
    }

    private applyHistoryMapping(processedValue: unknown, fusionAccount: FusionAccount): void {
        if (!Array.isArray(processedValue) || processedValue.length === 0) return

        const history = processedValue
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)

        if (history.length === 0) return
        fusionAccount.collections.historyOps.importFromArray(history)
    }
}
