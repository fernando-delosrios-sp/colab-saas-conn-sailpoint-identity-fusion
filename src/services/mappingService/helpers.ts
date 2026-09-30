import { Attributes } from '@sailpoint/connector-sdk'
import { AttributeMap, AttributeMergeMode, DefaultAttributeMergeMode } from '../../model/config'
import { hasValue, compact } from '../../utils/safeRead'
import { AttributeMappingConfig } from './types'

/** Merge result when Main/Origin designated snapshot was not loaded this invocation. */
export const DESIGNATED_SNAPSHOT_UNAVAILABLE = Symbol('designatedSnapshotUnavailable')

// ============================================================================
// Helper Functions
// ============================================================================

// Pre-compiled regex for better performance
const BRACKET_REGEX = /\[([^ ].*?)\]/g
const ORIGIN_SOURCE_TOKEN = '$originSource'

/**
 * Split attribute value that may contain bracketed values like [value1] [value2]
 * Optimized to use pre-compiled regex and matchAll for better performance
 */
export const attrSplit = (text: string): string[] => {
    if (!text) return []

    const set = new Set<string>()

    // Use matchAll for cleaner and potentially faster iteration
    const matches = text.matchAll(BRACKET_REGEX)
    for (const match of matches) {
        if (match[1]) {
            set.add(match[1])
        }
    }

    return set.size === 0 ? [text] : [...set]
}

/**
 * Concatenate array of strings into bracketed format: [value1] [value2]
 * Optimized to avoid unnecessary array operations and early return for empty lists
 *
 * @param list - Array of strings to concatenate
 * @param alreadyProcessed - If true, assumes list is already sorted with unique values (for performance)
 */
export const attrConcat = (list: string[]): string => {
    if (list.length === 0) {
        return ''
    }

    // If already sorted with unique values (e.g., from processAttributeMapping), skip redundant work
    const unique = Array.from(new Set(list))

    // Filter out empty strings to prevent empty brackets like "[] [Source]"
    return unique
        .filter((x) => x !== '')
        .map((x) => `[${x}]`)
        .sort()
        .join(' ')
}

/**
 * Process a single attribute from source accounts based on processing configuration
 */
export const processAttributeMapping = (
    config: AttributeMappingConfig,
    sourceAttributeMap: Map<string, Attributes[]>,
    sourceOrder: string[],
    prioritizedAccount?: Attributes,
    originSnapshot?: Attributes,
    priorMappedValues?: ReadonlyMap<string, unknown>
): any => {
    const { attributeMerge } = config

    if (attributeMerge === AttributeMergeMode.MainAccount || attributeMerge === AttributeMergeMode.OriginAccount) {
        const account =
            attributeMerge === AttributeMergeMode.MainAccount ? (prioritizedAccount ?? originSnapshot) : originSnapshot
        return resolveDesignatedSnapshot(account, config.lookupAttributeNames, priorMappedValues)
    }

    // Handle single-value merge strategies with early return
    if (
        attributeMerge === AttributeMergeMode.First ||
        attributeMerge === AttributeMergeMode.Source ||
        attributeMerge === undefined
    ) {
        return processSingleValueMerge(config, sourceAttributeMap, sourceOrder, prioritizedAccount, priorMappedValues)
    }

    // Handle multi-value merge strategies
    return processMultiValueMerge(config, sourceAttributeMap, sourceOrder, priorMappedValues)
}

/**
 * Process attribute mapping for single-value merge strategies ('first' or 'source')
 * Returns the first matching value found or undefined
 */
const processSingleValueMerge = (
    config: AttributeMappingConfig,
    sourceAttributeMap: Map<string, Attributes[]>,
    sourceOrder: string[],
    prioritizedAccount?: Attributes,
    priorMappedValues?: ReadonlyMap<string, unknown>
): any => {
    const { lookupAttributeNames, attributeMerge, source: specifiedSource } = config
    let prioritizedSource = ''

    if (prioritizedAccount) {
        const src = prioritizedAccount.source
        prioritizedSource =
            src && typeof src === 'object' && src !== null && 'name' in src
                ? String((src as { name?: unknown }).name ?? '')
                : String(prioritizedAccount._source ?? '')
    }
    const resolvedSource = specifiedSource === ORIGIN_SOURCE_TOKEN ? prioritizedSource : specifiedSource

    if (prioritizedAccount) {
        const canEvaluatePrioritized =
            attributeMerge !== AttributeMergeMode.Source || !resolvedSource || prioritizedSource === resolvedSource
        if (canEvaluatePrioritized) {
            const prioritizedValue = findFirstAttributeValue(
                [prioritizedAccount],
                lookupAttributeNames,
                priorMappedValues
            )
            if (prioritizedValue !== undefined) {
                return prioritizedValue
            }
        }
    }

    for (const sourceName of sourceOrder) {
        // For 'source' merge strategy, only process the specified source
        if (attributeMerge === AttributeMergeMode.Source && resolvedSource && sourceName !== resolvedSource) {
            continue
        }

        const accounts = sourceAttributeMap.get(sourceName)
        if (!accounts || accounts.length === 0) {
            continue
        }

        const firstValue = findFirstAttributeValue(accounts, lookupAttributeNames, priorMappedValues)
        if (firstValue !== undefined) {
            return firstValue
        }
    }

    return firstPriorMappedValue(lookupAttributeNames, priorMappedValues)
}

/**
 * Find the first attribute value from a list of accounts.
 * A lookup name with a prior mapped value is used as soon as that name is considered,
 * and that name is not read from the account.
 */
const findFirstAttributeValue = (
    accounts: Attributes[],
    attributeNames: string[],
    priorMappedValues?: ReadonlyMap<string, unknown>
): any => {
    for (const account of accounts) {
        for (const attribute of attributeNames) {
            if (priorMappedValues?.has(attribute)) {
                return priorMappedValues.get(attribute)
            }
            const value = account[attribute]
            if (hasValue(value)) {
                return value
            }
        }
    }
    return undefined
}

/**
 * Main account and Origin account: a prior mapped value is used even when the
 * designated snapshot is missing or lacks the name. With no prior mapped value,
 * a missing snapshot stays designated-snapshot-unavailable and a present snapshot
 * with no value stays empty.
 */
const resolveDesignatedSnapshot = (
    account: Attributes | undefined,
    attributeNames: string[],
    priorMappedValues?: ReadonlyMap<string, unknown>
): any => {
    for (const attribute of attributeNames) {
        if (priorMappedValues?.has(attribute)) {
            return priorMappedValues.get(attribute)
        }
        if (!account) continue
        const value = account[attribute]
        if (hasValue(value)) {
            return value
        }
    }
    if (!account) return DESIGNATED_SNAPSHOT_UNAVAILABLE
    return undefined
}

/** First prior mapped value in lookup-name order, when no snapshot account was visited. */
const firstPriorMappedValue = (attributeNames: string[], priorMappedValues?: ReadonlyMap<string, unknown>): any => {
    if (!priorMappedValues) return undefined
    for (const attribute of attributeNames) {
        if (priorMappedValues.has(attribute)) return priorMappedValues.get(attribute)
    }
    return undefined
}

/**
 * Process attribute mapping for multi-value merge strategies ('list' or 'concatenate')
 * Returns a list of unique sorted values or a concatenated string
 */
const processMultiValueMerge = (
    config: AttributeMappingConfig,
    sourceAttributeMap: Map<string, Attributes[]>,
    sourceOrder: string[],
    priorMappedValues?: ReadonlyMap<string, unknown>
): any => {
    const { lookupAttributeNames, attributeMerge } = config
    const allValues = collectAllAttributeValues(
        sourceAttributeMap,
        sourceOrder,
        lookupAttributeNames,
        priorMappedValues
    )
    const existingValues = compact(allValues)

    if (existingValues.length === 0) {
        return undefined
    }

    if (attributeMerge === AttributeMergeMode.List) {
        return allValues
    }

    // For Concatenate: flatten arrays one level so attrConcat receives string[]
    const flattened = existingValues.flatMap((v) => (Array.isArray(v) ? v : [v]))
    return attrConcat(flattened)
}

/**
 * Collect all attribute values from sources in order
 */
const collectAllAttributeValues = (
    sourceAttributeMap: Map<string, Attributes[]>,
    sourceOrder: string[],
    attributeNames: string[],
    priorMappedValues?: ReadonlyMap<string, unknown>
): any[] => {
    const usesPrior = Boolean(priorMappedValues && attributeNames.some((name) => priorMappedValues.has(name)))
    if (!usesPrior) {
        const allValues: any[] = []
        for (const sourceName of sourceOrder) {
            const accounts = sourceAttributeMap.get(sourceName)
            if (!accounts || accounts.length === 0) continue
            allValues.push(...extractValuesFromAccounts(accounts, attributeNames))
        }
        return allValues
    }

    const allValues: any[] = []
    const consumedPrior = new Set<string>()
    const includePriorOnce = (attribute: string): void => {
        if (!priorMappedValues?.has(attribute) || consumedPrior.has(attribute)) return
        allValues.push(priorMappedValues.get(attribute))
        consumedPrior.add(attribute)
    }

    for (const sourceName of sourceOrder) {
        const accounts = sourceAttributeMap.get(sourceName)
        if (!accounts || accounts.length === 0) continue
        for (const account of accounts) {
            for (const attribute of attributeNames) {
                if (priorMappedValues?.has(attribute)) {
                    includePriorOnce(attribute)
                    continue
                }
                const value = account[attribute]
                if (!hasValue(value)) continue
                if (Array.isArray(value)) allValues.push(...value)
                else allValues.push(value)
            }
        }
    }

    for (const attribute of attributeNames) includePriorOnce(attribute)
    return allValues
}

/**
 * Extract attribute values from a list of accounts.
 * - Strings are kept as-is (including incidental brackets in source data)
 * - Arrays are passed through as-is (flattening deferred to output stage)
 * - Non-array scalars are wrapped in an array
 */
const extractValuesFromAccounts = (accounts: Attributes[], attributeNames: string[]): any[] => {
    const values: any[] = []

    for (const account of accounts) {
        for (const attribute of attributeNames) {
            const value = account[attribute]
            if (hasValue(value)) {
                if (Array.isArray(value)) {
                    values.push(...value)
                } else {
                    values.push(value)
                }
            }
        }
    }

    return values
}

/**
 * Build processing configuration for an attribute by merging schema with attributeMaps
 */
export const buildAttributeMappingConfig = (
    attributeName: string,
    attributeMaps: AttributeMap[] | undefined,
    defaultAttributeMerge: DefaultAttributeMergeMode
): AttributeMappingConfig => {
    // Check if attribute has specific configuration in attributeMaps
    const attributeMap = attributeMaps?.find((am) => am.newAttribute === attributeName)

    if (attributeMap) {
        const sourceAttributes = attributeMap.existingAttributes || [attributeName]
        return {
            attributeName,
            sourceAttributes,
            lookupAttributeNames: Array.from(new Set([...sourceAttributes, attributeName])),
            attributeMerge: attributeMap.attributeMerge || defaultAttributeMerge,
            source: attributeMap.source,
        }
    } else {
        return {
            attributeName,
            sourceAttributes: [attributeName],
            lookupAttributeNames: [attributeName],
            attributeMerge: defaultAttributeMerge,
        }
    }
}
