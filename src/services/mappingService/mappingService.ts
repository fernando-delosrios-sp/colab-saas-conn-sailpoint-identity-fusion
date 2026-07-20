import { FusionAccount } from '../../model/account'
import {
    FusionConfig,
    SourceConfig,
    AttributeMap,
    DefaultAttributeMergeMode,
} from '../../model/config'
import { LogService } from '../logService'
import { FusionAttribute } from '../../data/schema'
import { FusionRun } from '../../model/fusionRun'
import { FusionAccountKind } from '../../model/fusionAccountTypes'
import { Attributes } from '@sailpoint/connector-sdk'
import { AttributeMappingConfig } from './types'
import { processAttributeMapping, buildAttributeMappingConfig } from './helpers'
import { trimStr } from '../../utils/safeRead'
import { getManagedAccountSnapshotKey } from '../../utils/velocityAccountSnapshot'

export class MappingService {
    private cachedAttributeMappingConfig?: Map<string, AttributeMappingConfig>
    private readonly attributeMaps?: AttributeMap[]
    private readonly attributeMerge: DefaultAttributeMergeMode
    private readonly sourceConfigs: SourceConfig[]

    constructor(
        config: FusionConfig,
        private log: LogService,
    ) {
        this.attributeMaps = config.attributeMaps
        this.attributeMerge = config.attributeMerge
        this.sourceConfigs = config.sources
    }

    mapAttributes(fusionAccount: FusionAccount, _run: FusionRun): void {
        if (fusionAccount.type === FusionAccountKind.Identity) return

        const { attributeBag, needsRefresh } = fusionAccount
        const attributes = { ...attributeBag.current }

        const sourceAttributeMap = attributeBag.sources
        for (const source of fusionAccount.sources) {
            if (!sourceAttributeMap.has(source)) {
                sourceAttributeMap.set(source, [])
            }
        }

        if (needsRefresh && sourceAttributeMap.size > 0) {
            const hasManagedAccountContext = Array.from(sourceAttributeMap.values()).some(
                (accounts) => accounts.length > 0,
            )
            const shouldPreserveCurrentWithoutContext =
                !hasManagedAccountContext && !fusionAccount.isIdentity
            const sourceOrder = this.sourceConfigs.map((sc) => sc.name)
            if (fusionAccount.originSource === 'Identities') {
                sourceOrder.push('Identities')
                sourceAttributeMap.set('Identities', [attributeBag.identity])
            }

            let prioritizedAccount = this.getMainAccountContextAccount(
                fusionAccount,
                sourceAttributeMap,
            )
            const mappingTargets = this.getAttributeMappingTargetNames()

            for (const attribute of mappingTargets) {
                if (this.isSystemProvenanceAttribute(attribute)) {
                    continue
                }

                const processingConfig = this.attributeMappingConfig.get(attribute)!
                const processedValue = processAttributeMapping(
                    processingConfig,
                    sourceAttributeMap,
                    sourceOrder,
                    prioritizedAccount,
                )

                if (processedValue === undefined) {
                    if (
                        fusionAccount.isIdentity &&
                        fusionAccount.attributeBag.identity[attribute] !== undefined
                    ) {
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
                    prioritizedAccount = mainAccountId
                        ? this.findAccountByIdInSourceMap(sourceAttributeMap, mainAccountId)
                        : undefined
                }
                if (attribute === FusionAttribute.History) {
                    this.applyHistoryMapping(processedValue, fusionAccount)
                }
            }
        }

        if (fusionAccount.history.length > 0) {
            attributes[FusionAttribute.History] = [...fusionAccount.history]
        }

        attributeBag.current = attributes
    }

    private isSystemProvenanceAttribute(name: string): boolean {
        return (
            name === FusionAttribute.OriginAccount ||
            name === FusionAttribute.OriginSource
        )
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
            const mappingTargets = this.getAttributeMappingTargetNames()
            for (const attrName of mappingTargets) {
                this.cachedAttributeMappingConfig.set(
                    attrName,
                    buildAttributeMappingConfig(
                        attrName,
                        this.attributeMaps,
                        this.attributeMerge,
                    ),
                )
            }
        }
        return this.cachedAttributeMappingConfig
    }

    private getMainAccountContextAccount(
        fusionAccount: FusionAccount,
        sourceAttributeMap: Map<string, Attributes[]>,
    ): Attributes | undefined {
        const mainAccountId = trimStr(
            fusionAccount.attributeBag.current[FusionAttribute.MainAccount],
        )
        if (!mainAccountId) return undefined

        return this.findAccountByIdInSourceMap(sourceAttributeMap, mainAccountId)
    }

    private findAccountByIdInSourceMap(
        sourceAttributeMap: Map<string, Record<string, any>[]>,
        accountId: string,
    ): Record<string, any> | undefined {
        for (const accounts of sourceAttributeMap.values()) {
            const match = accounts.find(
                (account) =>
                    getManagedAccountSnapshotKey(account) === accountId ||
                    trimStr(account?._id) === accountId,
            )
            if (match) return match
        }

        return undefined
    }

    private applyHistoryMapping(
        processedValue: unknown,
        fusionAccount: FusionAccount,
    ): void {
        if (!Array.isArray(processedValue) || processedValue.length === 0) return

        const history = processedValue
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)

        if (history.length === 0) return
        fusionAccount.importHistory(history)
    }
}
