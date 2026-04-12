import {
    FusionConfig,
    AttributeMap,
    NormalAttributeDefinition,
    UniqueAttributeDefinition,
    SourceConfig,
} from '../../model/config'
import { LogService } from '../logService'
import { FusionAccount } from '../../model/account'
import { SchemaService } from '../schemaService'
import { Account } from 'sailpoint-api-client'
import { CompoundKey, CompoundKeyType, SimpleKey, SimpleKeyType, StandardCommand } from '@sailpoint/connector-sdk'
import { evaluateVelocityTemplate, normalize, padNumber, removeSpaces, switchCase } from './formatting'
import { LockService } from '../lockService'
import { RenderContext } from 'velocityjs/dist/src/type'
import { v4 as uuidv4 } from 'uuid'
import { assert } from '../../utils/assert'
import { SourceService, buildSourceConfigPatch } from '../sourceService'
import { COMPOUND_KEY_UNIQUE_ID_ATTRIBUTE, FUSION_STATE_CONFIG_PATH } from './constants'
import { AttributeMappingConfig } from './types'
import { processAttributeMapping, buildAttributeMappingConfig } from './helpers'
import { isValidAttributeValue } from '../../utils/attributes'
import { StateWrapper } from './stateWrapper'
import { buildManagedAccountKey, parseManagedAccountKey } from '../../model/managedAccountKey'
import { velocitySnapshotSchemaId, velocitySnapshotSourceId } from '../../utils/velocityAccountSnapshot'

type AnyDefinition = NormalAttributeDefinition | UniqueAttributeDefinition
const MAIN_ACCOUNT_ATTRIBUTE = 'mainAccount'
/** System-managed provenance id; not mapped or defined via Velocity. */
const ORIGIN_ACCOUNT_ATTRIBUTE = 'originAccount'

/**
 * Managed account key for matching `mainAccount` / `$originAccount` — composite `sourceId::nativeIdentity`
 * from snapshot fields only. Use top-level `$originAccount` in Velocity when you need the origin key.
 */
function getManagedAccountSnapshotKey(account: Record<string, any> | undefined): string {
    if (!account) return ''
    const key = buildManagedAccountKey({
        sourceId: velocitySnapshotSourceId(account),
        nativeIdentity: velocitySnapshotSchemaId(account),
    })
    return String(key ?? '').trim()
}

// ============================================================================
// AttributeService Class
// ============================================================================

/**
 * Service for attribute mapping, attribute definition, and UUID management.
 * Combines functionality for mapping attributes from source accounts and generating unique IDs.
 */
export class AttributeService {
    private _attributeMappingConfig?: Map<string, AttributeMappingConfig>
    private normalDefinitions: NormalAttributeDefinition[] = []
    private uniqueDefinitions: UniqueAttributeDefinition[] = []
    private uniqueAttributeNames: Set<string> = new Set()
    private uniqueValuesByAttribute: Map<string, Set<string>> = new Map()
    private normalDefinitionByName: Map<string, NormalAttributeDefinition> = new Map()
    private uniqueDefinitionByName: Map<string, UniqueAttributeDefinition> = new Map()
    private stateWrapper?: StateWrapper
    private readonly skipAccountsWithMissingId: boolean
    private readonly attributeMaps?: AttributeMap[]
    private readonly attributeMerge: 'first' | 'list' | 'concatenate'
    private readonly sourceConfigs: SourceConfig[]
    private readonly maxAttempts?: number
    private readonly forceAttributeRefresh: boolean

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    /**
     * @param config - Fusion configuration containing attribute maps, definitions, and merge strategy
     * @param schemas - Schema service for resolving attribute names and types
     * @param sourceService - Source service for persisting state to the fusion source config
     * @param log - Logger instance
     * @param locks - Lock service for thread-safe unique Define generation
     * @param commandType - The current SDK command type (affects key generation behavior)
     */
    constructor(
        config: FusionConfig,
        private schemas: SchemaService,
        private sourceService: SourceService,
        private log: LogService,
        private locks: LockService,
        private commandType?: StandardCommand
    ) {
        this.attributeMaps = config.attributeMaps
        this.attributeMerge = config.attributeMerge
        this.sourceConfigs = config.sources
        this.maxAttempts = config.maxAttempts
        this.skipAccountsWithMissingId = config.skipAccountsWithMissingId
        this.forceAttributeRefresh = config.forceAttributeRefresh

        this.normalDefinitions = config.normalAttributeDefinitions ? [...config.normalAttributeDefinitions] : []
        this.uniqueDefinitions = config.uniqueAttributeDefinitions ? [...config.uniqueAttributeDefinitions] : []

        this.normalDefinitionByName = new Map(this.normalDefinitions.map((d) => [d.name, d]))
        this.uniqueDefinitionByName = new Map(this.uniqueDefinitions.map((d) => [d.name, d]))
        this.uniqueAttributeNames = new Set(this.uniqueDefinitions.map((d) => d.name))

        this.setStateWrapper(config.fusionState)
    }

    // ------------------------------------------------------------------------
    // Public State Management Methods
    // ------------------------------------------------------------------------

    /**
     * Save the current state to the source configuration
     */
    public async saveState(): Promise<void> {
        const { fusionSourceId } = this.sourceService
        const stateObject = await this.getStateObject()

        this.log.info(`Saving state object: ${JSON.stringify(stateObject)}`)
        const requestParameters = buildSourceConfigPatch(fusionSourceId, FUSION_STATE_CONFIG_PATH, stateObject)
        await this.sourceService.patchSourceConfig(fusionSourceId, requestParameters, 'AttributeService>saveState')
    }

    /**
     * Get the current state object
     */
    public async getStateObject(): Promise<{ [key: string]: number }> {
        if (this.locks && typeof this.locks.waitForAllPendingOperations === 'function') {
            await this.locks.waitForAllPendingOperations()
        }
        const stateWrapper = this.getStateWrapper()
        this.log.debug(`Reading state - StateWrapper has ${stateWrapper.state.size} entries`)

        const state = stateWrapper.getState()
        this.log.debug(`getState() returned: ${JSON.stringify(state)}`)

        return state
    }

    /**
     * Set state wrapper for counter-based attributes.
     * Injects lock service for thread-safe counter operations in parallel processing.
     *
     * @param state - Persisted counter state (attribute name -> numeric value); typically from config.fusionState
     */
    public setStateWrapper(state: Record<string, unknown> | undefined): void {
        this.stateWrapper = new StateWrapper(state, this.locks)
    }

    /**
     * Initialize incremental counters from unique attribute definitions.
     * Should be called once after setStateWrapper to ensure all counters are initialized.
     */
    public async initializeCounters(): Promise<void> {
        const stateWrapper = this.getStateWrapper()
        const counterDefinitions = this.uniqueDefinitions.filter((def) => def.useIncrementalCounter)
        if (counterDefinitions.length === 0) return

        this.log.debug(`Initializing ${counterDefinitions.length} incremental counter attributes`)
        const existingCounters = Object.fromEntries(
            Array.from(stateWrapper.state.entries()).filter(([key]) =>
                counterDefinitions.some((def) => def.name === key)
            )
        )
        if (Object.keys(existingCounters).length > 0) {
            this.log.debug(`Preserving existing counter values: ${JSON.stringify(existingCounters)}`)
        }

        await Promise.all(
            counterDefinitions.map((def) => {
                const start = def.counterStart ?? 1
                return stateWrapper.initCounter(def.name, start)
            })
        )

        const finalCounters: { [key: string]: number } = {}
        for (const def of counterDefinitions) {
            const value = stateWrapper.state.get(def.name)
            if (value !== undefined) {
                finalCounters[def.name] = value
            }
        }
        this.log.debug(`All incremental counters initialized. Current values: ${JSON.stringify(finalCounters)}`)
    }

    // ------------------------------------------------------------------------
    // Public Attribute Mapping Methods
    // ------------------------------------------------------------------------

    /**
     * Maps attributes from source accounts to the fusion account.
     * Processes source attributes in the established source order if refresh is needed,
     * using the current attribute bag as a default. For identity-type accounts, returns
     * immediately without mapping. Ensures fusion account history is preserved and never
     * overwritten by empty arrays from source mapping.
     *
     * @param fusionAccount - The fusion account to map attributes for
     */
    public mapAttributes(fusionAccount: FusionAccount): void {
        if (fusionAccount.type === 'identity') return

        const { attributeBag, needsRefresh } = fusionAccount
        const { fusionIdentityAttribute, fusionDisplayAttribute } = this.schemas
        const attributes = { ...attributeBag.current }

        // Ensure all fusionAccount sources have an entry (default to [] if missing).
        const sourceAttributeMap = attributeBag.sources
        for (const source of fusionAccount.sources) {
            if (!sourceAttributeMap.has(source)) {
                sourceAttributeMap.set(source, [])
            }
        }

        if (needsRefresh && sourceAttributeMap.size > 0) {
            const hasManagedAccountContext = Array.from(sourceAttributeMap.values()).some((accounts) => accounts.length > 0)
            const shouldPreserveCurrentWithoutContext = !hasManagedAccountContext && !fusionAccount.isIdentity
            const sourceOrder = this.sourceConfigs.map((sc) => sc.name)
            let prioritizedAccount = this.getMainAccountContextAccount(fusionAccount, sourceAttributeMap)
            const mappingTargets = this.getAttributeMappingTargetNames()
            for (const attribute of mappingTargets) {
                if (
                    this.shouldSkipMappedAttribute(
                        attribute,
                        fusionAccount,
                        fusionIdentityAttribute,
                        fusionDisplayAttribute
                    )
                ) {
                    continue
                }

                const processingConfig = this.attributeMappingConfig.get(attribute)!
                const processedValue = processAttributeMapping(
                    processingConfig,
                    sourceAttributeMap,
                    sourceOrder,
                    prioritizedAccount
                )
                if (processedValue === undefined) {
                    if (!shouldPreserveCurrentWithoutContext) {
                        delete attributes[attribute]
                    }
                    // mainAccount is used as an override context selector; when no supporting
                    // source value exists anymore, clear stale values so account mapping can update.
                    if (attribute === MAIN_ACCOUNT_ATTRIBUTE) {
                        delete attributes[attribute]
                        prioritizedAccount = undefined
                    }
                    continue
                }

                attributes[attribute] = processedValue
                if (attribute === MAIN_ACCOUNT_ATTRIBUTE) {
                    const mainAccountId = String(processedValue).trim()
                    prioritizedAccount =
                        mainAccountId.length > 0 ? this.findAccountByIdInSourceMap(sourceAttributeMap, mainAccountId) : undefined
                }
                if (attribute === 'history') {
                    this.applyHistoryMapping(processedValue, fusionAccount)
                }
            }
        }

        // Ensure fusion account history is never lost: for accounts that have their own audit log
        // (e.g. type 'managed' with setNonMatched), keep it in the bag so output is correct.
        if (fusionAccount.history.length > 0) {
            attributes['history'] = [...fusionAccount.history]
        }

        attributeBag.current = attributes
    }

    /**
     * Skip attribute mapping when identity/display must stay immutable or unique values are already set.
     */
    private shouldSkipMappedAttribute(
        attribute: string,
        fusionAccount: FusionAccount,
        fusionIdentityAttribute: string,
        fusionDisplayAttribute: string
    ): boolean {
        if (attribute === ORIGIN_ACCOUNT_ATTRIBUTE) return true
        const { current } = fusionAccount.attributeBag
        const hasExistingValue = isValidAttributeValue(current[attribute])
        const canResetDisplay = fusionAccount.needsReset && attribute === fusionDisplayAttribute
        const shouldKeepIdentityImmutable =
            this.isExistingFusionAccount(fusionAccount) && fusionAccount.isIdentity
        const isImmutableIdentityAttribute =
            attribute === fusionIdentityAttribute && hasExistingValue && shouldKeepIdentityImmutable
        const isImmutableDisplayAttribute =
            attribute === fusionDisplayAttribute && hasExistingValue && !canResetDisplay

        if (isImmutableIdentityAttribute || isImmutableDisplayAttribute) return true
        if (this.uniqueAttributeNames.has(attribute) && current[attribute] !== undefined) return true
        return false
    }

    private applyHistoryMapping(processedValue: unknown, fusionAccount: FusionAccount): void {
        if (!Array.isArray(processedValue) || processedValue.length === 0) return

        const history = processedValue
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)

        if (history.length === 0) return
        fusionAccount.importHistory(history)
    }

    // ------------------------------------------------------------------------
    // Public Attribute Refresh Methods
    // ------------------------------------------------------------------------

    /**
     * Refreshes all attribute definitions for a fusion account (normal + unique).
     *
     * @param fusionAccount - The fusion account to refresh attributes for
     */
    public async refreshAllAttributes(fusionAccount: FusionAccount): Promise<void> {
        await this.refreshDefinitions(
            fusionAccount,
            this.normalDefinitions,
            (d, fa, ctx) => this.processNormalDefinition(d, fa, ctx),
            'normal'
        )
        await this.refreshDefinitions(
            fusionAccount,
            this.uniqueDefinitions,
            (d, fa, ctx) => this.processUniqueDefinition(d, fa, ctx),
            'unique'
        )
    }

    /**
     * Refreshes only normal attribute definitions.
     * Skips processing if the account doesn't need a refresh.
     *
     * @param fusionAccount - The fusion account to refresh normal attributes for
     */
    public async refreshNormalAttributes(fusionAccount: FusionAccount): Promise<void> {
        if (this.normalDefinitions.length === 0) return

        const forceRefresh =
            this.forceAttributeRefresh ||
            fusionAccount.needsReset ||
            this.normalDefinitions.some((def) => def.refresh)
        const shouldRefresh = fusionAccount.needsRefresh || forceRefresh
        if (!shouldRefresh) return

        this.log.debug(`Refreshing normal attributes for account: ${fusionAccount.name} [${fusionAccount.sourceName}]`)
        await this.refreshDefinitions(
            fusionAccount,
            this.normalDefinitions,
            (d, fa, ctx) => this.processNormalDefinition(d, fa, ctx),
            'normal'
        )
    }

    /**
     * Refreshes only unique attribute definitions.
     * Unique attributes are only generated for new accounts; existing values are preserved
     * unless needsReset is set (e.g. when re-enabling a previously disabled account).
     *
     * Disabling and then re-enabling a Fusion account triggers a full unique attribute
     * reset: the enable operation sets `needsReset = true`, which causes this method to
     * unregister existing values and regenerate them via {@link applyUniqueDefinitions}.
     * This ensures the re-enabled account receives fresh, collision-free unique values
     * (such as usernames) that may have been reassigned while it was disabled.
     *
     * Additionally, if any unique attribute is currently empty or missing (e.g. because a
     * prior generation failed when `$account` resolved to an identity-backed object lacking
     * managed-account attributes), this method will attempt to regenerate those values
     * regardless of the needsRefresh flag, preventing a permanent empty-attribute state.
     *
     * @param fusionAccount - The fusion account to refresh unique attributes for
     */
    public async refreshUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        if (this.uniqueDefinitions.length === 0) return

        // Also refresh when any unique attribute value is missing or empty, to recover from
        // failed generation on a prior run (e.g. $account resolved to an identity object
        // that lacked the managed-account attributes referenced by the expression).
        const hasMissingUniqueAttribute = this.uniqueDefinitions.some(
            (def) => !isValidAttributeValue(fusionAccount.attributes[def.name])
        )

        const shouldRefresh = fusionAccount.needsRefresh || fusionAccount.needsReset || hasMissingUniqueAttribute
        if (!shouldRefresh) return

        this.log.debug(`Refreshing unique attributes for account: ${fusionAccount.name} [${fusionAccount.sourceName}]`)

        if (fusionAccount.needsReset) {
            await this.unregisterUniqueAttributes(fusionAccount)
        }

        await this.refreshDefinitions(
            fusionAccount,
            this.uniqueDefinitions,
            (d, fa, ctx) => this.processUniqueDefinition(d, fa, ctx),
            'unique'
        )
    }

    /**
     * Process unique attribute values for a fusion account (register or unregister)
     */
    private async processUniqueAttributeValues(
        fusionAccount: FusionAccount,
        operation: 'register' | 'unregister'
    ): Promise<void> {
        const { fusionIdentityAttribute } = this.schemas
        const logMessage = operation === 'register' ? 'Registering' : 'Unregistering'
        this.log.debug(`${logMessage} unique attributes for account: ${fusionAccount.nativeIdentity}`)

        for (const def of this.uniqueDefinitions) {
            if (operation === 'unregister' && def.name === fusionIdentityAttribute) {
                continue
            }

            const value = fusionAccount.attributes[def.name]
            const isEmpty = value === undefined || value === null || value === ''
            if (!isEmpty && !fusionAccount.needsReset) continue

            const valueStr = String(value)
            const lockKey = `unique:${def.name}`
            await this.locks.withLock(lockKey, async () => {
                const valuesSet = this.getUniqueValues(def.name)
                if (operation === 'register') {
                    assert(
                        this.uniqueDefinitionByName.has(def.name),
                        `Attribute ${def.name} not found in unique attribute definition config`
                    )
                    valuesSet.add(valueStr)
                    return
                }
                if (!valuesSet.delete(valueStr)) return
                this.log.debug(`Unregistered unique value '${valueStr}' for attribute ${def.name}`)
            })
        }
    }

    /**
     * Registers all unique attribute values for a fusion account, preventing them
     * from being assigned to other accounts.
     *
     * @param fusionAccount - The fusion account whose unique values to register
     */
    public async registerUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        await this.processUniqueAttributeValues(fusionAccount, 'register')
    }

    /**
     * Unregisters all unique attribute values for a fusion account, releasing them
     * for reassignment. Used when an account is being removed or re-enabled.
     *
     * @param fusionAccount - The fusion account whose unique values to release
     */
    public async unregisterUniqueAttributes(fusionAccount: FusionAccount): Promise<void> {
        await this.processUniqueAttributeValues(fusionAccount, 'unregister')
    }

    // ------------------------------------------------------------------------
    // Public Key Generation Methods
    // ------------------------------------------------------------------------

    /**
     * Generate a simple key for a fusion account.
     *
     * The key is derived from the fusion identity attribute value (typically a unique
     * attribute such as a UUID or generated username). If the attribute is empty and
     * `skipAccountsWithMissingId` is enabled, the method returns `undefined`, which
     * causes {@link FusionService.getISCAccount} to omit the account from the output.
     *
     * This enables a deliberate pattern: generate an intentionally empty identity
     * attribute (via attribute definitions that resolve to an empty string) combined
     * with the "Skip accounts with a missing identifier" processing option to prevent
     * specific managed accounts or identities from producing Fusion accounts.
     *
     * @returns SimpleKeyType if successful, undefined if skipAccountsWithMissingId is enabled and the ID is missing
     */
    public getSimpleKey(fusionAccount: FusionAccount): SimpleKeyType | undefined {
        const { fusionIdentityAttribute } = this.schemas

        const uniqueId = fusionAccount.attributes[fusionIdentityAttribute] as string | undefined

        if (this.skipAccountsWithMissingId && !uniqueId) {
            this.log.warn(
                `Skipping account ${fusionAccount.name} [${fusionAccount.sourceName}]: ` +
                `Missing value for fusion identity attribute '${fusionIdentityAttribute}'`
            )
            return undefined
        }

        const finalId = uniqueId ?? fusionAccount.nativeIdentity
        assert(finalId, `Unique ID is required for simple key`)

        return SimpleKey(finalId)
    }

    /**
     * Generate a compound key for a fusion account
     */
    public getCompoundKey(fusionAccount: FusionAccount): CompoundKeyType {
        const { fusionDisplayAttribute } = this.schemas

        const uniqueId = fusionAccount.attributes[COMPOUND_KEY_UNIQUE_ID_ATTRIBUTE] as string
        assert(uniqueId, `Unique ID is required for compound key`)
        const lookupId = (fusionAccount.attributes[fusionDisplayAttribute] as string) ?? uniqueId

        return CompoundKey(lookupId, uniqueId)
    }

    // ------------------------------------------------------------------------
    // Private Configuration Helper Methods
    // ------------------------------------------------------------------------

    /**
     * Resolve all mapping targets that should be available in attribute-definition context.
     * Includes schema attributes plus explicit attribute-map targets.
     */
    private getAttributeMappingTargetNames(): string[] {
        const schemaAttributes = this.schemas.listSchemaAttributeNames()
        const mappedAttributes = (this.attributeMaps ?? [])
            .map((am) => am.newAttribute)
            .filter((name): name is string => Boolean(name))

        return Array.from(new Set([...schemaAttributes, ...mappedAttributes]))
    }

    private get attributeMappingConfig(): Map<string, AttributeMappingConfig> {
        if (!this._attributeMappingConfig) {
            this._attributeMappingConfig = new Map()
            const mappingTargets = this.getAttributeMappingTargetNames()
            for (const attrName of mappingTargets) {
                this._attributeMappingConfig.set(
                    attrName,
                    buildAttributeMappingConfig(attrName, this.attributeMaps, this.attributeMerge)
                )
            }
        }
        return this._attributeMappingConfig
    }

    /**
     * Check whether an attribute name belongs to a unique definition.
     */
    public isUniqueAttribute(name: string): boolean {
        return this.uniqueAttributeNames.has(name)
    }

    /**
     * Get or create the Set of registered unique values for an attribute.
     * The Set is stored in uniqueValuesByAttribute and shared across attribute definitions.
     */
    private getUniqueValues(attributeName: string): Set<string> {
        let set = this.uniqueValuesByAttribute.get(attributeName)
        if (!set) {
            set = new Set<string>()
            this.uniqueValuesByAttribute.set(attributeName, set)
        }
        return set
    }

    /**
     * Register an array of existing values for a unique attribute.
     * Use when loading existing accounts or bulk-initializing to prevent duplicate value generation.
     *
     * @param attributeName - The attribute name (must match a unique attribute definition)
     * @param values - Array of values to register as already in use
     */
    public registerExistingValues(attributeName: string, values: string[]): void {
        if (values.length === 0) return
        const set = this.getUniqueValues(attributeName)
        for (const v of values) {
            if (v != null && v !== '') {
                set.add(String(v))
            }
        }
        this.log.debug(`Registered ${values.length} existing value(s) for attribute '${attributeName}'`)
    }

    /**
     * Lightweight bulk registration of unique attribute values from raw Account objects.
     * Reads unique attribute values directly from account.attributes without creating
     * FusionAccount instances, avoiding the overhead of full object hydration.
     *
     * Use this instead of preProcessFusionAccounts + registerUniqueAttributes
     * for single-account operations (create, enable) where only uniqueness
     * enforcement is needed.
     *
     * @param accounts - Raw Account objects from the platform
     */
    public registerUniqueValuesFromRawAccounts(accounts: Account[]): void {
        if (this.uniqueDefinitions.length === 0) return

        for (const def of this.uniqueDefinitions) {
            const values: string[] = []
            for (const account of accounts) {
                const value = account.attributes?.[def.name]
                if (value != null && value !== '') {
                    values.push(String(value))
                }
            }
            this.registerExistingValues(def.name, values)
        }

        this.log.debug(
            `Registered unique values from ${accounts.length} raw account(s) ` +
            `for ${this.uniqueDefinitions.length} unique attribute definition(s)`
        )
    }

    /**
     * Seed persistent incremental counters from raw Account objects.
     *
     * This is a lightweight step used by non-aggregation flows (like custom:report)
     * to avoid "burning" counter values on collisions when persisted counter state
     * is missing/out of date but existing accounts already have assigned values.
     *
     * For each unique attribute definition with useIncrementalCounter enabled, this
     * scans raw account attribute values and advances the counter state to at least
     * the max numeric suffix observed (e.g. NG015 -> 15).
     */
    public async seedIncrementalCountersFromRawAccounts(accounts: Account[]): Promise<void> {
        if (this.uniqueDefinitions.length === 0) return
        if (!accounts.length) return

        const incrementalDefs = this.uniqueDefinitions.filter((d) => d.useIncrementalCounter)
        if (incrementalDefs.length === 0) return

        const stateWrapper = this.getStateWrapper()

        for (const def of incrementalDefs) {
            let maxSeen = 0
            for (const account of accounts) {
                const raw = account.attributes?.[def.name]
                if (raw == null || raw === '') continue
                const str = String(raw)
                const match = str.match(/(\d+)\s*$/)
                if (!match) continue
                const parsed = Number.parseInt(match[1], 10)
                if (Number.isFinite(parsed) && parsed > maxSeen) {
                    maxSeen = parsed
                }
            }
            if (maxSeen <= 0) continue

            const key = def.name
            const lockKey = `counter:${key}`
            await this.locks.withLock(lockKey, async () => {
                const current = stateWrapper.state.get(key)
                if (current === undefined) {
                    const start = def.counterStart ?? 1
                    await stateWrapper.initCounter(key, start)
                }
                const nextCurrent = stateWrapper.state.get(key) ?? 0
                if (maxSeen > nextCurrent) {
                    stateWrapper.state.set(key, maxSeen)
                }
            })
        }
    }

    private getStateWrapper(): StateWrapper {
        assert(this.stateWrapper, 'State wrapper is not set')
        return this.stateWrapper!
    }

    // ------------------------------------------------------------------------
    // Private Context Builder Methods
    // ------------------------------------------------------------------------

    /**
     * Build Velocity context from FusionAccount's attributeBag
     * The context includes current attributes plus referenceable objects from attributeBag
     */
    private buildVelocityContext(fusionAccount: FusionAccount): Record<string, any> {
        const context: { [key: string]: any } = { ...fusionAccount.attributeBag.current }
        const orderedAccounts = this.getOrderedAccountsForContext(fusionAccount)

        context.identity = fusionAccount.attributeBag.identity
        context.accounts = orderedAccounts
        context.previous = fusionAccount.attributeBag.previous
        context.sources = fusionAccount.attributeBag.sources
        context.account = this.resolveOriginAccountObjectForVelocity(fusionAccount, orderedAccounts)

        if (fusionAccount.originSource) {
            context.originSource = fusionAccount.originSource
        }
        if (fusionAccount.originAccountId) {
            context.originAccount = fusionAccount.originAccountId
        }

        return context
    }

    /**
     * Velocity `$account`: origin snapshot (managed account shape or identity-backed).
     * `$originAccount` remains the origin key string (set on context above).
     *
     * For identity-origin (baseline) accounts that have managed accounts attached,
     * the first managed account is preferred as `$account` so Velocity expressions
     * referencing managed-account attributes (e.g. `$account.employeeId`) resolve
     * correctly. `$identity` always carries identity-specific attributes regardless.
     * When no managed accounts are present, falls back to the identity object.
     */
    private resolveOriginAccountObjectForVelocity(
        fusionAccount: FusionAccount,
        orderedAccounts: Record<string, any>[]
    ): Record<string, any> | undefined {
        const originIdRaw = fusionAccount.originAccountId ?? fusionAccount.attributeBag.current[ORIGIN_ACCOUNT_ATTRIBUTE]
        const originId =
            originIdRaw != null && String(originIdRaw).trim() !== '' ? String(originIdRaw).trim() : undefined
        if (!originId) return undefined

        const { originSource } = fusionAccount
        const identityBag = fusionAccount.attributeBag.identity ?? {}
        const identityHasData = Object.keys(identityBag).length > 0

        const identityBackedName =
            String(
                fusionAccount.name ??
                    (identityBag as Record<string, unknown>).name ??
                    (identityBag as Record<string, unknown>).displayName ??
                    ''
            ).trim() || originId

        // For baseline accounts with managed accounts already attached, prefer the first
        // managed account as $account so attribute expressions resolve managed-source data.
        // This covers the common case where a baseline Fusion account has one or more
        // managed accounts added after initial creation.
        if (originSource === 'Identities' && orderedAccounts.length > 0) {
            return orderedAccounts[0]
        }

        if (originSource === 'Identities' && identityHasData) {
            return {
                ...identityBag,
                _id: originId,
                source: { name: 'Identities' },
                schema: {
                    name: identityBackedName,
                    id: originId,
                },
                IIQDisabled: Boolean(fusionAccount.disabled),
            }
        }

        const parsedManagedKey = parseManagedAccountKey(originId)
        const managed = orderedAccounts.find((a) => {
            const snapshotKey = getManagedAccountSnapshotKey(a)
            if (snapshotKey === originId) return true
            const accountRowId = String(a?._id ?? '').trim()
            if (accountRowId === originId) return true
            if (!parsedManagedKey) return false
            const sourceId = velocitySnapshotSourceId(a)
            const nativeIdentity = velocitySnapshotSchemaId(a)
            return sourceId === parsedManagedKey.sourceId && nativeIdentity === parsedManagedKey.nativeIdentity
        })
        if (managed) return managed

        if (originSource === 'Identities') {
            return {
                ...identityBag,
                _id: originId,
                source: { name: 'Identities' },
                schema: {
                    name: identityBackedName,
                    id: originId,
                },
                IIQDisabled: Boolean(fusionAccount.disabled),
            }
        }

        return {
            _id: originId,
            source: { name: originSource ?? '' },
            schema: {
                name: String(fusionAccount.name ?? '').trim() || originId,
                id: originId,
            },
        }
    }

    /**
     * Build a deterministic accounts array for attribute-definition context.
     *
     * Ordering rules:
     * 1) Sources are ordered by config.sources.
     * 2) Accounts within a source keep insertion order.
     * 3) Any non-configured sources are appended in map insertion order.
     */
    private getOrderedAccountsForContext(fusionAccount: FusionAccount): Record<string, any>[] {
        const { sources } = fusionAccount.attributeBag
        if (sources.size === 0) return fusionAccount.attributeBag.accounts

        const ordered: Record<string, any>[] = []
        const seenSources = new Set<string>()

        for (const sc of this.sourceConfigs) {
            const sourceAccounts = sources.get(sc.name)
            if (!sourceAccounts || sourceAccounts.length === 0) continue
            ordered.push(...sourceAccounts)
            seenSources.add(sc.name)
        }

        for (const [sourceName, sourceAccounts] of sources.entries()) {
            if (seenSources.has(sourceName) || sourceAccounts.length === 0) continue
            ordered.push(...sourceAccounts)
        }

        const mainAccountId = this.getMainAccountOverrideId(fusionAccount)
        if (!mainAccountId) return ordered

        const prioritizedIndex = ordered.findIndex(
            (account) =>
                getManagedAccountSnapshotKey(account) === mainAccountId ||
                String(account?._id ?? '').trim() === mainAccountId
        )
        if (prioritizedIndex <= 0) return ordered

        const prioritizedAccount = ordered[prioritizedIndex]
        return [prioritizedAccount, ...ordered.slice(0, prioritizedIndex), ...ordered.slice(prioritizedIndex + 1)]
    }

    private getMainAccountOverrideId(fusionAccount: FusionAccount): string | undefined {
        const rawValue = fusionAccount.attributeBag.current[MAIN_ACCOUNT_ATTRIBUTE]
        if (!isValidAttributeValue(rawValue)) return undefined
        const accountId = String(rawValue).trim()
        return accountId.length > 0 ? accountId : undefined
    }

    private getMainAccountContextAccount(
        fusionAccount: FusionAccount,
        sourceAttributeMap: Map<string, Record<string, any>[]>
    ): Record<string, any> | undefined {
        const mainAccountId = this.getMainAccountOverrideId(fusionAccount)
        if (!mainAccountId) return undefined

        return this.findAccountByIdInSourceMap(sourceAttributeMap, mainAccountId)
    }

    private findAccountByIdInSourceMap(
        sourceAttributeMap: Map<string, Record<string, any>[]>,
        accountId: string
    ): Record<string, any> | undefined {
        for (const accounts of sourceAttributeMap.values()) {
            const match = accounts.find(
                (account) =>
                    getManagedAccountSnapshotKey(account) === accountId ||
                    String(account?._id ?? '').trim() === accountId
            )
            if (match) return match
        }

        return undefined
    }

    // ------------------------------------------------------------------------
    // Private Map & Define Methods
    // ------------------------------------------------------------------------

    /**
     * Evaluate template expression and apply transformations
     */
    private evaluateTemplate(
        definition: AnyDefinition,
        context: RenderContext,
        accountName?: string,
        expressionOverride?: string
    ): string | undefined {
        const expression = expressionOverride ?? definition.expression
        if (!expression) {
            this.log.error(`Expression is required for attribute ${definition.name}`)
            return undefined
        }

        let value = evaluateVelocityTemplate(expression, context, definition.maxLength)
        if (!value) {
            this.log.error(`Failed to evaluate velocity template for attribute ${definition.name}`)
            return undefined
        }

        // Compare to expression without trailing $counter (UniqueAttributeDefinition may auto-append it)
        const exprWithoutCounter = expression.replace(/\$counter$|\$\{counter\}$/, '')
        const outputMatchesExpression =
            value === expression || (exprWithoutCounter !== expression && value === exprWithoutCounter)
        if (outputMatchesExpression && this.hasVelocityVariableReference(exprWithoutCounter || expression)) {
            this.log.warn(
                `Velocity template for attribute ${definition.name} returned unresolved variable expression: ${value}`
            )
            return undefined
        }

        if (definition.trim) value = value.trim()
        if (definition.case) value = switchCase(value, definition.case)
        if (definition.spaces) value = removeSpaces(value)
        if (definition.normalize) value = normalize(value)

        this.log.debug(`[${accountName}] ${definition.name} = ${value}`)

        return value
    }

    /**
     * Detect whether an expression references at least one Velocity variable token.
     * Examples: $name, ${name}. Excludes escaped tokens like \$name.
     */
    private hasVelocityVariableReference(expression: string): boolean {
        return /(^|[^\\])\$(\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/.test(expression)
    }

    /**
     * Generate a normal attribute value (template evaluation only)
     */
    private async generateNormalAttributeValue(
        definition: NormalAttributeDefinition,
        fusionAccount: FusionAccount,
        context: { [key: string]: any }
    ): Promise<string | undefined> {
        return this.evaluateTemplate(definition, context, fusionAccount.name)
    }

    /**
     * Generate a unique attribute value with uniqueness enforcement.
     *
     * Handles three modes via the same definition type:
     * - `$UUID` in expression: a v4 UUID is generated and injected into the Velocity context
     * - `useIncrementalCounter`: a persistent counter ($counter) increments on every use
     * - Default: collision-based disambiguation appends a non-persistent $counter on collision
     */
    private async generateUniqueAttributeValue(
        definition: UniqueAttributeDefinition,
        fusionAccount: FusionAccount,
        context: { [key: string]: any }
    ): Promise<string | undefined> {
        const lockKey = `unique:${definition.name}`

        return await this.locks.withLock(lockKey, async () => {
            const registeredValues = this.getUniqueValues(definition.name)
            const maxAttempts = this.maxAttempts ?? 100

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

    /**
     * Incremental counter mode: a persistent counter always increments (like old 'counter' type).
     */
    private async generateWithIncrementalCounter(
        definition: UniqueAttributeDefinition,
        fusionAccount: FusionAccount,
        context: { [key: string]: any },
        registeredValues: Set<string>,
        maxAttempts: number
    ): Promise<string | undefined> {
        const stateWrapper = this.getStateWrapper()
        const counterFn = stateWrapper.getCounter(definition.name)
        const digits = definition.digits ?? 1

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const counterValue = await counterFn()
            context.counter = padNumber(counterValue, digits)

            this.injectUUIDIfNeeded(definition, context)

            const value = this.evaluateTemplate(definition, context, fusionAccount.name)
            if (!value) return undefined

            if (!registeredValues.has(value)) {
                registeredValues.add(value)
                this.log.debug(`Generated unique value (incremental) for attribute ${definition.name}: ${value}`)
                return value
            }

            this.log.debug(`Collision on incremental counter for ${definition.name}, retrying (attempt ${attempt + 1})`)
        }

        this.log.error(`Failed to generate unique value for attribute ${definition.name} after ${maxAttempts} attempts`)
        return undefined
    }

    /**
     * Collision disambiguation mode: first attempt has empty $counter; on collision a
     * non-persistent counter increments (like old 'unique' type).
     */
    private async generateWithCollisionDisambiguation(
        definition: UniqueAttributeDefinition,
        fusionAccount: FusionAccount,
        context: { [key: string]: any },
        registeredValues: Set<string>,
        maxAttempts: number
    ): Promise<string | undefined> {
        const counter = StateWrapper.getCounter()
        const digits = definition.digits ?? 1

        // Ensure expression has $counter for disambiguation fallback (local only; do not mutate config).
        // Skip auto-append for UUID-based expressions because UUID already
        // provides uniqueness and appending counter can mutate intent.
        let effectiveExpression = definition.expression ?? ''
        if (
            effectiveExpression &&
            !effectiveExpression.includes('$counter') &&
            !effectiveExpression.includes('${counter}') &&
            !effectiveExpression.includes('$UUID') &&
            !effectiveExpression.includes('${UUID}')
        ) {
            effectiveExpression = `${effectiveExpression}$counter`
        }
        context.counter = ''

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            this.injectUUIDIfNeeded(definition, context)

            const value = this.evaluateTemplate(definition, context, fusionAccount.name, effectiveExpression)
            if (!value) return undefined

            if (!registeredValues.has(value)) {
                registeredValues.add(value)
                this.log.debug(`Generated unique value for attribute ${definition.name}: ${value}`)
                return value
            }

            this.log.debug(`Value ${value} already exists for unique attribute: ${definition.name}`)
            context.counter = padNumber(counter(), digits)
            this.log.debug(`Regenerating unique attribute: ${definition.name} (attempt ${attempt + 1})`)
        }

        this.log.error(`Failed to generate unique value for attribute ${definition.name} after ${maxAttempts} attempts`)
        return undefined
    }

    /**
     * If the expression references $UUID or ${UUID}, generate a fresh v4 UUID
     * and inject it into the Velocity context.
     */
    private injectUUIDIfNeeded(definition: UniqueAttributeDefinition, context: { [key: string]: any }): void {
        if (
            definition.expression &&
            (definition.expression.includes('$UUID') || definition.expression.includes('${UUID}'))
        ) {
            context.UUID = uuidv4()
        }
    }

    /**
     * Existing Fusion accounts reconstructed from the Fusion source keep previous
     * attributes populated. New in-run accounts leave this bag empty.
     */
    private isExistingFusionAccount(fusionAccount: FusionAccount): boolean {
        return Object.keys(fusionAccount.previousAttributes ?? {}).length > 0
    }

    // ------------------------------------------------------------------------
    // Private Attribute Processing Flow
    // ------------------------------------------------------------------------

    /**
     * Apply a definition list to a fusion account using the provided processor.
     *
     * Builds the Velocity context once per account and reuses it across all definitions.
     * When an attribute value is generated, it is also set on the shared context so
     * subsequent definitions can reference it. Definition order matters.
     */
    private async refreshDefinitions<T extends AnyDefinition>(
        fusionAccount: FusionAccount,
        definitions: T[],
        processor: (definition: T, fusionAccount: FusionAccount, context: { [key: string]: any }) => Promise<void>,
        kind: 'normal' | 'unique'
    ): Promise<void> {
        if (definitions.length === 0) return
        const context = this.buildVelocityContext(fusionAccount)

        for (const definition of definitions) {
            try {
                await processor(definition, fusionAccount, context)
            } catch (error) {
                this.log.error(
                    `Error generating ${kind} attribute ${definition.name} for account: ${fusionAccount.name} (${fusionAccount.sourceName})`,
                    (error as any).message
                )
                if (kind === 'unique') throw error
            }
        }
    }

    /**
     * Process a single normal attribute definition for an account.
     *
     * Immutability guards for identity-linked accounts:
     * - **nativeIdentity** (fusionIdentityAttribute): skipped entirely to prevent
     *   disconnection between the existing Fusion account and subsequent updates.
     * - **name** (fusionDisplayAttribute): locked to the hosting identity's name to
     *   prevent destruction of the identity linkage.
     *
     * Generated values are written to both the account's attribute bag and the shared
     * Velocity context, making them available to subsequent definitions in the same run.
     */
    /**
     * Best-effort display label for the correlated ISC identity (not persisted fusion account.name,
     * which may still hold a managed native id when the identity layer was skipped).
     */
    private hostingIdentityDisplayLabel(fusionAccount: FusionAccount): string | undefined {
        const trim = (v: unknown) => {
            const s = String(v ?? '').trim()
            return s.length > 0 ? s : undefined
        }
        const idn = trim(fusionAccount.identityDisplayName)
        if (idn) return idn
        const bag = fusionAccount.attributeBag.identity as Record<string, unknown> | undefined
        if (bag) {
            const fromBag = trim(bag.displayName) ?? trim(bag.name)
            if (fromBag) return fromBag
        }
        return trim(fusionAccount.name)
    }

    private async processNormalDefinition(
        definition: NormalAttributeDefinition,
        fusionAccount: FusionAccount,
        context: { [key: string]: any }
    ): Promise<void> {
        const { name, refresh } = definition
        if (name === ORIGIN_ACCOUNT_ATTRIBUTE) return
        const { fusionIdentityAttribute, fusionDisplayAttribute } = this.schemas
        const needsRefresh = fusionAccount.needsRefresh || fusionAccount.needsReset || refresh
        const hasValue = isValidAttributeValue(fusionAccount.attributes[name])
        const canResetDisplay = fusionAccount.needsReset && name === fusionDisplayAttribute
        const shouldKeepIdentityImmutable = this.isExistingFusionAccount(fusionAccount) && fusionAccount.isIdentity

        if (hasValue && !needsRefresh) return

        if (hasValue && name === fusionIdentityAttribute && shouldKeepIdentityImmutable) {
            return
        }

        if (hasValue && name === fusionDisplayAttribute && !canResetDisplay) {
            return
        }

        if (shouldKeepIdentityImmutable && name === fusionIdentityAttribute) {
            this.log.warn(`Skipping change of nativeIdentity for account: ${fusionAccount.name}`)
            return
        }

        if (fusionAccount.fromIdentity && name === fusionDisplayAttribute) {
            const label = this.hostingIdentityDisplayLabel(fusionAccount)
            if (label) {
                this.log.info(`Setting identity name for attribute: ${name} for account: ${fusionAccount.name}`)
                fusionAccount.attributes[name] = label
            }
            return
        }

        const value = await this.generateNormalAttributeValue(definition, fusionAccount, context)
        if (value === undefined) {
            // Clear attribute when expression fails (e.g. unresolved variables), so we do not
            // retain a literal template string that may have come from attribute mapping.
            delete fusionAccount.attributes[name]
            delete context[name]
            return
        }
        fusionAccount.attributes[name] = value
        context[name] = value
    }

    /**
     * Process a single unique attribute definition for an account.
     *
     * Existing unique values are preserved unless `needsReset` is set (triggered by
     * re-enabling a disabled account). This prevents accidental regeneration of stable
     * identifiers. Use regular unique attribute schemas to define changeable attributes
     * (e.g. usernames) that should be regenerated on enable/disable cycles.
     *
     * Immutability guards for identity-linked accounts:
     * - **nativeIdentity** (fusionIdentityAttribute): skipped entirely to prevent
     *   disconnection between the existing Fusion account and subsequent updates.
     * - **name** (fusionDisplayAttribute): locked to the hosting identity's name to
     *   prevent destruction of the identity linkage.
     *
     * Generated values are written to both the account's attribute bag and the shared
     * Velocity context, making them available to subsequent unique definitions.
     */
    private async processUniqueDefinition(
        definition: UniqueAttributeDefinition,
        fusionAccount: FusionAccount,
        context: { [key: string]: any }
    ): Promise<void> {
        const { name } = definition
        if (name === ORIGIN_ACCOUNT_ATTRIBUTE) return
        const { fusionIdentityAttribute, fusionDisplayAttribute } = this.schemas
        const existingValue = fusionAccount.attributes[name]
        const hasValue = isValidAttributeValue(existingValue)
        const isFusionIdentityAttribute = name === fusionIdentityAttribute
        const isFusionDisplayAttribute = name === fusionDisplayAttribute
        const isExistingFusionAccount = this.isExistingFusionAccount(fusionAccount)
        const isExistingIdentity = isExistingFusionAccount && fusionAccount.isIdentity

        // Don't regenerate unique values if the account is not being reset
        if (hasValue && !fusionAccount.needsReset) {
            const valueStr = String(existingValue)
            this.getUniqueValues(name).add(valueStr)
            if (definition.useIncrementalCounter) {
                await this.seedIncrementalCounterFromExistingValue(definition, valueStr)
            }
            return
        }

        // Don't regenerate Fusion identity attribute if the account is an existing identity
        if (hasValue && isFusionIdentityAttribute && isExistingIdentity) {
            this.getUniqueValues(name).add(String(fusionAccount.attributes[name]))
            return
        }

        // Set identity name for display attribute if the account is an identity
        if (fusionAccount.fromIdentity && isFusionDisplayAttribute) {
            const label = this.hostingIdentityDisplayLabel(fusionAccount)
            if (label) {
                this.log.info(`Setting identity name for attribute: ${name} for account: ${fusionAccount.name}`)
                fusionAccount.attributes[name] = label
            }
            return
        }

        const value = await this.generateUniqueAttributeValue(definition, fusionAccount, context)
        if (value === undefined) {
            // For identity-origin (baseline) accounts with managed accounts available,
            // retry generation with the first managed account as $account. This covers
            // the case where Fix 4 did not apply (e.g. no managed accounts at context
            // build time) or as a safety net when $account differs from $accounts[0].
            if (fusionAccount.fromIdentity) {
                const orderedAccounts = context.accounts as Record<string, any>[] | undefined
                if (orderedAccounts && orderedAccounts.length > 0 && context.account !== orderedAccounts[0]) {
                    const retryContext = { ...context, account: orderedAccounts[0] }
                    const retryValue = await this.generateUniqueAttributeValue(definition, fusionAccount, retryContext)
                    if (retryValue !== undefined) {
                        fusionAccount.attributes[name] = retryValue
                        context[name] = retryValue
                        return
                    }
                }
            }
            // Clear attribute when expression fails (e.g. unresolved variables)
            delete fusionAccount.attributes[name]
            delete context[name]
            return
        }
        fusionAccount.attributes[name] = value
        context[name] = value
    }

    private async seedIncrementalCounterFromExistingValue(definition: UniqueAttributeDefinition, value: string): Promise<void> {
        const match = value.match(/(\d+)\s*$/)
        if (!match) return
        const parsed = Number.parseInt(match[1], 10)
        if (!Number.isFinite(parsed) || parsed <= 0) return

        const stateWrapper = this.getStateWrapper()
        const key = definition.name
        const lockKey = `counter:${key}`
        await this.locks.withLock(lockKey, async () => {
            const current = stateWrapper.state.get(key)
            if (current === undefined) {
                const start = definition.counterStart ?? 1
                await stateWrapper.initCounter(key, start)
            }
            const nextCurrent = stateWrapper.state.get(key) ?? 0
            if (parsed > nextCurrent) {
                stateWrapper.state.set(key, parsed)
            }
        })
    }
}
