import { AccountV2025 as Account } from 'sailpoint-api-client'
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
