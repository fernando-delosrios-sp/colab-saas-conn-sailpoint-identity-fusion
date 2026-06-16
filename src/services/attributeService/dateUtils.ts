/**
 * Lightweight date utility functions
 * Replaces date-fns (38MB) with native Date methods
 *
 * Provides common date functions for use in Velocity templates
 */

// Compile RegExp patterns once at module level for better performance
const TOKEN_PATTERNS: Record<string, RegExp> = {
    yyyy: /yyyy/g,
    yy: /yy/g,
    MM: /MM/g,
    M: /M/g,
    dd: /dd/g,
    d: /d/g,
    HH: /HH/g,
    H: /H/g,
    mm: /mm/g,
    m: /m/g,
    ss: /ss/g,
    s: /s/g,
}

/**
 * Format a date to ISO string
 */
export function format(date: Date | string | number, formatStr?: string): string {
    const d = new Date(date)

    if (isNaN(d.getTime())) {
        throw new Error('Invalid date')
    }

    // If no format string, return ISO
    if (!formatStr) {
        return d.toISOString()
    }

    // Simple format string support (common patterns only)
    const tokens: Record<string, string> = {
        yyyy: d.getFullYear().toString(),
        yy: d.getFullYear().toString().slice(-2),
        MM: String(d.getMonth() + 1).padStart(2, '0'),
        M: String(d.getMonth() + 1),
        dd: String(d.getDate()).padStart(2, '0'),
        d: String(d.getDate()),
        HH: String(d.getHours()).padStart(2, '0'),
        H: String(d.getHours()),
        mm: String(d.getMinutes()).padStart(2, '0'),
        m: String(d.getMinutes()),
        ss: String(d.getSeconds()).padStart(2, '0'),
        s: String(d.getSeconds()),
    }

    let result = formatStr
    // Use pre-compiled RegExp patterns for better performance
    for (const [token, value] of Object.entries(tokens)) {
        result = result.replace(TOKEN_PATTERNS[token], value)
    }

    return result
}

/**
 * Parse a date from various formats
 */
export function parse(dateStr: string | Date | number, formatStr?: string): Date {
    if (dateStr instanceof Date) {
        return new Date(dateStr)
    }

    if (typeof dateStr === 'number') {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) {
            throw new Error('Invalid date')
        }
        return d
    }

    if (typeof dateStr !== 'string') {
        throw new Error('Invalid date')
    }

    if (!formatStr) {
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) {
            throw new Error('Invalid date')
        }
        return d
    }

    // Escape regex characters in the format string
    const escapedFormat = formatStr.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&')

    // Supported date-fns token patterns (longest first to match correctly)
    const tokens = ['yyyy', 'yy', 'MM', 'M', 'dd', 'd', 'HH', 'H', 'mm', 'm', 'ss', 's']
    const tokenRegex = new RegExp(tokens.join('|'), 'g')
    const matchedTokens: string[] = []

    const pattern = escapedFormat.replace(tokenRegex, (match) => {
        matchedTokens.push(match)
        switch (match) {
            case 'yyyy': return '(\\d{4})'
            case 'yy': return '(\\d{2})'
            case 'MM': return '(\\d{2})'
            case 'M': return '(\\d{1,2})'
            case 'dd': return '(\\d{2})'
            case 'd': return '(\\d{1,2})'
            case 'HH': return '(\\d{2})'
            case 'H': return '(\\d{1,2})'
            case 'mm': return '(\\d{2})'
            case 'm': return '(\\d{1,2})'
            case 'ss': return '(\\d{2})'
            case 's': return '(\\d{1,2})'
            default: return match
        }
    })

    const regex = new RegExp(`^${pattern}$`)
    const match = dateStr.match(regex)
    if (!match) {
        throw new Error('Invalid date')
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

    for (let i = 0; i < matchedTokens.length; i++) {
        const token = matchedTokens[i]
        const val = parseInt(match[i + 1], 10)
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
    }

    if (monthSet && (month < 0 || month > 11)) throw new Error('Invalid date')
    if (daySet && (day < 1 || day > 31)) throw new Error('Invalid date')
    if (hourSet && (hour < 0 || hour > 23)) throw new Error('Invalid date')
    if (minuteSet && (minute < 0 || minute > 59)) throw new Error('Invalid date')
    if (secondSet && (second < 0 || second > 59)) throw new Error('Invalid date')

    const parsedDate = new Date(year, month, day, hour, minute, second)
    if (isNaN(parsedDate.getTime())) {
        throw new Error('Invalid date')
    }

    if (yearSet && parsedDate.getFullYear() !== year) throw new Error('Invalid date')
    if (monthSet && parsedDate.getMonth() !== month) throw new Error('Invalid date')
    if (daySet && parsedDate.getDate() !== day) throw new Error('Invalid date')

    return parsedDate
}

/**
 * Get year from date.
 * Uses UTC to avoid timezone shifts for midnight Z values.
 */
export function getYear(date: Date | string | number): number {
    const d = new Date(date)
    if (isNaN(d.getTime())) {
        throw new Error('Invalid date')
    }
    return d.getUTCFullYear()
}

/**
 * Add days to a date
 */
export function addDays(date: Date | string | number, days: number): Date {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
}

/**
 * Add months to a date
 */
export function addMonths(date: Date | string | number, months: number): Date {
    const d = new Date(date)
    d.setMonth(d.getMonth() + months)
    return d
}

/**
 * Add years to a date
 */
export function addYears(date: Date | string | number, years: number): Date {
    const d = new Date(date)
    d.setFullYear(d.getFullYear() + years)
    return d
}

/**
 * Subtract days from a date
 */
export function subDays(date: Date | string | number, days: number): Date {
    return addDays(date, -days)
}

/**
 * Subtract months from a date
 */
export function subMonths(date: Date | string | number, months: number): Date {
    return addMonths(date, -months)
}

/**
 * Subtract years from a date
 */
export function subYears(date: Date | string | number, years: number): Date {
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
 * Get the difference in days between two dates
 */
export function differenceInDays(dateLeft: Date | string | number, dateRight: Date | string | number): number {
    const left = new Date(dateLeft)
    const right = new Date(dateRight)
    const diff = left.getTime() - right.getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
}

/**
 * Get start of day
 */
export function startOfDay(date: Date | string | number): Date {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
}

/**
 * Get end of day
 */
export function endOfDay(date: Date | string | number): Date {
    const d = new Date(date)
    d.setHours(23, 59, 59, 999)
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
 * Parse ISO date string
 */
export function parseISO(date: string): Date | undefined {
    const d = new Date(date)
    if (isNaN(d.getTime())) {
        return
    }
    return d
}

/**
 * Export all functions as a namespace for Velocity context
 * This mimics the date-fns import pattern
 */
export const Datefns = {
    parseISO,
    format,
    parse,
    getYear,
    addDays,
    addMonths,
    addYears,
    subDays,
    subMonths,
    subYears,
    isBefore,
    isAfter,
    isEqual,
    differenceInDays,
    startOfDay,
    endOfDay,
    now,
    isValid,
}
