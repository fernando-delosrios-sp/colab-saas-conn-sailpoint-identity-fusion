export type SafeRecord = Record<string, unknown>

/** True for `null` or `undefined` only. */
export const isNullish = (value: unknown): value is null | undefined => value === null || value === undefined

/** Inverse of {@link isNullish}. */
export const isDefined = (value: unknown): boolean => !isNullish(value)

/**
 * Usable attribute / template value: not `null`/`undefined`, not `''` or whitespace-only strings.
 * Non-string scalars (`0`, `false`) and objects/arrays count as present (no trim).
 */
export function hasValue(value: string | null | undefined): value is string
export function hasValue(value: unknown): boolean
export function hasValue(value: unknown): boolean {
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return value.trim().length > 0
    return true
}

/** Inverse of {@link hasValue} — prefer `if (missing(x))` over `if (!hasValue(x))`. */
export const missing = (value: unknown): boolean => !hasValue(value)

/** `String(value).trim()` or `undefined` when {@link hasValue} is false / trim is empty. */
export const trimStr = (value: unknown): string | undefined => {
    if (missing(value)) return undefined
    const trimmed = typeof value === 'string' ? value.trim() : String(value).trim()
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
