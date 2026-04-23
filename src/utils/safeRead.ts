export type SafeRecord = Record<string, unknown>

/** True for `null` or `undefined` only. */
export const isNullish = (value: unknown): value is null | undefined => value === null || value === undefined

/** Inverse of {@link isNullish}. */
export const isDefined = (value: unknown): boolean => !isNullish(value)

/** True when `value` is `null`, `undefined`, or `''` (common “missing token” guard before `String(value)`). */
export const isNullishOrEmptyString = (value: unknown): boolean => value == null || value === ''

/**
 * Attribute-bag style presence: not `undefined`, not `null`, and not `''`.
 * Numbers (including `0`) and booleans (including `false`) count as present.
 */
export const hasPresentAttributeValue = (value: unknown): boolean =>
    value !== undefined && value !== null && value !== ''

/** Trims with `String()`; returns `undefined` for nullish inputs or whitespace-only results. */
export const trimStringIfNonEmpty = (value: unknown): string | undefined => {
    if (value == null) return undefined
    const trimmed = String(value).trim()
    return trimmed.length > 0 ? trimmed : undefined
}

export const isRecord = (value: unknown): value is SafeRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

export const asRecord = (value: unknown): SafeRecord | undefined => (isRecord(value) ? value : undefined)

export const readUnknown = (source: unknown, key: string): unknown => {
    const record = asRecord(source)
    return record ? record[key] : undefined
}

export const readPathUnknown = (source: unknown, path: string[]): unknown => {
    let current: unknown = source
    for (const segment of path) {
        current = readUnknown(current, segment)
        if (current === undefined) return undefined
    }
    return current
}

export function readString(source: unknown, key: string): string | undefined
export function readString(source: unknown, key: string, fallback: string): string
export function readString(source: unknown, key: string, fallback?: string): string | undefined {
    const value = readUnknown(source, key)
    return typeof value === 'string' ? value : fallback
}

export function readNumber(source: unknown, key: string): number | undefined
export function readNumber(source: unknown, key: string, fallback: number): number
export function readNumber(source: unknown, key: string, fallback?: number): number | undefined {
    const value = readUnknown(source, key)
    return typeof value === 'number' ? value : fallback
}

export function readBoolean(source: unknown, key: string): boolean | undefined
export function readBoolean(source: unknown, key: string, fallback: boolean): boolean
export function readBoolean(source: unknown, key: string, fallback?: boolean): boolean | undefined {
    const value = readUnknown(source, key)
    return typeof value === 'boolean' ? value : fallback
}

export function readArray<T = unknown>(source: unknown, key: string): T[] | undefined
export function readArray<T = unknown>(source: unknown, key: string, fallback: T[]): T[]
export function readArray<T = unknown>(source: unknown, key: string, fallback?: T[]): T[] | undefined {
    const value = readUnknown(source, key)
    return Array.isArray(value) ? (value as T[]) : fallback
}

export function readPathString(source: unknown, path: string[]): string | undefined
export function readPathString(source: unknown, path: string[], fallback: string): string
export function readPathString(source: unknown, path: string[], fallback?: string): string | undefined {
    const value = readPathUnknown(source, path)
    return typeof value === 'string' ? value : fallback
}

export function readPathNumber(source: unknown, path: string[]): number | undefined
export function readPathNumber(source: unknown, path: string[], fallback: number): number
export function readPathNumber(source: unknown, path: string[], fallback?: number): number | undefined {
    const value = readPathUnknown(source, path)
    return typeof value === 'number' ? value : fallback
}
