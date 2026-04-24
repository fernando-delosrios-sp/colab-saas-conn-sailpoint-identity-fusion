import { attrSplit, attrConcat, processAttributeMapping, buildAttributeMappingConfig } from '../helpers'
import { Attributes } from '@sailpoint/connector-sdk'
import { AttributeMergeMode } from '../../../model/config'

describe('attributeService helpers', () => {
    describe('attrSplit', () => {
        it('should split bracketed values', () => {
            expect(attrSplit('[HR] [IT] [Finance]')).toEqual(['HR', 'IT', 'Finance'])
        })

        it('should return original text when no brackets', () => {
            expect(attrSplit('plain text')).toEqual(['plain text'])
        })

        it('should handle empty string', () => {
            expect(attrSplit('')).toEqual([])
        })

        it('should extract unique values', () => {
            expect(attrSplit('[HR] [HR] [IT]')).toEqual(['HR', 'IT'])
        })
    })

    describe('attrConcat', () => {
        it('should concatenate list to bracketed format', () => {
            expect(attrConcat(['HR', 'IT', 'Finance'])).toBe('[Finance] [HR] [IT]')
        })

        it('should return empty string for empty list', () => {
            expect(attrConcat([])).toBe('')
        })

        it('should extract unique values and sort when not alreadyProcessed', () => {
            expect(attrConcat(['B', 'A', 'B'])).toBe('[A] [B]')
        })

        it('should skip extracting unique values/sorting when alreadyProcessed', () => {
            expect(attrConcat(['C', 'A', 'B'], true)).toBe('[C] [A] [B]')
        })

        it('should filter empty strings', () => {
            expect(attrConcat(['A', '', 'B'])).toBe('[A] [B]')
        })
    })

    describe('processAttributeMapping', () => {
        const createMap = (source: string, accounts: Attributes[]): Map<string, Attributes[]> => {
            const m = new Map<string, Attributes[]>()
            m.set(source, accounts)
            return m
        }

        it('should return first value for "first" merge', () => {
            const map = createMap('Source1', [{ displayName: 'Alice' }, { displayName: 'Bob' }])
            const config = {
                attributeName: 'displayName',
                sourceAttributes: ['displayName'],
                attributeMerge: AttributeMergeMode.First,
            }
            expect(processAttributeMapping(config, map, ['Source1'])).toBe('Alice')
        })

        it('should return only from specified source for "source" merge', () => {
            const map = new Map<string, Attributes[]>()
            map.set('HR', [{ email: 'hr@acme.com' }])
            map.set('IT', [{ email: 'it@acme.com' }])
            const config = {
                attributeName: 'email',
                sourceAttributes: ['email'],
                attributeMerge: AttributeMergeMode.Source,
                source: 'IT',
            }
            expect(processAttributeMapping(config, map, ['HR', 'IT'])).toBe('it@acme.com')
        })

        it('should return list for "list" merge', () => {
            const map = new Map<string, Attributes[]>()
            map.set('S1', [{ dept: '[HR]' }])
            map.set('S2', [{ dept: '[IT]' }])
            const config = {
                attributeName: 'dept',
                sourceAttributes: ['dept'],
                attributeMerge: AttributeMergeMode.List,
            }
            const result = processAttributeMapping(config, map, ['S1', 'S2'])
            expect(result).toEqual(expect.arrayContaining(['HR', 'IT']))
            expect(result).toHaveLength(2)
        })

        it('should return concatenated string for "concatenate" merge', () => {
            const map = new Map<string, Attributes[]>()
            map.set('S1', [{ role: 'Admin' }])
            map.set('S2', [{ role: 'User' }])
            const config = {
                attributeName: 'role',
                sourceAttributes: ['role'],
                attributeMerge: AttributeMergeMode.Concatenate,
            }
            const result = processAttributeMapping(config, map, ['S1', 'S2'])
            expect(result).toMatch(/\[Admin\].*\[User\]|\[User\].*\[Admin\]/)
        })

        it('should return undefined when no accounts', () => {
            const map = createMap('Empty', [])
            const config = {
                attributeName: 'displayName',
                sourceAttributes: ['displayName'],
                attributeMerge: AttributeMergeMode.First,
            }
            expect(processAttributeMapping(config, map, ['Empty'])).toBeUndefined()
        })
    })

    describe('buildAttributeMappingConfig', () => {
        it('should use attributeMap when found', () => {
            const maps = [
                {
                    newAttribute: 'email',
                    existingAttributes: ['mail', 'emailAddress'],
                    attributeMerge: AttributeMergeMode.First,
                },
            ]
            const result = buildAttributeMappingConfig('email', maps, AttributeMergeMode.List)
            expect(result).toEqual({
                attributeName: 'email',
                sourceAttributes: ['mail', 'emailAddress'],
                attributeMerge: 'first',
            })
        })

        it('should use default when no attributeMap', () => {
            const result = buildAttributeMappingConfig('displayName', [], AttributeMergeMode.First)
            expect(result).toEqual({
                attributeName: 'displayName',
                sourceAttributes: ['displayName'],
                attributeMerge: 'first',
            })
        })

        it('should use source from attributeMap when specified', () => {
            const maps = [
                {
                    newAttribute: 'manager',
                    existingAttributes: ['manager'],
                    attributeMerge: AttributeMergeMode.Source,
                    source: 'HR',
                },
            ]
            const result = buildAttributeMappingConfig('manager', maps, AttributeMergeMode.First)
            expect(result.source).toBe('HR')
        })
    })
})
