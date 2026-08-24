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

export class MappingService {
    private cachedAttributeMappingConfig?: Map<string, AttributeMappingConfig>
    private readonly attributeMaps?: AttributeMap[]
    private readonly attributeMerge: DefaultAttributeMergeMode
    private readonly sourceConfigs: SourceConfig[]
    private readonly sourceOrder: string[]
    private readonly mappingTargetNames: string[]

    constructor(
        config: FusionConfig,
        private log: LogService
    ) {
        this.attributeMaps = config.attributeMaps
        this.attributeMerge = config.attributeMerge
        this.sourceConfigs = config.sources
        this.sourceOrder = this.sourceConfigs.map((sc) => sc.name)
        this.mappingTargetNames = this.getAttributeMappingTargetNames()
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
        const hasManagedAccountContext = Array.from(sourceAttributeMap.values()).some((accounts) => accounts.length > 0)
        const shouldPreserveCurrentWithoutContext = !hasManagedAccountContext && !fusionAccount.isIdentity
        let sourceOrder = this.sourceOrder
        if (fusionAccount.originSource === IDENTITIES_SOURCE_NAME) {
            sourceOrder = [...this.sourceOrder, IDENTITIES_SOURCE_NAME]
            sourceAttributeMap.set(IDENTITIES_SOURCE_NAME, [attributeBag.identity])
        }

        const snapshotIndex = buildSnapshotIndex(sourceAttributeMap)
        const originSnapshot = this.getOriginAccountContextAccount(fusionAccount, snapshotIndex)
        let prioritizedAccount = this.getMainAccountContextAccount(fusionAccount, snapshotIndex)
        const mappingTargets = this.mappingTargetNames

        for (const attribute of mappingTargets) {
            if (options?.onlyTargets && !options.onlyTargets.has(attribute)) {
                continue
            }

            if (this.isSystemProvenanceAttribute(attribute)) {
                continue
            }

            const processingConfig = this.attributeMappingConfig.get(attribute)!
            const processedValue = processAttributeMapping(
                processingConfig,
                sourceAttributeMap,
                sourceOrder,
                prioritizedAccount,
                originSnapshot
            )

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
                continue
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

        if (fusionAccount.originSource === IDENTITIES_SOURCE_NAME) {
            const identity = fusionAccount.attributeBag.identity
            const identityId = trimStr(fusionAccount.identityId) ?? trimStr(identity.id)
            if (identityId !== originAccountId || Object.keys(identity).length === 0) {
                return undefined
            }
            return identity
        }

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
