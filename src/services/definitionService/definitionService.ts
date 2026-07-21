import {
    FusionConfig,
    NormalAttributeDefinition,
    UniqueAttributeDefinition,
    SourceConfig,
} from '../../model/config'
import { LogService } from '../logService'
import { FusionAccount } from '../../model/account'
import { getManagedAccountSnapshotKey } from '../../utils/velocityAccountSnapshot'
import { FusionAccountKind } from '../../model/fusionAccountTypes'
import { SchemaService } from '../schemaService'
import { InMemoryLockService } from '../lockService'
import { StateWrapper } from './stateWrapper'
import { SimpleKey, SimpleKeyType } from '@sailpoint/connector-sdk'
import { evaluateAttributeTemplate } from './templateEvaluator'
import { padNumber } from './formatting'
import crypto from 'crypto'
import { assert } from '../../utils/assert'
import { FUSION_STATE_CONFIG_PATH } from './constants'
import { isValidAttributeValue } from '../../utils/attributes'
import { hasValue, isNullish, missing, readString, trimStr } from '../../utils/safeRead'
import { runtimeDefaults } from '../../data/config'
import { FusionAttribute } from '../../data/schema'

export class DefinitionService {
    private normalDefinitions: NormalAttributeDefinition[] = []
    private uniqueDefinitions: UniqueAttributeDefinition[] = []
    private uniqueAttributeNames: Set<string> = new Set()
    private uniqueValuesByAttribute: Map<string, Set<string>> = new Map()
    private uniqueDefinitionByName: Map<string, UniqueAttributeDefinition> = new Map()
    private stateWrapper?: StateWrapper
    private readonly skipAccountsWithMissingId: boolean
    private readonly forceAttributeRefresh: boolean
    private readonly maxAttempts?: number
    private readonly reverseSources: SourceConfig[]

    constructor(
        private config: FusionConfig,
        private schemas: SchemaService,
        private log: LogService,
        private locks: InMemoryLockService
    ) {
        this.normalDefinitions = config.normalAttributeDefinitions ?? []
        this.uniqueDefinitions = config.uniqueAttributeDefinitions ?? []
        this.skipAccountsWithMissingId = config.skipAccountsWithMissingId
        this.forceAttributeRefresh = config.forceAttributeRefresh
        this.maxAttempts = config.maxAttempts

        this.uniqueDefinitionByName = new Map(this.uniqueDefinitions.map((d) => [d.name, d]))
        this.uniqueAttributeNames = new Set(this.uniqueDefinitions.map((d) => d.name))

        this.setStateWrapper(config.fusionState)
        this.reverseSources = (config.sources ?? []).filter(
            (sc) => sc.correlationMode === 'reverse' && sc.correlationAttribute
        )
    }

    public setStateWrapper(state: Record<string, unknown> | undefined): void {
        this.stateWrapper = new StateWrapper(state, this.locks)
    }

    private getStateWrapper(): StateWrapper {
        assert(this.stateWrapper, 'State wrapper is not set')
        return this.stateWrapper!
    }

    private isUniqueAttribute(name: string): boolean {
        return this.uniqueAttributeNames.has(name)
    }

    private getUniqueValues(attributeName: string): Set<string> {
        let set = this.uniqueValuesByAttribute.get(attributeName)
        if (!set) {
            set = new Set<string>()
            this.uniqueValuesByAttribute.set(attributeName, set)
        }
        return set
    }

    // ========================================================================
    // Public — Attribute Refresh
    // ========================================================================

    public async refreshAllAttributes(fusionAccount: FusionAccount): Promise<void> {
        const context = this.buildVelocityContext(fusionAccount)

        for (const definition of this.normalDefinitions) {
            try {
                await this.processNormalDefinition(definition, fusionAccount, context)
            } catch (error) {
                this.log.error(
                    `Error generating normal attribute ${definition.name} for account: ${fusionAccount.name} (${fusionAccount.sourceName})`,
                    error instanceof Error ? error.message : readString(error, 'message', String(error))
                )
            }
        }

        for (const definition of this.uniqueDefinitions) {
            try {
                await this.processUniqueDefinition(definition, fusionAccount, context)
            } catch (error) {
                this.log.error(
                    `Error generating unique attribute ${definition.name} for account: ${fusionAccount.name} (${fusionAccount.sourceName})`,
                    error instanceof Error ? error.message : readString(error, 'message', String(error))
                )
                throw error
            }
        }

        this.ensureCoreSchemaAttributes(fusionAccount)
    }

    public async refreshNormalAttributes(fusionAccount: FusionAccount): Promise<void> {
        if (this.normalDefinitions.length === 0) return

        const forceRefresh =
            this.forceAttributeRefresh ||
            fusionAccount.needsReset ||
            this.normalDefinitions.some((def) => def.refresh)
        const shouldRefresh = fusionAccount.needsRefresh || forceRefresh
        if (!shouldRefresh) return

        this.log.debug(
            `Refreshing normal attributes for account: ${fusionAccount.name} [${fusionAccount.sourceName}]`
        )
        const context = this.buildVelocityContext(fusionAccount)

        for (const definition of this.normalDefinitions) {
            try {
                await this.processNormalDefinition(definition, fusionAccount, context)
            } catch (error) {
                this.log.error(
                    `Error generating normal attribute ${definition.name} for account: ${fusionAccount.name} (${fusionAccount.sourceName})`,
                    error instanceof Error ? error.message : readString(error, 'message', String(error))
                )
            }
        }
    }

    public async refreshUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        if (fusionAccount.type === FusionAccountKind.Decision && !fusionAccount.needsReset) return
        if (fusionAccount.isMatch) return

        if (this.uniqueDefinitions.length === 0) {
            this.ensureCoreSchemaAttributes(fusionAccount)
            return
        }

        const hasMissingUniqueAttribute = this.uniqueDefinitions.some(
            (def) => !isValidAttributeValue(fusionAccount.attributes[def.name])
        )

        const shouldRefresh =
            fusionAccount.needsRefresh || fusionAccount.needsReset || hasMissingUniqueAttribute
        if (!shouldRefresh) {
            this.ensureCoreSchemaAttributes(fusionAccount)
            return
        }

        this.log.debug(
            `Refreshing unique attributes for account: ${fusionAccount.name} [${fusionAccount.sourceName}]`
        )

        if (fusionAccount.needsReset) {
            await this.unregisterUniqueAttributes(fusionAccount)
        }

        const context = this.buildVelocityContext(fusionAccount)

        for (const definition of this.uniqueDefinitions) {
            try {
                await this.processUniqueDefinition(definition, fusionAccount, context)
            } catch (error) {
                this.log.error(
                    `Error generating unique attribute ${definition.name} for account: ${fusionAccount.name} (${fusionAccount.sourceName})`,
                    error instanceof Error ? error.message : readString(error, 'message', String(error))
                )
                throw error
            }
        }

        this.ensureCoreSchemaAttributes(fusionAccount)
    }

    // ========================================================================
    // Public — Reverse Correlation
    // ========================================================================

    public refreshReverseCorrelationAttributes(fusionAccount: FusionAccount): void {
        if (fusionAccount.missingAccountIds.length === 0) return
        for (const sc of this.reverseSources) {
            const missingForSource = fusionAccount.getMissingAccountIdsForSource(sc.name)
            if (missingForSource.length > 0) {
                const firstAccountId = missingForSource[0]
                const info = fusionAccount.getManagedAccountInfo(firstAccountId)
                if (info) {
                    fusionAccount.setReverseCorrelationAttribute(sc.correlationAttribute!, info.schema.id)
                    this.log.debug(
                        `Set reverse correlation attribute "${sc.correlationAttribute}" = "${info.schema.id}" ` +
                            `for fusion account ${fusionAccount.name} (source: ${sc.name})`
                    )
                }
            } else {
                fusionAccount.clearReverseCorrelationAttribute(sc.correlationAttribute!)
            }
        }
    }

    // ========================================================================
    // Public — Display Attribute Override
    // ========================================================================

    public applyDisplayAttributeOverride(fusionAccount: FusionAccount): void {
        const { fusionDisplayAttribute } = this.schemas
        if (!fusionDisplayAttribute) return
        this.applyDisplayAttributeOverrideIfApplicable(fusionAccount, fusionDisplayAttribute)
    }

    private applyDisplayAttributeOverrideIfApplicable(
        fusionAccount: FusionAccount,
        attributeName: string
    ): boolean {
        const { fusionDisplayAttribute } = this.schemas
        if (attributeName !== fusionDisplayAttribute) return false
        if (!fusionAccount.isIdentity) return false

        const hasExistingValue = isValidAttributeValue(fusionAccount.attributes[attributeName])
        const canResetDisplay = fusionAccount.needsReset
        const isExistingFusionAccount = this.isExistingFusionAccount(fusionAccount)

        if (hasExistingValue && !canResetDisplay && isExistingFusionAccount) {
            return true
        }

        const label = fusionAccount.identityName
        if (label) {
            this.log.info(`Setting identity name for attribute: ${attributeName} for account: ${fusionAccount.name}`)
            fusionAccount.attributes[attributeName] = label
        }
        return true
    }

    // ========================================================================
    // Public — Unique Value Registration
    // ========================================================================

    public async registerUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        this.log.debug(`Registering unique attributes for account: ${fusionAccount.managedKey}`)

        for (const definition of this.uniqueDefinitions) {
            const value = fusionAccount.attributes[definition.name]
            if (missing(value)) continue

            const valueStr = String(value)
            const lockKey = `unique:${definition.name}`
            await this.locks.withLock(lockKey, async () => {
                assert(
                    this.uniqueDefinitionByName.has(definition.name),
                    `Attribute ${definition.name} not found in unique attribute definition config`
                )
                this.getUniqueValues(definition.name).add(valueStr)
            })
        }
    }

    public async unregisterUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        const { fusionIdentityAttribute } = this.schemas
        this.log.debug(`Unregistering unique attributes for account: ${fusionAccount.managedKey}`)

        for (const definition of this.uniqueDefinitions) {
            if (definition.name === fusionIdentityAttribute) continue

            const value = fusionAccount.attributes[definition.name]
            if (missing(value)) continue

            const valueStr = String(value)
            const lockKey = `unique:${definition.name}`
            await this.locks.withLock(lockKey, async () => {
                if (!this.getUniqueValues(definition.name).delete(valueStr)) return
                this.log.debug(`Unregistered unique value '${valueStr}' for attribute ${definition.name}`)
            })
        }
    }

    public registerExistingValues(attributeName: string, values: string[]): void {
        if (values.length === 0) return
        const set = this.getUniqueValues(attributeName)
        for (const value of values) {
            if (hasValue(value)) {
                set.add(String(value))
            }
        }
        this.log.debug(`Registered ${values.length} existing value(s) for attribute '${attributeName}'`)
    }

    public registerUniqueValuesFromManagedSourceAccounts(fusionAccounts: Iterable<any>): void {
        if (this.uniqueDefinitions.length === 0) return

        const accounts = Array.from(fusionAccounts)
        if (accounts.length === 0) return

        for (const definition of this.uniqueDefinitions) {
            const values: string[] = []
            for (const account of accounts) {
                const value = account.attributes?.[definition.name]
                if (hasValue(value)) {
                    values.push(String(value))
                }
            }
            this.registerExistingValues(definition.name, values)
        }

        this.log.debug(
            `Registered unique values from ${accounts.length} managed source account(s) ` +
                `for ${this.uniqueDefinitions.length} unique attribute definition(s)`
        )
    }

    // ========================================================================
    // Public — Key Generation
    // ========================================================================

    public getSimpleKey(fusionAccount: FusionAccount): SimpleKeyType | undefined {
        const { fusionIdentityAttribute } = this.schemas

        const uniqueId = fusionAccount.attributes[fusionIdentityAttribute] as string | undefined

        if (isNullish(uniqueId) && this.skipAccountsWithMissingId) {
            this.log.warn(
                `Skipping account ${fusionAccount.name} [${fusionAccount.sourceName}]: ` +
                    `Missing value for fusion identity attribute '${fusionIdentityAttribute}'`
            )
            return undefined
        }

        assert(uniqueId, `Unique ID is required for simple key`)

        return SimpleKey(uniqueId)
    }

    // ========================================================================
    // Public — Counter Management
    // ========================================================================

    public async initializeCounters(): Promise<void> {
        const stateWrapper = this.getStateWrapper()
        const counterDefinitions = this.uniqueDefinitions.filter(
            (definition) => definition.useIncrementalCounter
        )
        if (counterDefinitions.length === 0) return

        this.log.debug(`Initializing ${counterDefinitions.length} incremental counter attributes`)
        const existingCounters = Object.fromEntries(
            Array.from(stateWrapper.entries()).filter(([key]) =>
                counterDefinitions.some((definition) => definition.name === key)
            )
        )
        if (Object.keys(existingCounters).length > 0) {
            this.log.debug(`Preserving existing counter values: ${JSON.stringify(existingCounters)}`)
        }

        await Promise.all(
            counterDefinitions.map((definition) => {
                const start = definition.counterStart ?? 1
                return stateWrapper.initCounter(definition.name, start)
            })
        )

        const finalCounters: { [key: string]: number } = {}
        for (const definition of counterDefinitions) {
            const value = stateWrapper.get(definition.name)
            if (value !== undefined) {
                finalCounters[definition.name] = value
            }
        }
        this.log.debug(
            `All incremental counters initialized. Current values: ${JSON.stringify(finalCounters)}`
        )
    }

    public async saveState(): Promise<void> {
        const stateObject = await this.getStateObject()
        this.log.info(`Saving state object: ${JSON.stringify(stateObject)}`)

        // State is persisted via the service registry's source service.
        // DefinitionService holds the canonical counter state in its StateWrapper;
        // the service registry (or caller) is responsible for persisting via
        // SourceService.patchSourceConfig(fusionSourceId, FUSION_STATE_CONFIG_PATH, stateObject).
        this.log.debug(
            `State save requested for ${Object.keys(stateObject).length} counter(s). ` +
                `Persist via SourceService.patchSourceConfig with path: ${FUSION_STATE_CONFIG_PATH}`
        )
    }

    public async getStateObject(): Promise<{ [key: string]: number }> {
        if (this.locks && typeof this.locks.waitForAllPendingOperations === 'function') {
            await this.locks.waitForAllPendingOperations()
        }
        const stateWrapper = this.getStateWrapper()
        this.log.debug(
            `Reading state - StateWrapper has ${stateWrapper.getSize()} entries`
        )

        const state = stateWrapper.getState()
        this.log.debug(`getState() returned: ${JSON.stringify(state)}`)

        return state
    }

    // ========================================================================
    // Private — Velocity Context Builder
    // ========================================================================

    private buildVelocityContext(fusionAccount: FusionAccount): Record<string, any> {
        const context: Record<string, any> = { ...fusionAccount.attributeBag.current }

        if (fusionAccount.identityName && context.name === undefined) {
            context.name = fusionAccount.identityName
        }

        const orderedAccounts = this.getOrderedAccountsForContext(fusionAccount)

        context.identity = fusionAccount.attributeBag.identity
        if (fusionAccount.identityName) {
            context.identity = {
                ...fusionAccount.attributeBag.identity,
                name: fusionAccount.identityName,
            }
        }

        context.accounts = orderedAccounts
        context.previous = fusionAccount.attributeBag.previous
        context.sources = Object.fromEntries(
            fusionAccount.attributeBag.sources.entries()
        )
        context.account = this.resolveOriginAccountObjectForVelocity(
            fusionAccount,
            orderedAccounts
        )

        if (fusionAccount.originSource) {
            context.originSource = fusionAccount.originSource
        }
        if (fusionAccount.originAccountId) {
            context.originAccount = fusionAccount.originAccountId
        }

        return context
    }

    private resolveOriginAccountObjectForVelocity(
        fusionAccount: FusionAccount,
        orderedAccounts: Record<string, any>[]
    ): Record<string, any> | undefined {
        const originIdRaw =
            fusionAccount.originAccountId ??
            fusionAccount.attributes[FusionAttribute.OriginAccount]
        const originId = trimStr(originIdRaw)
        if (!originId) return undefined

        const { originSource } = fusionAccount
        const identityBag = (fusionAccount.attributeBag.identity ?? {}) as Record<string, unknown>
        const identityHasData = Object.keys(identityBag).length > 0
        const { fusionDisplayAttribute, fusionIdentityAttribute } = this.schemas

        const configuredSchemaName = this.readAccountAttributeString(
            fusionAccount,
            fusionDisplayAttribute
        )
        const configuredSchemaId = this.readAccountAttributeString(
            fusionAccount,
            fusionIdentityAttribute
        )
        const identityName = fusionAccount.identityName
        const identityId = fusionAccount.identityId ?? trimStr(identityBag.id)

        const schemaName = configuredSchemaName ?? identityName ?? originId
        const schemaId = configuredSchemaId ?? identityId ?? originId

        const identityIdTrimmed = trimStr(identityId)
        const identityMatchesOrigin =
            identityIdTrimmed !== undefined && identityIdTrimmed === originId
        if (originSource === 'Identities' && identityHasData && identityMatchesOrigin) {
            return {
                ...identityBag,
                source: { name: 'Identities' },
                schema: {
                    name: schemaName,
                    id: schemaId,
                },
                IIQDisabled: Boolean(fusionAccount.disabled),
            }
        }

        const managed = orderedAccounts.find(
            (account) => getManagedAccountSnapshotKey(account) === originId
        )
        if (managed) return managed

        return undefined
    }

    private readAccountAttributeString(
        fusionAccount: FusionAccount,
        attributeName: string
    ): string | undefined {
        return trimStr(fusionAccount.attributes[attributeName])
    }

    private getOrderedAccountsForContext(
        fusionAccount: FusionAccount
    ): Record<string, any>[] {
        const { sources, sourceAccountContexts } = fusionAccount.attributeBag
        if (sources.size === 0) return sourceAccountContexts

        const ordered = this.buildOrderedAccountList(sources)
        return this.prioritizeMainAccount(ordered, fusionAccount)
    }

    private buildOrderedAccountList(
        sources: Map<string, Record<string, any>[]>
    ): Record<string, any>[] {
        const ordered: Record<string, any>[] = []
        const seenSources = new Set<string>()

        for (const sourceConfig of this.config.sources ?? []) {
            const sourceAccounts = sources.get(sourceConfig.name)
            if (sourceAccounts?.length) {
                ordered.push(...sourceAccounts)
                seenSources.add(sourceConfig.name)
            }
        }

        for (const [sourceName, sourceAccounts] of sources.entries()) {
            if (!seenSources.has(sourceName) && sourceAccounts.length > 0) {
                ordered.push(...sourceAccounts)
            }
        }

        return ordered
    }

    private prioritizeMainAccount(
        ordered: Record<string, any>[],
        fusionAccount: FusionAccount
    ): Record<string, any>[] {
        const mainAccountId = this.getMainAccountOverrideId(fusionAccount)
        if (!mainAccountId) return ordered

        const index = ordered.findIndex(
            (account) =>
                getManagedAccountSnapshotKey(account) === mainAccountId ||
                trimStr(account?._id) === mainAccountId
        )
        if (index <= 0) return ordered

        const prioritized = ordered[index]
        const before = ordered.slice(0, index)
        const after = ordered.slice(index + 1)
        return [prioritized, ...before, ...after]
    }

    private getMainAccountOverrideId(
        fusionAccount: FusionAccount
    ): string | undefined {
        return trimStr(
            fusionAccount.attributeBag.current[FusionAttribute.MainAccount]
        )
    }

    // ========================================================================
    // Private — Normal Definition Processing
    // ========================================================================

    private async processNormalDefinition(
        definition: NormalAttributeDefinition,
        fusionAccount: FusionAccount,
        context: Record<string, any>
    ): Promise<void> {
        const { fusionIdentityAttribute, fusionDisplayAttribute } = this.schemas

        if (this.applyDisplayAttributeOverrideIfApplicable(fusionAccount, definition.name)) {
            return
        }

        if (this.isSystemProvenanceAttribute(definition.name)) {
            return
        }

        const { current } = fusionAccount.attributeBag
        const hasExistingValue = isValidAttributeValue(current[definition.name])
        const isExistingFusionAccount = this.isExistingFusionAccount(fusionAccount)

        const isImmutableIdentityAttribute =
            definition.name === fusionIdentityAttribute &&
            hasExistingValue &&
            isExistingFusionAccount
        const isImmutableDisplayAttribute =
            definition.name === fusionDisplayAttribute &&
            hasExistingValue &&
            isExistingFusionAccount

        if (isImmutableIdentityAttribute || isImmutableDisplayAttribute) {
            return
        }

        if (definition.static && isExistingFusionAccount) {
            return
        }

        if (this.isUniqueAttribute(definition.name) && current[definition.name] !== undefined) {
            return
        }

        const result = evaluateAttributeTemplate(definition, context)
        if (result.error) {
            this.log.error(
                `Error evaluating normal attribute ${definition.name}: ${result.error}`
            )
            const safeDefault = this.fusionAttributeSafeDefault(
                definition.name,
                fusionAccount,
                fusionIdentityAttribute,
                fusionDisplayAttribute
            )
            if (safeDefault !== undefined) {
                fusionAccount.attributes[definition.name] = safeDefault
            }
            return
        }

        if (result.value !== undefined && result.value !== null) {
            fusionAccount.attributes[definition.name] = result.value
            context[definition.name] = result.value
            this.log.debug(
                `[${fusionAccount.name}] ${definition.name} = ${typeof result.value === 'object' ? JSON.stringify(result.value) : result.value}`
            )
        } else {
            const safeDefault = this.fusionAttributeSafeDefault(
                definition.name,
                fusionAccount,
                fusionIdentityAttribute,
                fusionDisplayAttribute
            )
            if (safeDefault !== undefined) {
                fusionAccount.attributes[definition.name] = safeDefault
                context[definition.name] = safeDefault
            }
        }
    }

    // ========================================================================
    // Private — Unique Definition Processing
    // ========================================================================

    private async processUniqueDefinition(
        definition: UniqueAttributeDefinition,
        fusionAccount: FusionAccount,
        context: Record<string, any>
    ): Promise<void> {
        const { fusionIdentityAttribute } = this.schemas

        if (definition.name === fusionIdentityAttribute) {
            const existingValue = fusionAccount.attributes[definition.name]
            if (
                isValidAttributeValue(existingValue) &&
                this.isExistingFusionAccount(fusionAccount)
            ) {
                return
            }
        }

        const value = await this.generateUniqueAttributeValue(
            definition,
            fusionAccount,
            context
        )
        if (value !== undefined && value !== null) {
            fusionAccount.attributes[definition.name] = value
            context[definition.name] = value
        }
    }

    // ========================================================================
    // Private — Unique Value Generation
    // ========================================================================

    private async generateUniqueAttributeValue(
        definition: UniqueAttributeDefinition,
        fusionAccount: FusionAccount,
        context: Record<string, any>
    ): Promise<any> {
        const lockKey = `unique:${definition.name}`

        return await this.locks.withLock(lockKey, async () => {
            const registeredValues = this.getUniqueValues(definition.name)
            const maxAttempts = this.maxAttempts ?? runtimeDefaults.maxAttempts

            if (definition.useIncrementalCounter) {
                return await this.generateWithIncrementalCounter(
                    definition,
                    fusionAccount,
                    context,
                    registeredValues,
                    maxAttempts
                )
            }

            return await this.generateWithCollisionDisambiguation(
                definition,
                fusionAccount,
                context,
                registeredValues,
                maxAttempts
            )
        })
    }

    private async generateWithIncrementalCounter(
        definition: UniqueAttributeDefinition,
        fusionAccount: FusionAccount,
        context: Record<string, any>,
        registeredValues: Set<string>,
        maxAttempts: number
    ): Promise<any> {
        const stateWrapper = this.getStateWrapper()
        const counterFn = stateWrapper.getCounter(definition.name)
        const digits = definition.digits ?? 1

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const counterValue = await counterFn()
            context.counter = padNumber(counterValue, digits)

            this.injectUUIDIfNeeded(definition, context)

            const result = evaluateAttributeTemplate(definition, context)
            if (result.error) {
                this.log.error(result.error)
                return undefined
            }
            const value = result.value
            if (value === undefined || value === null) return undefined
            this.log.debug(
                `[${fusionAccount.name}] ${definition.name} = ${typeof value === 'object' ? JSON.stringify(value) : value}`
            )

            const strValue =
                typeof value === 'object' ? JSON.stringify(value) : String(value)
            if (!registeredValues.has(strValue)) {
                registeredValues.add(strValue)
                this.log.debug(
                    `Generated unique value (incremental) for attribute ${definition.name}: ${strValue}`
                )
                return value
            }

            this.log.debug(
                `Collision on incremental counter for ${definition.name}, retrying (attempt ${attempt + 1})`
            )
        }

        this.log.error(
            `Failed to generate unique value for attribute ${definition.name} after ${maxAttempts} attempts`
        )
        return undefined
    }

    private async generateWithCollisionDisambiguation(
        definition: UniqueAttributeDefinition,
        fusionAccount: FusionAccount,
        context: Record<string, any>,
        registeredValues: Set<string>,
        maxAttempts: number
    ): Promise<any> {
        const counter = StateWrapper.getCounter()
        const digits = definition.digits ?? 1
        const effectiveExpression = this.buildEffectiveExpression(definition)
        context.counter = ''

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            this.injectUUIDIfNeeded(definition, context)

            const result = evaluateAttributeTemplate(definition, context, {
                expressionOverride: effectiveExpression,
            })
            if (result.error) {
                this.log.error(result.error)
                return undefined
            }
            const value = result.value
            if (value === undefined || value === null) return undefined
            this.log.debug(
                `[${fusionAccount.name}] ${definition.name} = ${typeof value === 'object' ? JSON.stringify(value) : value}`
            )

            const strValue =
                typeof value === 'object' ? JSON.stringify(value) : String(value)
            if (!registeredValues.has(strValue)) {
                registeredValues.add(strValue)
                this.log.debug(
                    `Generated unique value for attribute ${definition.name}: ${strValue}`
                )
                return value
            }

            this.log.debug(
                `Value ${strValue} already exists for unique attribute: ${definition.name}`
            )
            context.counter = padNumber(counter(), digits)
            this.log.debug(
                `Regenerating unique attribute: ${definition.name} (attempt ${attempt + 1})`
            )
        }

        this.log.error(
            `Failed to generate unique value for attribute ${definition.name} after ${maxAttempts} attempts`
        )
        return undefined
    }

    private buildEffectiveExpression(definition: UniqueAttributeDefinition): string {
        const expression = definition.expression ?? ''
        if (!expression) return ''
        if (
            expression.includes('$counter') ||
            expression.includes('${counter}') ||
            expression.includes('$UUID') ||
            expression.includes('${UUID}')
        ) {
            return expression
        }
        return `${expression}$counter`
    }

    private injectUUIDIfNeeded(
        definition: UniqueAttributeDefinition,
        context: Record<string, any>
    ): void {
        if (
            definition.expression &&
            (definition.expression.includes('$UUID') ||
                definition.expression.includes('${UUID}'))
        ) {
            context.UUID = crypto.randomUUID()
        }
    }

    // ========================================================================
    // Private — Core Schema Attributes
    // ========================================================================

    private ensureCoreSchemaAttributes(fusionAccount: FusionAccount): void {
        const { fusionIdentityAttribute, fusionDisplayAttribute } = this.schemas

        if (
            !this.skipAccountsWithMissingId &&
            !isValidAttributeValue(
                fusionAccount.attributes[fusionIdentityAttribute]
            )
        ) {
            const prevId =
                fusionAccount.previousAttributes?.[fusionIdentityAttribute]
            if (isValidAttributeValue(prevId)) {
                fusionAccount.attributes[fusionIdentityAttribute] = prevId
            } else {
                fusionAccount.attributes[fusionIdentityAttribute] = crypto.randomUUID()
                this.log.debug(
                    `Generated fallback UUID for missing identity attribute: ${fusionAccount.name}`
                )
            }
        }

        if (
            !isValidAttributeValue(
                fusionAccount.attributes[fusionDisplayAttribute]
            )
        ) {
            const prevDisplay =
                fusionAccount.previousAttributes?.[fusionDisplayAttribute]
            if (isValidAttributeValue(prevDisplay)) {
                fusionAccount.attributes[fusionDisplayAttribute] = prevDisplay
            } else {
                const defaultDisplay = trimStr(fusionAccount.name)
                if (defaultDisplay) {
                    fusionAccount.attributes[fusionDisplayAttribute] =
                        defaultDisplay
                    this.log.debug(
                        `Generated fallback for missing display attribute: ${fusionAccount.name}`
                    )
                }
            }
        }
    }

    // ========================================================================
    // Private — Helpers
    // ========================================================================

    private isExistingFusionAccount(fusionAccount: FusionAccount): boolean {
        return Object.keys(fusionAccount.previousAttributes ?? {}).length > 0
    }

    private fusionAttributeSafeDefault(
        attributeName: string,
        fusionAccount: FusionAccount,
        fusionIdentityAttribute: string,
        fusionDisplayAttribute: string
    ): string | undefined {
        if (attributeName === fusionIdentityAttribute) {
            if (this.skipAccountsWithMissingId) {
                return undefined
            }
            return crypto.randomUUID()
        }
        if (attributeName === fusionDisplayAttribute) {
            return trimStr(fusionAccount.name)
        }
        return undefined
    }

    private isSystemProvenanceAttribute(name: string): boolean {
        return (
            name === FusionAttribute.OriginAccount ||
            name === FusionAttribute.OriginSource
        )
    }
}
