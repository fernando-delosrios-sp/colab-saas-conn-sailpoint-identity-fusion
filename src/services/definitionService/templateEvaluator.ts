import { NormalAttributeDefinition, UniqueAttributeDefinition } from '../../model/config'
import {
    evaluateVelocityTemplate,
    evaluateVelocityTemplateWithContext,
    normalize,
    removeSpaces,
    switchCase,
    truncateResultToMaxLength,
} from './formatting'

type AnyDefinition = NormalAttributeDefinition | UniqueAttributeDefinition
type RenderContext = Record<string, any>

export interface EvaluateOptions {
    expressionOverride?: string
    renderContext?: RenderContext
}

export interface EvaluateResult {
    value: any
    error?: string
}

export function evaluateAttributeTemplate(
    definition: AnyDefinition,
    context: RenderContext,
    options?: EvaluateOptions
): EvaluateResult {
    const expression = options?.expressionOverride ?? definition.expression
    if (!expression) {
        return { value: undefined, error: `Expression is required for attribute ${definition.name}` }
    }

    let value: any
    try {
        value = options?.renderContext
            ? evaluateVelocityTemplateWithContext(options.renderContext, expression)
            : evaluateVelocityTemplate(expression, context)
    } catch (error) {
        return {
            value: undefined,
            error: `Failed to evaluate velocity template for attribute ${definition.name}: ${error instanceof Error ? error.message : String(error)}`,
        }
    }

    if (!value) return { value: undefined }

    if (typeof value === 'string') {
        value = applyOutputTransforms(value, definition, expression, context)
    }

    return { value }
}

export function applyOutputTransforms(
    raw: any,
    definition: AnyDefinition,
    expression: string | undefined,
    context: RenderContext
): any {
    if (typeof raw !== 'string') return raw

    let value = raw
    if (definition.trim) value = value.trim()
    if (definition.case) value = switchCase(value, definition.case)
    if (definition.spaces) value = removeSpaces(value)
    if (definition.normalize) value = normalize(value)
    if (definition.maxLength && value.length > definition.maxLength) {
        value = expression
            ? truncateResultToMaxLength(value, expression, context, definition.maxLength)
            : value.substring(0, definition.maxLength)
    }
    return value
}
