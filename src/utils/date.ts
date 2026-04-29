export const getDateFromISOString = (isoString?: string | undefined | null): Date => {
    if (!isoString || isoString === '') return new Date(0)
    return new Date(Date.parse(isoString))
}

const toEpochMs = (value: string | Date | undefined | null): number => {
    if (value instanceof Date) return value.getTime()
    if (!value || value === '') return 0
    return Date.parse(value)
}

/**
 * Returns true when `isoString` parses to a date strictly after `reference`
 * (plus an optional threshold in milliseconds).
 *
 * Null / undefined / empty `isoString` values are treated as epoch-0, so they
 * will never be considered "newer" than a real reference date.
 */
export const isNewerThan = (
    isoString: string | undefined | null,
    reference: string | Date | undefined | null,
    thresholdMs = 0
): boolean => {
    return toEpochMs(isoString) > toEpochMs(reference) + thresholdMs
}
