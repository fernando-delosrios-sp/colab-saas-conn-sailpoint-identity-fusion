import { logger } from '@sailpoint/connector-sdk'
import { State, City } from './geo/geoData'
// @ts-expect-error - no types available
import parseAddressString from 'parse-address-string'

export interface ParsedAddress {
    street_address1?: string
    street_address2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
}

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
 * Get state name from city name (US only)
 * @deprecated City-only state lookup is ambiguous and can lead to duplicate name collisions. Use region/zip code instead.
 * @param city - City name (e.g., 'Seattle')
 * @returns State name (e.g., 'Washington') or undefined
 */
const getCityState = (city: string): string | undefined => {
    if (!city) return undefined

    logger.warn(`getCityState called for city: ${city}. City-only state lookups are deprecated due to potential collisions.`)

    ensureUsCitiesCached()

    const key = city.trim().toLowerCase()
    const cached = usCityCache.get(key)
    return cached?.stateName
}

/**
 * Get state code from city name (US only)
 * @deprecated City-only state lookup is ambiguous and can lead to duplicate name collisions. Use region/zip code instead.
 * @param city - City name (e.g., 'Seattle')
 * @returns State code (e.g., 'WA') or undefined
 */
const getCityStateCode = (city: string): string | undefined => {
    if (!city) return undefined

    logger.warn(`getCityStateCode called for city: ${city}. City-only state lookups are deprecated due to potential collisions.`)

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
export const parseAddressSync = (addressString: string): ParsedAddress | null => {
    let result: ParsedAddress | null = null
    let error: Error | null = null

    // Call the callback-based function synchronously
    parseAddressString(addressString, (err: Error | null, parsed: ParsedAddress | null) => {
        error = err
        result = parsed
    })

    return error ? null : result
}

export const AddressParse = {
    getCityState,
    getCityStateCode,
    parse: parseAddressSync,
}
