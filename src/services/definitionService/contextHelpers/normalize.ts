import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js'
import { State } from './geo/geoData'
import { capitalizeFirst } from '../../../utils'
import { parseAddressSync } from './addressParse'
import { transliterate } from 'transliteration'
import { withVelocityHelperFallback } from './velocityFallback'

/** Lowercase name particles treated as non-capitalised in proper-case formatting. */
const NAME_PARTICLES = new Set(['van', 'von', 'de', 'del', 'della', 'di', 'da', 'le', 'la', 'der', 'den', 'du', 'y'])

/**
 * German (DACH) digraph replacements.
 * ä→ae, ö→oe, ü→ue, ß→ss
 */
const DACH_DIGRAPHS: Record<string, string> = {
    'ä': 'ae',
    'ö': 'oe',
    'ü': 'ue',
    'ß': 'ss',
}

/**
 * Nordic digraph replacements.
 * ä→ae, ö→oe, å→aa, ø→oe
 */
const NORDIC_DIGRAPHS: Record<string, string> = {
    'ä': 'ae',
    'ö': 'oe',
    'å': 'aa',
    'ø': 'oe',
}

/**
 * Language code to digraph rule set mapping.
 * Multiple locale variants (e.g., de-DE, de-AT) resolve hierarchically to the base language.
 */
const LANGUAGE_RULES: Record<string, Record<string, string>> = {
    de: DACH_DIGRAPHS,
    no: NORDIC_DIGRAPHS,
    da: NORDIC_DIGRAPHS,
    sv: NORDIC_DIGRAPHS,
}

/**
 * Resolves a language code to its digraph rule set.
 * Supports hierarchical fallback: "de-DE" → "de" → rule set.
 * Returns undefined if no rules match (falls back to generic transliteration).
 */
const resolveLanguage = (language: string): Record<string, string> | undefined => {
    const key = language.toLowerCase()
    if (LANGUAGE_RULES[key]) {
        return LANGUAGE_RULES[key]
    }
    const dashIdx = key.indexOf('-')
    if (dashIdx !== -1) {
        const prefix = key.substring(0, dashIdx)
        if (LANGUAGE_RULES[prefix]) {
            return LANGUAGE_RULES[prefix]
        }
    }
    return undefined
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
 * @param countryCode - ISO country code (e.g. "US", "GB", "UK"). Defaults to "US" for backward compatibility.
 * @returns Normalized address or original if parsing fails or country is unsupported
 */
function normalizeUsAddress(address: string): string | undefined {
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

    const cityStateMatch = address.match(/([A-Za-z][A-Za-z\s]*?),\s*([A-Z]{2}|[A-Za-z][A-Za-z\s]+?)\s*(\d{5}(?:-\d{4})?)?\s*$/)
    if (!cityStateMatch) return undefined

    const [, city, stateInput, zip] = cityStateMatch
    const stateInputTrimmed = stateInput.trim()
    const byCode = State.getStateByCodeAndCountry(stateInputTrimmed.toUpperCase(), 'US')
    let state = byCode
    if (!state) {
        state = State.getStateByNameAndCountry(stateInputTrimmed, 'US')
    }
    const stateCode = state?.isoCode
    if (!stateCode) return undefined

    return zip ? `${city.trim()}, ${stateCode} ${zip.trim()}` : `${city.trim()}, ${stateCode}`
}

function normalizeUkAddress(address: string): string | undefined {
    const ukMatch = address.match(/([A-Za-z][A-Za-z\s]*?),\s*([A-Z]{2,4}|[A-Za-z][A-Za-z\s]+?)\s*([A-Z]{1,2}\d[\dA-Z]?(?:\s*\d[A-Z]{2})?)?\s*$/i)
    if (!ukMatch) return undefined

    const [, city, regionInput, postcode] = ukMatch
    const regionInputTrimmed = regionInput.trim()
    let region = State.getStateByCodeAndCountry(regionInputTrimmed.toUpperCase(), 'GB')
    if (!region) {
        region = State.getStateByNameAndCountry(regionInputTrimmed, 'GB')
    }
    const regionCode = region?.isoCode
    if (!regionCode) return undefined

    return postcode ? `${city.trim()}, ${regionCode} ${postcode.trim()}` : `${city.trim()}, ${regionCode}`
}

const normalizeAddress = (address: string, countryCode: string = 'US'): string | undefined => {
    if (!address) return undefined

    const normalizedCountry = countryCode?.toUpperCase() ?? 'US'
    const isUS = normalizedCountry === 'US'
    const isUK = normalizedCountry === 'GB' || normalizedCountry === 'UK'

    if (!isUS && !isUK) {
        return address.trim()
    }

    if (isUS) {
        return normalizeUsAddress(address) ?? address.trim()
    }

    return normalizeUkAddress(address) ?? address.trim()
}

/**
 * Transliterates non-ASCII characters to their ASCII equivalents.
 * When a recognized language code is provided, applies language-specific digraph rules.
 * Otherwise, falls back to the transliteration library for generic diacritic stripping.
 * Always returns lowercase ASCII output.
 * @param input - The string to transliterate
 * @param language - Optional language code (e.g., "de", "no", "sv"). Supports hierarchical resolution (e.g., "de-DE" → "de").
 * @returns Lowercase ASCII string, or undefined if input is empty/whitespace
 */
const normalizeAscii = (input: string, language?: string): string | undefined => {
    if (!input || !input.trim()) return undefined

    const rules = language ? resolveLanguage(language) : undefined
    let result = input.toLowerCase()

    if (rules) {
        for (const [char, replacement] of Object.entries(rules)) {
            result = result.split(char).join(replacement)
        }
    } else {
        result = transliterate(result)
    }

    return result
}

export const Normalize = {
    date: withVelocityHelperFallback('Normalize.date', normalizeDate),
    phone: withVelocityHelperFallback('Normalize.phone', normalizePhoneNumber),
    name: withVelocityHelperFallback('Normalize.name', properCaseName),
    fullName: withVelocityHelperFallback('Normalize.fullName', normalizeFullName),
    ssn: withVelocityHelperFallback('Normalize.ssn', normalizeSSN),
    address: withVelocityHelperFallback('Normalize.address', normalizeAddress),
    ascii: withVelocityHelperFallback('Normalize.ascii', normalizeAscii),
}
