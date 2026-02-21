export const getDateFromISOString = (isoString?: string | undefined | null): Date => {
    if (!isoString || isoString === '') return new Date(0)
    return new Date(Date.parse(isoString))
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
    reference: Date,
    thresholdMs = 0,
): boolean => {
    return getDateFromISOString(isoString).getTime() > reference.getTime() + thresholdMs
}
