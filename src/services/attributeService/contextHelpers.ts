import { logger } from '@sailpoint/connector-sdk'
import { Datefns } from './dateUtils'
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js'
import { State, City } from './geoData'
// @ts-expect-error - no types available
import parseAddressString from 'parse-address-string'
import { capitalizeFirst } from '../../utils'

/** Lowercase name particles treated as non-capitalised in proper-case formatting. */
const NAME_PARTICLES = new Set(['van', 'von', 'de', 'del', 'della', 'di', 'da', 'le', 'la'])

/**
 * Wraps a Normalize helper that may return undefined or throw.
 * Returns '' on failure so Velocity renders nothing instead of the raw expression.
 */
function withNormalizeFallback<T extends (...args: any[]) => string | undefined>(
    helperName: string,
    fn: T
): (...args: Parameters<T>) => string {
    return (...args: Parameters<T>): string => {
        try {
            const result = fn(...args)
            if (result === undefined) {
                logger.debug(`Normalize.${helperName} returned undefined for input: ${JSON.stringify(args[0])}`)
                return ''
            }
            return result
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            logger.debug(`Normalize.${helperName} threw for input ${JSON.stringify(args[0])}: ${msg}`)
            return ''
        }
    }
}

interface ParsedAddress {
    street_address1?: string
    street_address2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
}

// ============================================================================
// Address Helpers (using city-state for US cities)
// ============================================================================

// Cache for US cities to avoid repeated filtering
// Key: lowercase city name, Value: { stateName, stateCode }
const usCityCache = new Map<string, { stateName?: string; stateCode: string } | null>()

// Pre-populate cache on first use
let usCitiesCached = false
const ensureUsCitiesCached = (): void => {
    if (usCitiesCached) return

    const usCities = City.getCitiesOfCountry('US')
    if (!usCities) return

    // Build a map of city name -> state info
    for (const city of usCities) {
        const key = city.name.toLowerCase()
        // Only store first occurrence of each city name
        if (!usCityCache.has(key)) {
            const state = State.getStateByCodeAndCountry(city.stateCode, 'US')
            usCityCache.set(key, {
                stateName: state?.name,
                stateCode: city.stateCode,
            })
        }
    }

    usCitiesCached = true
}

/**
 * Get state code from city name (US only)
 * @param city - City name (e.g., 'Seattle')
 * @returns State code (e.g., 'WA') or undefined
 */
const getCityState = (city: string): string | undefined => {
    if (!city) return undefined

    ensureUsCitiesCached()

    const key = city.trim().toLowerCase()
    const cached = usCityCache.get(key)
    return cached?.stateName
}

const getCityStateCode = (city: string): string | undefined => {
    if (!city) return undefined

    ensureUsCitiesCached()

    const key = city.trim().toLowerCase()
    const cached = usCityCache.get(key)
    return cached?.stateCode
}

/**
 * Parse address string into components (synchronous)
 * @param addressString - Full address to parse
 * @returns Parsed address components or null if parsing fails
 */
const parseAddressSync = (addressString: string): ParsedAddress | null => {
    let result: ParsedAddress | null = null
    let error: Error | null = null

    // Call the callback-based function synchronously
    parseAddressString(addressString, (err: Error | null, parsed: ParsedAddress | null) => {
        error = err
        result = parsed
    })

    return error ? null : result
}

type AmbiguousDateOrder = 'DMY' | 'MDY' | 'YMD'

const MONTH_NAME_INDEX: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
}

const DEFAULT_AMBIGUOUS_DATE_PRIORITY = 'dd-MM-yyyy,MM-dd-yyyy'

const isValidDateParts = (year: number, month: number, day: number): boolean => {
    if (year < 1000 || year > 9999) return false
    if (month < 1 || month > 12) return false
    if (day < 1 || day > 31) return false

    const utcDate = new Date(Date.UTC(year, month - 1, day))
    return utcDate.getUTCFullYear() === year && utcDate.getUTCMonth() === month - 1 && utcDate.getUTCDate() === day
}

const asUtcIso = (
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0
): string | undefined => {
    if (!isValidDateParts(year, month, day)) return undefined
    if (hour < 0 || hour > 23) return undefined
    if (minute < 0 || minute > 59) return undefined
    if (second < 0 || second > 59) return undefined
    if (millisecond < 0 || millisecond > 999) return undefined

    return new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond)).toISOString()
}

const parsePriorityToOrders = (priority?: string): AmbiguousDateOrder[] => {
    if (!priority || !priority.trim()) return ['DMY', 'MDY']

    const tokenToOrder: Record<string, AmbiguousDateOrder> = {
        dmy: 'DMY',
        'dd-mm-yyyy': 'DMY',
        'dd/mm/yyyy': 'DMY',
        'dd.mm.yyyy': 'DMY',
        mdy: 'MDY',
        'mm-dd-yyyy': 'MDY',
        'mm/dd/yyyy': 'MDY',
        'mm.dd.yyyy': 'MDY',
        ymd: 'YMD',
        'yyyy-mm-dd': 'YMD',
        'yyyy/mm/dd': 'YMD',
        'yyyy.mm.dd': 'YMD',
    }

    const parsed = priority
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .map((token) => tokenToOrder[token])
        .filter((token): token is AmbiguousDateOrder => Boolean(token))

    if (parsed.length === 0) return ['DMY', 'MDY']
    return [...new Set(parsed)]
}

const parseNumericDateAsUtc = (rawInput: string, ambiguousPriority: AmbiguousDateOrder[]): string | undefined => {
    const trimmed = rawInput.trim()
    const match = trimmed.match(
        /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?)?$/
    )
    if (!match) return undefined

    const first = Number(match[1])
    const second = Number(match[2])
    const third = Number(match[3])
    const hour = match[4] ? Number(match[4]) : 0
    const minute = match[5] ? Number(match[5]) : 0
    const secondPart = match[6] ? Number(match[6]) : 0
    const millisecond = match[7] ? Number(match[7].padEnd(3, '0')) : 0

    // If the first segment is a 4-digit year, treat as Y-M-D deterministically.
    if (match[1].length === 4) {
        return asUtcIso(first, second, third, hour, minute, secondPart, millisecond)
    }

    // If the last segment is a 4-digit year, use configured ambiguous priority.
    if (match[3].length === 4) {
        for (const order of ambiguousPriority) {
            if (order === 'DMY') {
                const dmy = asUtcIso(third, second, first, hour, minute, secondPart, millisecond)
                if (dmy) return dmy
                continue
            }
            if (order === 'MDY') {
                const mdy = asUtcIso(third, first, second, hour, minute, secondPart, millisecond)
                if (mdy) return mdy
                continue
            }
            if (order === 'YMD') {
                const ymd = asUtcIso(first, second, third, hour, minute, secondPart, millisecond)
                if (ymd) return ymd
            }
        }
    }

    return undefined
}

const parseMonthNameDateAsUtc = (rawInput: string): string | undefined => {
    const trimmed = rawInput.trim()

    // Month Day Year: "July 4 1995", "Jan 15, 2021"
    const monthDayYear = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,)?\s+(\d{4})$/)
    if (monthDayYear) {
        const month = MONTH_NAME_INDEX[monthDayYear[1].toLowerCase()]
        const day = Number(monthDayYear[2])
        const year = Number(monthDayYear[3])
        if (month) return asUtcIso(year, month, day)
    }

    // Day Month Year: "15 Jan 2021", "4 July, 1995"
    const dayMonthYear = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)(?:,)?\s+(\d{4})$/)
    if (dayMonthYear) {
        const day = Number(dayMonthYear[1])
        const month = MONTH_NAME_INDEX[dayMonthYear[2].toLowerCase()]
        const year = Number(dayMonthYear[3])
        if (month) return asUtcIso(year, month, day)
    }

    return undefined
}

const normalizeDate = (date: string, ambiguousPriority = DEFAULT_AMBIGUOUS_DATE_PRIORITY): string | undefined => {
    if (!date || !date.trim()) return undefined
    const input = date.trim()

    // Preserve timezone-aware ISO inputs as-is (validated).
    const isoWithTimezone = input.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/)
    if (isoWithTimezone) {
        const parsed = new Date(input)
        return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
    }

    const orders = parsePriorityToOrders(ambiguousPriority)
    const numeric = parseNumericDateAsUtc(input, orders)
    if (numeric) return numeric

    return parseMonthNameDateAsUtc(input)
}

const normalizePhoneNumber = (phone: string, defaultCountry: CountryCode = 'US'): string | undefined => {
    const input = phone?.trim()
    if (!input) return undefined

    // If the number already includes an international prefix (+...), let it drive country resolution.
    // Otherwise use the provided default country as a fallback for local/national numbers.
    const parsed = input.startsWith('+')
        ? parsePhoneNumberFromString(input)
        : parsePhoneNumberFromString(input, defaultCountry)
    return parsed?.formatInternational()
}

/**
 * Properly capitalizes names, handling special cases like:
 * - O'Brien, O'Connor (apostrophes)
 * - McDonald, MacArthur (Mac/Mc prefixes)
 * - van der Berg, de la Cruz (particles)
 * - Mary-Jane (hyphens)
 */
const properCaseName = (name: string): string => {
    if (!name) return name

    // Split on spaces to handle each part separately
    return name
        .split(' ')
        .map((part) => {
            if (!part) return part

            // Handle hyphenated names (e.g., Mary-Jane)
            if (part.includes('-')) {
                return part
                    .split('-')
                    .map((p) => properCaseName(p))
                    .join('-')
            }

            // Handle apostrophes (e.g., O'Brien, D'Angelo)
            if (part.includes("'")) {
                const parts = part.split("'")
                return parts.map((p) => capitalizeFirst(p.toLowerCase())).join("'")
            }

            // Handle Mc/Mac prefixes (e.g., McDonald, MacArthur)
            const lower = part.toLowerCase()
            if (lower.startsWith('mc') && part.length > 2) {
                return 'Mc' + capitalizeFirst(lower.slice(2))
            }
            if (lower.startsWith('mac') && part.length > 3) {
                return 'Mac' + capitalizeFirst(lower.slice(3))
            }

            // Handle lowercase particles (van, von, de, del, etc.)
            if (NAME_PARTICLES.has(lower)) {
                return lower
            }

            // Default: capitalize first letter, lowercase the rest
            return capitalizeFirst(lower)
        })
        .join(' ')
}

const normalizeFullName = (name: string): string | undefined => {
    if (!name || !name.trim()) return undefined

    // Simple name parsing: split by spaces and take first and last
    const parts = name.trim().split(/\s+/)

    if (parts.length === 0) return undefined
    if (parts.length === 1) {
        // Only one name part, treat as last name
        return properCaseName(parts[0])
    }

    // First name is the first part, last name is the last part
    // Middle names/initials are included with the first name
    const firstName = parts.slice(0, -1).join(' ')
    const lastName = parts[parts.length - 1]

    const normalizedFirst = properCaseName(firstName)
    const normalizedLast = properCaseName(lastName)

    return `${normalizedFirst} ${normalizedLast}`
}

const normalizeSSN = (ssn: string): string | undefined => {
    if (!ssn) return undefined
    // Remove all non-digits
    const cleaned = ssn.replace(/\D/g, '')
    // Return standardized format (just digits) or undefined if invalid length
    return cleaned.length === 9 ? cleaned : undefined
}

/**
 * Normalize address using full parser, with fallback to regex
 * @param address - Full address string
 * @returns Normalized address or original if parsing fails
 */
const normalizeAddress = (address: string): string | undefined => {
    if (!address) return undefined

    // Try full address parser first
    const parsed = parseAddressSync(address)
    if (parsed) {
        const parts: string[] = []
        if (parsed.street_address1) parts.push(parsed.street_address1)
        if (parsed.street_address2) parts.push(parsed.street_address2)
        if (parsed.city) parts.push(parsed.city)
        if (parsed.state) parts.push(parsed.state)
        if (parsed.postal_code) parts.push(parsed.postal_code)

        if (parts.length > 0) {
            return parts.join(', ')
        }
    }

    // Fallback to regex pattern matching
    const cityStateMatch = address.match(/([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5})?/i)
    if (cityStateMatch) {
        const [, city, stateInput, zip] = cityStateMatch
        // Try to get state by code or name
        const state = State.getStateByCodeAndCountry(stateInput.trim().toUpperCase(), 'US')
        const stateCode = state?.isoCode
        if (stateCode) {
            return zip ? `${city.trim()}, ${stateCode} ${zip.trim()}` : `${city.trim()}, ${stateCode}`
        }
    }

    return address.trim()
}

const AddressParse = {
    getCityState,
    getCityStateCode,
    parse: parseAddressSync,
}

const Normalize = {
    date: withNormalizeFallback('date', normalizeDate),
    phone: withNormalizeFallback('phone', normalizePhoneNumber),
    name: withNormalizeFallback('name', properCaseName),
    fullName: withNormalizeFallback('fullName', normalizeFullName),
    ssn: withNormalizeFallback('ssn', normalizeSSN),
    address: withNormalizeFallback('address', normalizeAddress),
}

export const contextHelpers = { Datefns, Math, AddressParse, Normalize }
