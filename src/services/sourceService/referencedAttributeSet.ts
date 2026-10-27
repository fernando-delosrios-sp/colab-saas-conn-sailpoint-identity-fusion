import { AccountV2025 as Account, IdentityDocument } from 'sailpoint-api-client'
import { FusionConfig } from '../../model/config'
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

/**
 * Attribute pruning: drops a managed source account's `attributes` entries that are not
 * in the referenced attribute set. Mutates in place (the account object is owned by the
 * fetch pipeline at registration time; client-layer recording captured a deep copy
 * upstream). Top-level system fields are never pruned.
 */
export function pruneManagedAccountAttributes(
    account: Account,
    referencedAttributeSet: ReadonlySet<string>
): Account {
    const attributes = account.attributes
    if (!attributes || typeof attributes !== 'object') return account
    for (const key of Object.keys(attributes)) {
        if (!referencedAttributeSet.has(key)) {
            delete (attributes as Record<string, unknown>)[key]
        }
    }
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
 * and managed sources. Retained account summaries are pruned to essential fields
 * (`id`, `nativeIdentity`, `name`, `disabled`, `source: { id, name }`).
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
        .map((account) => ({
            id: account.id,
            nativeIdentity: account.nativeIdentity,
            name: account.name,
            disabled: account.disabled,
            source: account.source
                ? {
                      id: account.source.id,
                      name: account.source.name,
                  }
                : undefined,
        }))

    return identity
}
