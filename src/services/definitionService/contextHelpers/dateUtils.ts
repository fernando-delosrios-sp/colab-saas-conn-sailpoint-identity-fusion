/**
 * Lightweight date utility functions
 * Replaces date-fns (38MB) with native Date methods
 *
 * Provides common date functions for use in Velocity templates
 */

import { withVelocityHelperFallback } from './velocityFallback'

const FORMAT_TOKEN_REGEX = /yyyy|yy|MM|M|dd|d|HH|H|mm|m|ss|s|XXX|ZZZ|xxx|XX|ZZ|xx|X|Z|x/g

const parseTimezoneOffset = (offsetStr: string): number => {
    if (!offsetStr || offsetStr.toUpperCase() === 'Z') {
        return 0
    }
    const match = offsetStr.match(/^([+-])(\d{2}):?(\d{2})?$/)
    if (!match) {
        return 0
    }
    const sign = match[1] === '-' ? -1 : 1
    const hours = parseInt(match[2], 10)
    const minutes = match[3] ? parseInt(match[3], 10) : 0
    return sign * (hours * 60 + minutes)
}

/**
 * Format a date to ISO string
 */
export function format(date: Date | string | number, formatStr?: string): string | undefined {
    const d = new Date(date)

    if (isNaN(d.getTime())) {
        return undefined
    }

    // If no format string, return ISO
    if (!formatStr) {
        return d.toISOString()
    }

    // Simple format string support (common patterns only)
    const tokens: Record<string, string> = {
        yyyy: d.getUTCFullYear().toString(),
        yy: d.getUTCFullYear().toString().slice(-2),
        MM: String(d.getUTCMonth() + 1).padStart(2, '0'),
        M: String(d.getUTCMonth() + 1),
        dd: String(d.getUTCDate()).padStart(2, '0'),
        d: String(d.getUTCDate()),
        HH: String(d.getUTCHours()).padStart(2, '0'),
        H: String(d.getUTCHours()),
        mm: String(d.getUTCMinutes()).padStart(2, '0'),
        m: String(d.getUTCMinutes()),
        ss: String(d.getUTCSeconds()).padStart(2, '0'),
        s: String(d.getUTCSeconds()),
        XXX: 'Z',
        ZZZ: '+0000',
        xxx: '+00:00',
        XX: 'Z',
        ZZ: '+0000',
        xx: '+0000',
        X: 'Z',
        Z: '+0000',
        x: '+00',
    }

    let result = formatStr.replace(FORMAT_TOKEN_REGEX, (match) => {
        return tokens[match] ?? match
    })

    // Remove single quotes used for escaping literal text (e.g. 'T')
    result = result.replace(/'/g, '')

    return result
}

/**
 * Parse a date from various formats
 */

const FORMAT_TOKENS = [
    'yyyy', 'yy', 'MM', 'M', 'dd', 'd', 'HH', 'H', 'mm', 'm', 'ss', 's',
    'XXX', 'ZZZ', 'xxx', 'XX', 'ZZ', 'xx', 'X', 'Z', 'x',
]

function tokenToRegexPattern(match: string): string {
    switch (match) {
        case 'yyyy':
            return '(\\d{4})'
        case 'yy':
            return '(\\d{2})'
        case 'MM':
            return '(\\d{2})'
        case 'M':
            return '(\\d{1,2})'
        case 'dd':
            return '(\\d{2})'
        case 'd':
            return '(\\d{1,2})'
        case 'HH':
            return '(\\d{2})'
        case 'H':
            return '(\\d{1,2})'
        case 'mm':
            return '(\\d{2})'
        case 'm':
            return '(\\d{1,2})'
        case 'ss':
            return '(\\d{2})'
        case 's':
            return '(\\d{1,2})'
        case 'XXX':
        case 'ZZZ':
        case 'xxx':
        case 'XX':
        case 'ZZ':
        case 'xx':
        case 'X':
        case 'Z':
        case 'x':
            return '(Z|[+-]\\d{2}(?::?\\d{2})?)'
        default:
            return match
    }
}

function buildFormatRegex(formatStr: string): { regex: RegExp; matchedTokens: string[] } {
    const escapedFormat = formatStr.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&').replace(/'/g, '')
    const matchedTokens: string[] = []
    const tokenRegex = new RegExp(FORMAT_TOKENS.join('|'), 'g')
    const pattern = escapedFormat.replace(tokenRegex, (match) => {
        matchedTokens.push(match)
        return tokenToRegexPattern(match)
    })
    return { regex: new RegExp(`^${pattern}$`), matchedTokens }
}

const formatRegexCache = new Map<string, { regex: RegExp; matchedTokens: string[] }>()

export function getCachedFormatRegex(formatStr: string): { regex: RegExp; matchedTokens: string[] } {
    const cached = formatRegexCache.get(formatStr)
    if (cached) {
        return cached
    }
    const compiled = buildFormatRegex(formatStr)
    formatRegexCache.set(formatStr, compiled)
    return compiled
}

function parsePrimitiveDateInput(dateStr: string | Date | number, formatStr?: string): Date | undefined {
    if (dateStr instanceof Date) {
        return new Date(dateStr)
    }

    if (typeof dateStr === 'number') {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) {
            return undefined
        }
        return d
    }

    if (typeof dateStr !== 'string') {
        return undefined
    }

    if (!formatStr) {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) {
            return undefined
        }
        return d
    }

    return undefined
}

function applyTimezoneOffset(parsedDate: Date, timezoneOffsetMinutes: number): Date {
    parsedDate.setUTCMinutes(parsedDate.getUTCMinutes() - timezoneOffsetMinutes)
    return parsedDate
}

function parseWithFormat(dateStr: string, formatStr: string): Date | undefined {
    const { regex, matchedTokens } = getCachedFormatRegex(formatStr)
    const match = dateStr.match(regex)
    if (!match) {
        return undefined
    }

    let year = 1970
    let month = 0
    let day = 1
    let hour = 0
    let minute = 0
    let second = 0

    let yearSet = false
    let monthSet = false
    let daySet = false
    let hourSet = false
    let minuteSet = false
    let secondSet = false

    let timezoneOffsetMinutes = 0
    let hasTimezone = false

    for (let i = 0; i < matchedTokens.length; i++) {
        const token = matchedTokens[i]
        const rawVal = match[i + 1]

        if (['yyyy', 'yy', 'MM', 'M', 'dd', 'd', 'HH', 'H', 'mm', 'm', 'ss', 's'].includes(token)) {
            const val = parseInt(rawVal, 10)
            switch (token) {
                case 'yyyy':
                    year = val
                    yearSet = true
                    break
                case 'yy':
                    year = val >= 50 ? 1900 + val : 2000 + val
                    yearSet = true
                    break
                case 'MM':
                case 'M':
                    month = val - 1
                    monthSet = true
                    break
                case 'dd':
                case 'd':
                    day = val
                    daySet = true
                    break
                case 'HH':
                case 'H':
                    hour = val
                    hourSet = true
                    break
                case 'mm':
                case 'm':
                    minute = val
                    minuteSet = true
                    break
                case 'ss':
                case 's':
                    second = val
                    secondSet = true
                    break
            }
        } else {
            timezoneOffsetMinutes = parseTimezoneOffset(rawVal)
            hasTimezone = true
        }
    }

    if (monthSet && (month < 0 || month > 11)) return undefined
    if (daySet && (day < 1 || day > 31)) return undefined
    if (hourSet && (hour < 0 || hour > 23)) return undefined
    if (minuteSet && (minute < 0 || minute > 59)) return undefined
    if (secondSet && (second < 0 || second > 59)) return undefined

    const parsedDate = new Date(Date.UTC(year, month, day, hour, minute, second))
    if (isNaN(parsedDate.getTime())) {
        return undefined
    }

    if (yearSet && parsedDate.getUTCFullYear() !== year) return undefined
    if (monthSet && parsedDate.getUTCMonth() !== month) return undefined
    if (daySet && parsedDate.getUTCDate() !== day) return undefined

    if (hasTimezone) {
        return applyTimezoneOffset(parsedDate, timezoneOffsetMinutes)
    }

    return parsedDate
}

export function parse(dateStr: string | Date | number, formatStr?: string): Date | undefined {
    const primitive = parsePrimitiveDateInput(dateStr, formatStr)
    if (primitive !== undefined || typeof dateStr !== 'string' || !formatStr) {
        return primitive
    }

    return parseWithFormat(dateStr, formatStr)
}

/**
 * Parse an ISO-8601 date string.
 * Kept for compatibility with date-fns style usage in Velocity templates.
 */
function parseISO(dateStr: string | Date | number): Date | undefined {
    return parse(dateStr)
}

/**
 * Get year from date.
 * Uses UTC to avoid timezone shifts for midnight Z values.
 */
function getYear(date: Date | string | number): number | undefined {
    const d = new Date(date)
    if (isNaN(d.getTime())) {
        return undefined
    }
    return d.getUTCFullYear()
}

/**
 * Add days to a date (UTC)
 */
export function addDays(date: Date | string | number, days: number): Date | undefined {
    const d = new Date(date)
    if (isNaN(d.getTime())) {
        return undefined
    }
    d.setUTCDate(d.getUTCDate() + days)
    return d
}

/**
 * Add months to a date (UTC)
 */
export function addMonths(date: Date | string | number, months: number): Date | undefined {
    const d = new Date(date)
    if (isNaN(d.getTime())) {
        return undefined
    }
    d.setUTCMonth(d.getUTCMonth() + months)
    return d
}

/**
 * Add years to a date (UTC)
 */
export function addYears(date: Date | string | number, years: number): Date | undefined {
    const d = new Date(date)
    if (isNaN(d.getTime())) {
        return undefined
    }
    d.setUTCFullYear(d.getUTCFullYear() + years)
    return d
}

/**
 * Subtract days from a date
 */
export function subDays(date: Date | string | number, days: number): Date | undefined {
    return addDays(date, -days)
}

/**
 * Subtract months from a date
 */
export function subMonths(date: Date | string | number, months: number): Date | undefined {
    return addMonths(date, -months)
}

/**
 * Subtract years from a date
 */
export function subYears(date: Date | string | number, years: number): Date | undefined {
    return addYears(date, -years)
}

/**
 * Check if date is before another date
 */
export function isBefore(date: Date | string | number, dateToCompare: Date | string | number): boolean {
    return new Date(date).getTime() < new Date(dateToCompare).getTime()
}

/**
 * Check if date is after another date
 */
export function isAfter(date: Date | string | number, dateToCompare: Date | string | number): boolean {
    return new Date(date).getTime() > new Date(dateToCompare).getTime()
}

/**
 * Check if dates are equal
 */
export function isEqual(date: Date | string | number, dateToCompare: Date | string | number): boolean {
    return new Date(date).getTime() === new Date(dateToCompare).getTime()
}

/**
 * Get the difference in calendar days between two dates (UTC)
 */
export function differenceInDays(dateLeft: Date | string | number, dateRight: Date | string | number): number | undefined {
    const leftStart = startOfDay(dateLeft)
    const rightStart = startOfDay(dateRight)
    if (!leftStart || !rightStart) {
        return undefined
    }
    const diff = leftStart.getTime() - rightStart.getTime()
    return Math.round(diff / (1000 * 60 * 60 * 24))
}

/**
 * Get start of day (UTC)
 */
export function startOfDay(date: Date | string | number): Date | undefined {
    const d = new Date(date)
    if (isNaN(d.getTime())) {
        return undefined
    }
    d.setUTCHours(0, 0, 0, 0)
    return d
}

/**
 * Get end of day (UTC)
 */
export function endOfDay(date: Date | string | number): Date | undefined {
    const d = new Date(date)
    if (isNaN(d.getTime())) {
        return undefined
    }
    d.setUTCHours(23, 59, 59, 999)
    return d
}

/**
 * Get current date/time
 */
export function now(): Date {
    return new Date()
}

/**
 * Check if a date is valid
 */
export function isValid(date: any): boolean {
    const d = new Date(date)
    return !isNaN(d.getTime())
}

/**
 * Export all functions as a namespace for Velocity context
 * This mimics the date-fns import pattern
 */
export const Datefns = {
    format: withVelocityHelperFallback('Datefns.format', format),
    parse: withVelocityHelperFallback('Datefns.parse', parse),
    parseISO: withVelocityHelperFallback('Datefns.parseISO', parseISO),
    getYear: withVelocityHelperFallback('Datefns.getYear', getYear),
    addDays: withVelocityHelperFallback('Datefns.addDays', addDays),
    addMonths: withVelocityHelperFallback('Datefns.addMonths', addMonths),
    addYears: withVelocityHelperFallback('Datefns.addYears', addYears),
    subDays: withVelocityHelperFallback('Datefns.subDays', subDays),
    subMonths: withVelocityHelperFallback('Datefns.subMonths', subMonths),
    subYears: withVelocityHelperFallback('Datefns.subYears', subYears),
    isBefore,
    isAfter,
    isEqual,
    differenceInDays: withVelocityHelperFallback('Datefns.differenceInDays', differenceInDays),
    startOfDay: withVelocityHelperFallback('Datefns.startOfDay', startOfDay),
    endOfDay: withVelocityHelperFallback('Datefns.endOfDay', endOfDay),
    now,
    isValid,
}

