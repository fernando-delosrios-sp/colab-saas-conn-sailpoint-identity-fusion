import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionConfig } from '../../model/config'
import { readLinkedAccountNativeIdentity } from '../../model/managedAccountKey'
import { fusionAccountSchemaAttributes } from '../../data/schema'

/**
 * Referenced attribute set: the run-scoped union of managed source account attribute
 * names that the connector can read, used by attribute pruning at Bulk ingest.
 *
 * Composition (deliberately conservative — over-keeping is safe, under-keeping is not):
 * - Fusion schema attribute names (implicit Map merge targets and output schema)
 * - Base Fusion schema attribute names (`fusionAccountSchemaAttributes`)
 * - `attributeMaps[].existingAttributes` (Map inputs)
 * - Attribute names textually referenced in Normal/Unique definition and custom-match
 *   Velocity templates (dot, bracket, and quoted reference styles)
 * - `matchingConfigs[].attribute` (match rule attributes)
 *
 * Velocity templates that compute attribute names dynamically (e.g. `$account[$name]`)
 * cannot be detected statically and are unsupported under pruning.
 */

const QUOTED_REFERENCE = /'([^'\\]*)'|"([^"\\]*)"/g
const DOT_PROPERTY = /\.([A-Za-z_$][A-Za-z0-9_$]*)/g
const ROOT_REFERENCE = /\$\{?([A-Za-z_][A-Za-z0-9_]*)/g

function extractTemplateReferences(expression: string | undefined, into: Set<string>): void {
    if (!expression) return
    for (const pattern of [QUOTED_REFERENCE, DOT_PROPERTY, ROOT_REFERENCE]) {
        pattern.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = pattern.exec(expression)) !== null) {
            const value = match[1] ?? match[2]
            if (value) into.add(value)
        }
    }
}

/**
 * Computes the referenced attribute set for a run. Call once per run after the Fusion
 * account schema is loaded.
 */
export function buildReferencedAttributeSet(
    config: FusionConfig,
    fusionSchemaAttributeNames: string[]
): Set<string> {
    const set = new Set<string>()

    for (const name of fusionSchemaAttributeNames) {
        if (name) set.add(name)
    }
    for (const schemaAttribute of fusionAccountSchemaAttributes) {
        if (schemaAttribute.name) set.add(schemaAttribute.name)
    }
    for (const attributeMap of config.attributeMaps ?? []) {
        for (const name of attributeMap.existingAttributes ?? []) {
            if (name) set.add(name)
        }
    }
    for (const matchingConfig of config.matchingConfigs ?? []) {
        if (matchingConfig.attribute) set.add(matchingConfig.attribute)
        extractTemplateReferences(matchingConfig.customVelocityExpression, set)
    }
    for (const definition of config.normalAttributeDefinitions ?? []) {
        extractTemplateReferences(definition.expression, set)
    }
    for (const definition of config.uniqueAttributeDefinitions ?? []) {
        extractTemplateReferences(definition.expression, set)
    }

    return set
}

/** Distinct short string values remembered per attribute key so repeated values share one string. */
const PRUNED_ATTRIBUTE_INTERN_LIMIT = 4096
/** Maximum string length eligible for interning. */
const PRUNED_ATTRIBUTE_INTERN_MAX_LENGTH = 128
/** Cap on distinct compiled attribute-shape factories per referenced attribute set. */
const PRUNED_ATTRIBUTE_SHAPE_LIMIT = 64

type AttributeBagPruner = (attributes: Record<string, unknown>) => Record<string, unknown>

const prunerByReferencedSet = new WeakMap<ReadonlySet<string>, AttributeBagPruner>()

function createAttributeBagPruner(referencedAttributeSet: ReadonlySet<string>): AttributeBagPruner {
    const shapeFactories = new Map<string, (values: unknown[]) => Record<string, unknown>>()
    const internPools = new Map<string, Map<string, string>>()

    const internValue = (key: string, value: unknown): unknown => {
        if (typeof value !== 'string' || value.length > PRUNED_ATTRIBUTE_INTERN_MAX_LENGTH) {
            return value
        }
        let pool = internPools.get(key)
        if (!pool) {
            pool = new Map()
            internPools.set(key, pool)
        }
        const shared = pool.get(value)
        if (shared !== undefined) return shared
        if (pool.size < PRUNED_ATTRIBUTE_INTERN_LIMIT) {
            pool.set(value, value)
        }
        return value
    }

    const getShapeFactory = (keys: string[]): ((values: unknown[]) => Record<string, unknown>) | undefined => {
        const signature = keys.join('\0')
        const cached = shapeFactories.get(signature)
        if (cached) return cached
        if (shapeFactories.size >= PRUNED_ATTRIBUTE_SHAPE_LIMIT) return undefined
        if (keys.some((key) => key === '__proto__')) return undefined
        const literalBody = keys.map((key, idx) => `${JSON.stringify(key)}: values[${idx}]`).join(',')
        const factory = new Function('values', `return {${literalBody}}`) as (
            values: unknown[]
        ) => Record<string, unknown>
        shapeFactories.set(signature, factory)
        return factory
    }

    return (attributes: Record<string, unknown>): Record<string, unknown> => {
        const keptKeys: string[] = []
        let hasUnreferenced = false
        for (const key in attributes) {
            if (!Object.prototype.hasOwnProperty.call(attributes, key)) continue
            if (referencedAttributeSet.has(key)) {
                keptKeys.push(key)
            } else {
                hasUnreferenced = true
            }
        }
        if (!hasUnreferenced) return attributes

        const factory = getShapeFactory(keptKeys)
        if (factory) {
            const values = new Array<unknown>(keptKeys.length)
            for (let i = 0; i < keptKeys.length; i++) {
                const key = keptKeys[i]
                values[i] = internValue(key, attributes[key])
            }
            return factory(values)
        }

        const prunedAttributes: Record<string, unknown> = {}
        for (let i = 0; i < keptKeys.length; i++) {
            const key = keptKeys[i]
            const value = internValue(key, attributes[key])
            if (key === '__proto__') {
                Object.defineProperty(prunedAttributes, key, {
                    value,
                    enumerable: true,
                    writable: true,
                    configurable: true,
                })
            } else {
                prunedAttributes[key] = value
            }
        }
        return prunedAttributes
    }
}

function getAttributeBagPruner(referencedAttributeSet: ReadonlySet<string>): AttributeBagPruner {
    let pruner = prunerByReferencedSet.get(referencedAttributeSet)
    if (!pruner) {
        pruner = createAttributeBagPruner(referencedAttributeSet)
        prunerByReferencedSet.set(referencedAttributeSet, pruner)
    }
    return pruner
}

/**
 * Attribute pruning: drops a managed source account's `attributes` entries that are not
 * in the referenced attribute set. Replaces the account's attribute bag using a shared
 * object-literal hidden class rather than keyed stores or in-place deletes, so large API
 * response objects can be collected without turning bags into high-overhead dictionary-mode
 * objects. Top-level system fields are never pruned here.
 */
export function pruneManagedAccountAttributes(
    account: Account,
    referencedAttributeSet: ReadonlySet<string>
): Account {
    const attributes = account.attributes
    if (!attributes || typeof attributes !== 'object') return account
    const pruner = getAttributeBagPruner(referencedAttributeSet)
    account.attributes = pruner(attributes as Record<string, unknown>)
    return account
}

/**
 * Core identity attribute keys that are always preserved during Identity Document Pruning,
 * regardless of whether they appear in the referenced attribute set.
 */
export const CORE_IDENTITY_ATTRIBUTES: ReadonlySet<string> = new Set([
    'displayName',
    'email',
    'name',
    'id',
    'firstname',
    'lastname',
    'firstName',
    'lastName',
    'uid',
    'cloudLifecycleState',
])

/**
 * Attribute pruning for identity documents: drops unreferenced attributes from
 * `identity.attributes` upon page arrival. Preserves core identity fields and any
 * attribute present in `referencedAttributeSet`. Mutates in place.
 */
export function pruneIdentityDocumentAttributes(
    identity: IdentityDocument,
    referencedAttributeSet?: ReadonlySet<string>
): IdentityDocument {
    const attributes = identity.attributes
    if (!attributes || typeof attributes !== 'object') return identity
    if (!referencedAttributeSet) return identity

    for (const key of Object.keys(attributes)) {
        if (!CORE_IDENTITY_ATTRIBUTES.has(key) && !referencedAttributeSet.has(key)) {
            delete (attributes as Record<string, unknown>)[key]
        }
    }
    return identity
}

export interface FilterIdentityAccountsOptions {
    fusionSourceId?: string
    managedSourceNames?: ReadonlySet<string>
}

/**
 * Filters `identity.accounts` to retain only accounts belonging to configured Fusion
 * and managed sources. Retained account summaries keep the fields later blend and
 * rebuild read: `id`, `nativeIdentity`, `accountId`, `name`, `disabled`, and
 * `source: { id, name }`. Identity search puts the source native identity on
 * `accountId`; that value is copied onto both fields so neither reader misses it.
 * Mutates in place.
 */
export function filterIdentityAccounts(
    identity: IdentityDocument,
    options: FilterIdentityAccountsOptions = {}
): IdentityDocument {
    if (!identity.accounts || !Array.isArray(identity.accounts)) return identity

    const { fusionSourceId, managedSourceNames } = options

    identity.accounts = (identity.accounts as any[])
        .filter((account) => {
            if (!account) return false
            const sourceId = account.source?.id
            const sourceName = account.source?.name
            const isFusion = Boolean(fusionSourceId && sourceId === fusionSourceId)
            const isManaged = Boolean(sourceName && managedSourceNames?.has(sourceName))
            return isFusion || isManaged
        })
        .map((account) => {
            const nativeIdentity = readLinkedAccountNativeIdentity(account)
            return {
                id: account.id,
                nativeIdentity,
                accountId: nativeIdentity,
                name: account.name,
                disabled: account.disabled,
                source: account.source
                    ? {
                          id: account.source.id,
                          name: account.source.name,
                      }
                    : undefined,
            }
        })

    return identity
}
