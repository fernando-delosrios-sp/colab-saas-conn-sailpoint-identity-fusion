import { readUnknown } from './safeRead'

/**
 * Attribute utility functions for picking, filtering, and transforming attributes.
 * Provides a consistent interface for attribute manipulation across services.
 */

// ============================================================================
// Types
// ============================================================================

export type AttributeValue = string | number | boolean | null | undefined | object | any[]

export interface AttributeBag {
    [key: string]: AttributeValue
}

// ============================================================================
// Attribute Picking
// ============================================================================

/**
 * Picks specific attributes from an object based on an attribute whitelist.
 * Handles both original case and lowercase first character for attribute names.
 *
 * @param attributes - Source attribute object
 * @param whitelist - Array of attribute names to pick
 * @returns Object containing only the picked attributes, or undefined if empty
 *
 * @example
 * pickAttributes({ firstName: 'John', lastName: 'Doe', age: 30 }, ['firstName', 'lastName'])
 * // Returns: { firstName: 'John', lastName: 'Doe' }
 */
export function pickAttributes(
    attributes: Record<string, any> | undefined,
    whitelist: string[] | undefined
): Record<string, any> | undefined {
    if (!attributes) return undefined
    if (!whitelist || whitelist.length === 0) return undefined

    const picked: Record<string, any> = {}

    for (const name of whitelist) {
        const value = getAttributeValue(attributes, name)
        if (isValidAttributeValue(value)) {
            picked[name] = value
        }
    }

    return Object.keys(picked).length > 0 ? picked : undefined
}

/**
 * Gets an attribute value by name, checking both original case and lowercase first character.
 * This handles the common pattern where attributes may be stored with different casings.
 *
 * @param attributes - Source attribute object
 * @param name - Attribute name to look up
 * @returns The attribute value or undefined
 */
export function getAttributeValue(attributes: Record<string, any>, name: string): any {
    // Try direct access first
    const direct = attributes[name]
    if (direct !== undefined) return direct

    // Try lowercase first character
    const lowerFirst = toLowerFirstChar(name)
    if (lowerFirst && lowerFirst !== name) {
        return attributes[lowerFirst]
    }

    return undefined
}

/**
 * Sets an attribute value on an object, using the provided name.
 * Optionally sets both original case and lowercase first character versions.
 *
 * @param attributes - Target attribute object
 * @param name - Attribute name
 * @param value - Value to set
 * @param setBothCases - If true, sets both original and lowercase first char versions
 */
export function setAttributeValue(
    attributes: Record<string, any>,
    name: string,
    value: any,
    setBothCases: boolean = false
): void {
    attributes[name] = value

    if (setBothCases) {
        const lowerFirst = toLowerFirstChar(name)
        if (lowerFirst && lowerFirst !== name) {
            attributes[lowerFirst] = value
        }
    }
}

/**
 * Checks if an attribute value is valid (not null, undefined, or empty string)
 */
export function isValidAttributeValue(value: any): boolean {
    return value !== undefined && value !== null && value !== ''
}

// ============================================================================
// String Transformations
// ============================================================================

/**
 * Converts the first character of a string to lowercase.
 * Returns the original string if empty or null.
 */
export function toLowerFirstChar(str: string | null | undefined): string {
    if (!str) return str ?? ''
    return str.charAt(0).toLowerCase() + str.slice(1)
}

/**
 * Converts the first character of a string to uppercase.
 * Returns the original string if empty or null.
 */
export function toUpperFirstChar(str: string | null | undefined): string {
    if (!str) return str ?? ''
    return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Alias for toUpperFirstChar - capitalizes the first letter of a string
 */
export const capitalizeFirst = toUpperFirstChar

// ============================================================================
// Attribute Merging
// ============================================================================

/**
 * Merges multiple attribute objects into one, with later objects taking precedence.
 * Only copies non-null, non-undefined values.
 */
export function mergeAttributes(...sources: (Record<string, any> | undefined)[]): Record<string, any> {
    const result: Record<string, any> = {}

    for (const source of sources) {
        if (!source) continue
        for (const [key, value] of Object.entries(source)) {
            if (value !== undefined && value !== null) {
                result[key] = value
            }
        }
    }

    return result
}

/**
 * Creates a shallow copy of attributes, optionally excluding specific keys.
 */
export function copyAttributes(attributes: Record<string, any>, exclude?: string[]): Record<string, any> {
    if (!exclude || exclude.length === 0) {
        return { ...attributes }
    }

    const excludeSet = new Set(exclude)
    const result: Record<string, any> = {}

    for (const [key, value] of Object.entries(attributes)) {
        if (!excludeSet.has(key)) {
            result[key] = value
        }
    }

    return result
}

// ============================================================================
// Attribute Extraction
// ============================================================================

/**
 * Extracts a string value from attributes, returning undefined if not a string.
 */
export function extractString(attributes: Record<string, any>, key: string): string | undefined {
    const value = getAttributeValue(attributes, key)
    return typeof value === 'string' ? value : undefined
}

/**
 * Extracts a string value from attributes with a fallback to a default value.
 */
export function extractStringOrDefault(attributes: Record<string, any>, key: string, defaultValue: string): string {
    return extractString(attributes, key) ?? defaultValue
}

/**
 * Extracts a boolean value from attributes, handling string representations.
 */
export function extractBoolean(attributes: Record<string, any>, key: string): boolean | undefined {
    const value = getAttributeValue(attributes, key)
    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
    return undefined
}

/**
 * Extracts a number value from attributes, handling string representations.
 */
export function extractNumber(attributes: Record<string, any>, key: string): number | undefined {
    const value = getAttributeValue(attributes, key)
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
        const parsed = parseFloat(value)
        return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
}

/**
 * Extracts an array value from attributes, returning an empty array if not an array.
 */
export function extractArray<T = any>(attributes: Record<string, any>, key: string): T[] {
    const value = getAttributeValue(attributes, key)
    return Array.isArray(value) ? value : []
}

/**
 * Converts an array attribute to a Set, handling null/undefined attributes gracefully.
 * Returns an empty Set if the attribute doesn't exist or is not an array.
 *
 * @param attributes - Source attribute object (can be null or undefined)
 * @param key - Attribute key to extract
 * @returns Set containing the array values, or empty Set if not found
 *
 * @example
 * toSetFromAttribute({ tags: ['a', 'b', 'c'] }, 'tags')
 * // Returns: Set(['a', 'b', 'c'])
 *
 * toSetFromAttribute(null, 'tags')
 * // Returns: Set()
 */
export function toSetFromAttribute(attributes: Record<string, any> | null | undefined, key: string): Set<string> {
    const raw = attributes?.[key]
    const arr = Array.isArray(raw) ? raw : []

    // Normalize common ISC representations:
    // - string[] (plain multi-valued attributes)
    // - { id: string }[] (entitlement references often come back as objects)
    // - { value: string }[] / { name: string }[] (other SDK shapes)
    const normalized: string[] = []
    for (const item of arr) {
        if (item == null) continue
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
            normalized.push(String(item))
            continue
        }
        if (typeof item === 'object') {
            const id = readUnknown(item, 'id')
            const value = readUnknown(item, 'value')
            const name = readUnknown(item, 'name')
            const pick = id ?? value ?? name
            if (pick != null && pick !== '') {
                normalized.push(String(pick))
            }
        }
    }

    return new Set(normalized)
}

/**
 * For multi-valued schema attributes: interpret a scalar or nested strings as multiple elements.
 * - Comma- and newline-separated lists: `"a, b"`, `"a\\nb"`
 * - JSON arrays: `'[{"key":"a"},{"key":"b"}]'` → stringified object elements; primitives stay typed for casting
 */
export function coerceMultiValuedAttributeInput(value: unknown): unknown[] {
    if (value === null || value === undefined) {
        return []
    }
    if (Array.isArray(value)) {
        const out: unknown[] = []
        for (const item of value) {
            if (typeof item === 'string') {
                out.push(...coerceStringToMultiValuedElements(item))
            } else {
                out.push(item)
            }
        }
        return out
    }
    if (typeof value === 'string') {
        return coerceStringToMultiValuedElements(value)
    }
    return [value]
}

function tryParseJsonArrayString(s: string): unknown[] | null {
    const t = s.trim()
    if (!t.startsWith('[')) {
        return null
    }
    try {
        const parsed = JSON.parse(t) as unknown
        return Array.isArray(parsed) ? parsed : null
    } catch {
        return null
    }
}

function splitCommaOrNewlineList(s: string): string[] {
    return s
        .split(/\r\n|\n|\r|,/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
}

function coerceStringToMultiValuedElements(s: string): unknown[] {
    const fromJson = tryParseJsonArrayString(s)
    if (fromJson) {
        return fromJson.map((el) =>
            el !== null && typeof el === 'object' ? JSON.stringify(el) : el
        )
    }
    const split = splitCommaOrNewlineList(s)
    return split.length > 0 ? split : [s]
}

/**
 * Normalizes `actions` (or similar multi-valued entitlement input) from account create payloads.
 * ISC may send a single string (e.g. `"report"`) instead of `["report"]`; spreading a string
 * into an array would yield per-character tokens and break action dispatch.
 */
export function normalizeActionTokens(raw: unknown): string[] {
    if (raw == null || raw === '') return []
    if (Array.isArray(raw)) {
        const out: string[] = []
        for (const item of raw) {
            if (item == null || item === '') continue
            if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
                out.push(String(item))
                continue
            }
            if (typeof item === 'object') {
                const id = readUnknown(item, 'id')
                const value = readUnknown(item, 'value')
                const name = readUnknown(item, 'name')
                const pick = id ?? value ?? name
                if (pick != null && pick !== '') out.push(String(pick))
            }
        }
        return out
    }
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        return [String(raw)]
    }
    if (typeof raw === 'object') {
        const id = readUnknown(raw, 'id')
        const value = readUnknown(raw, 'value')
        const name = readUnknown(raw, 'name')
        const pick = id ?? value ?? name
        return pick != null && pick !== '' ? [String(pick)] : []
    }
    return []
}

// ============================================================================
// Identity/Account Attribute Helpers
// ============================================================================

/**
 * Gets the display name from an object with common display name properties.
 * Checks: displayName, display_name, name in that order.
 */
export function getDisplayName(obj: Record<string, any> | undefined): string | undefined {
    if (!obj) return undefined
    return (obj.displayName ?? obj.display_name ?? obj.name) as string | undefined
}

/**
 * Gets the first valid value from multiple potential attribute keys.
 * Useful for fallback patterns like: email || mail || emailAddress
 */
export function getFirstValidAttribute(attributes: Record<string, any>, ...keys: string[]): any {
    for (const key of keys) {
        const value = getAttributeValue(attributes, key)
        if (isValidAttributeValue(value)) {
            return value
        }
    }
    return undefined
}

/**
 * Builds an account identifier string from various possible sources.
 * Tries multiple attributes in order of preference.
 */
export function buildAccountIdentifier(
    managedAccountId?: string,
    nativeIdentity?: string,
    attributes?: Record<string, any>,
    identityId?: string,
    fallback: string = 'unknown'
): string {
    return (
        trimOrUndefined(managedAccountId) ??
        trimOrUndefined(nativeIdentity) ??
        trimOrUndefined(attributes?.id) ??
        trimOrUndefined(attributes?.uuid) ??
        trimOrUndefined(identityId) ??
        fallback
    )
}

/**
 * Trims a string and returns undefined if empty.
 */
function trimOrUndefined(value: string | null | undefined): string | undefined {
    if (!value) return undefined
    const trimmed = String(value).trim()
    return trimmed.length > 0 ? trimmed : undefined
}
