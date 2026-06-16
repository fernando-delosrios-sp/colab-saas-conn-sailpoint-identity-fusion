// Must run before `velocityjs` is loaded (ESM `import` is hoisted ahead of this file's body).
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./velocityPrototypeGuard.cjs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const velocityjs = require('velocityjs') as typeof import('velocityjs').default
import { transliterate } from 'transliteration'
export type RenderContext = Record<string, any>;
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@sailpoint/connector-sdk'
import { contextHelpers } from './contextHelpers'

// Cache for compiled Velocity templates to avoid repeated parsing
// Key: template expression, Value: compiled template
const templateCache = new Map<string, any>()

/**
 * Normalize string by transliterating and removing special characters
 */
export const normalize = (str: string): string => {
    let result = transliterate(str)
    result = result.replace(/'/g, '')

    return result
}

/**
 * Remove all spaces from a string
 */
export const removeSpaces = (str: string): string => {
    return str.replace(/\s/g, '')
}

/**
 * Transform string case based on caseType
 */
export const switchCase = (str: string, caseType: 'lower' | 'upper' | 'capitalize' | 'same'): string => {
    switch (caseType) {
        case 'lower':
            return str.toLowerCase()
        case 'upper':
            return str.toUpperCase()
        case 'capitalize':
            return str
                .split(' ')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
        default:
            return str
    }
}

/**
 * Evaluate Velocity template expression with extended context (Math, Date, Datefns)
 * Uses template caching to avoid repeated parsing and compilation
 */
export const evaluateVelocityTemplate = (
    expression: string,
    context: RenderContext,
    maxLength?: number
): string | undefined => {
    const extendedContext: RenderContext = { ...context, ...contextHelpers }
    // Null prototype so `$constructor` / `$__proto__` do not resolve via Object.prototype.
    const renderContext = Object.assign(Object.create(null), extendedContext) as RenderContext
    logger.debug(`Evaluating velocity template - expression: ${expression}`)

    // Check cache for compiled template
    let velocity = templateCache.get(expression)
    if (!velocity) {
        // Parse and compile template, then cache it
        const template = velocityjs.parse(expression)
        velocity = new velocityjs.Compile(template)
        templateCache.set(expression, velocity)
        logger.debug(`Compiled and cached new velocity template: ${expression}`)
    }

    let result = velocity.render(renderContext)

    if (maxLength && result.length > maxLength) {
        result = truncateResultToMaxLength(result, expression, renderContext, maxLength)
    }

    if (result === '') {
        logger.debug(
            'Velocity template evaluated to empty string (e.g. Normalize helper returned undefined), returning undefined'
        )
        return undefined
    }

    logger.debug(`Velocity template evaluation result: ${result}`)
    return result
}

/**
 * Truncate result to maxLength, smartly preserving counter anywhere in the string
 */
const truncateResultToMaxLength = (
    result: string,
    expression: string,
    context: RenderContext,
    maxLength: number
): string => {
    if (context.counter && context.counter !== '') {
        const originalCounter = String(context.counter)
        const counterLength = originalCounter.length

        const velocity = templateCache.get(expression)
        if (velocity) {
            const marker = `<<COUNTER_${uuidv4()}>>`
            const testContext = Object.assign(Object.create(null), { ...context, counter: marker })
            const testResult = velocity.render(testContext)

            const markerIndex = testResult.indexOf(marker)
            if (markerIndex !== -1) {
                const prefixLength = markerIndex
                const suffixLength = testResult.length - (markerIndex + marker.length)

                const prefix = result.substring(0, prefixLength)
                const suffix = result.substring(result.length - suffixLength)

                const availableLength = maxLength - counterLength
                if (availableLength < 0) {
                    logger.error(
                        `Maximum length ${maxLength} is less than counter length ${counterLength} for expression: ${expression}`
                    )
                    return result.substring(0, maxLength)
                }

                let finalPrefix = prefix
                let finalSuffix = suffix

                if (prefix.length + suffix.length > availableLength) {
                    if (suffix.length <= availableLength) {
                        finalPrefix = prefix.substring(0, availableLength - suffix.length)
                    } else {
                        finalPrefix = ''
                        finalSuffix = suffix.substring(0, availableLength)
                    }
                }

                return finalPrefix + originalCounter + finalSuffix
            }
        }

        logger.error(
            `Counter variable is not found in the evaluated expression: ${expression}. Cannot intelligently preserve counter.`
        )
    }

    return result.substring(0, maxLength)
}

/**
 * Pad a number with leading zeros to reach the specified length
 */
export const padNumber = (number: number, length: number): string => {
    const numStr = number.toString()
    return numStr.length < length ? numStr.padStart(length, '0') : numStr
}
