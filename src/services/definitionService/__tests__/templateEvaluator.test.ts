import { describe, it, expect } from 'vitest'
import { evaluateAttributeTemplate, applyOutputTransforms } from '../templateEvaluator'

describe('templateEvaluator', () => {
    describe('evaluateAttributeTemplate', () => {
        it('evaluates a simple expression and applies transforms', () => {
            const definition = {
                name: 'fullName',
                expression: '$firstName $lastName',
                trim: true,
                case: 'lower',
                spaces: true,
                normalize: false,
            } as any
            const context = { firstName: '  John ', lastName: ' Doe ' }

            const result = evaluateAttributeTemplate(definition, context)

            expect(result.value).toBe('johndoe')
            expect(result.error).toBeUndefined()
        })

        it('returns an error when expression is missing', () => {
            const definition = { name: 'test' } as any
            const context = {}

            const result = evaluateAttributeTemplate(definition, context)

            expect(result.value).toBeUndefined()
            expect(result.error).toContain('Expression is required')
        })

        it('renders unresolved variable literally per standard Velocity semantics', () => {
            const definition = {
                name: 'test',
                expression: '$missing',
            } as any
            const context = {}

            const result = evaluateAttributeTemplate(definition, context)

            expect(result.value).toBe('$missing')
            expect(result.error).toBeUndefined()
        })

        it('renders quiet unresolved variable as empty string', () => {
            const definition = {
                name: 'test',
                expression: '$!missing',
            } as any
            const context = {}

            const result = evaluateAttributeTemplate(definition, context)

            expect(result.value).toBeUndefined()
            expect(result.error).toBeUndefined()
        })

        it('passes through numeric Velocity results unchanged', () => {
            const definition = {
                name: 'test',
                expression: '42',
            } as any
            const context = {}

            const result = evaluateAttributeTemplate(definition, context)

            expect(result.value).toBe('42')
            expect(result.error).toBeUndefined()
        })

        it('uses expressionOverride when provided', () => {
            const definition = {
                name: 'test',
                expression: '$original',
            } as any
            const context = { override: 'overridden' }

            const result = evaluateAttributeTemplate(definition, context, {
                expressionOverride: '$override',
            })

            expect(result.value).toBe('overridden')
            expect(result.error).toBeUndefined()
        })
    })

    describe('applyOutputTransforms', () => {
        it('applies transforms in canonical order: trim → case → spaces → normalize → maxLength', () => {
            const definition = {
                name: 'test',
                trim: true,
                case: 'lower',
                spaces: true,
                normalize: false,
            } as any
            const context = {}

            const result = applyOutputTransforms('  HELLO WORLD  ', definition, undefined, context)

            expect(result).toBe('helloworld')
        })

        it('reserves counter length from maxLength budget', () => {
            const definition = {
                name: 'test',
                maxLength: 10,
            } as any
            const context = { counter: '01' }
            const expression = '$name$counter'

            const result = applyOutputTransforms('johndoe01', definition, expression, context)

            expect(result).toBe('johndoe01')
            expect(String(result).length).toBeLessThanOrEqual(10)
        })

        it('truncates prefix when prefix + counter exceeds maxLength', () => {
            const definition = {
                name: 'test',
                maxLength: 8,
            } as any
            const context = { counter: '01' }
            const expression = '$name$counter'

            const result = applyOutputTransforms('johndoe01', definition, expression, context)

            expect(result).toBe('johndoe0')
            expect(String(result).length).toBe(8)
        })

        it('passes through non-string values unchanged', () => {
            const definition = {
                name: 'test',
                trim: true,
                case: 'lower',
            } as any
            const context = {}

            expect(applyOutputTransforms(42, definition, undefined, context)).toBe(42)
            expect(applyOutputTransforms(undefined, definition, undefined, context)).toBeUndefined()
            expect(applyOutputTransforms(null, definition, undefined, context)).toBeNull()
        })

        it('applies normalize transform', () => {
            const definition = {
                name: 'test',
                normalize: true,
            } as any
            const context = {}

            const result = applyOutputTransforms('café', definition, undefined, context)

            expect(result).toBe('cafe')
        })

        it('applies maxLength without counter when no counter in context', () => {
            const definition = {
                name: 'test',
                maxLength: 5,
            } as any
            const context = {}

            const result = applyOutputTransforms('abcdefghij', definition, undefined, context)

            expect(result).toBe('abcde')
        })
    })
})
