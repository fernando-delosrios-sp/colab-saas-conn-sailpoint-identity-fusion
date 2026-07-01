import { FusionAttribute, fusionAccountSchemaAttributes } from '../schema'

const enumValues = Object.values(FusionAttribute).filter((v) => typeof v === 'string') as string[]

describe('FusionAttribute', () => {
    it('declares exactly the ten current default attributes', () => {
        expect(enumValues).toHaveLength(10)
    })

    it('does not include the structural identity keys name and id', () => {
        expect(enumValues).not.toContain('name')
        expect(enumValues).not.toContain('id')
    })

    it('every enum value is the name of some entry in fusionAccountSchemaAttributes', () => {
        const schemaNames = new Set(fusionAccountSchemaAttributes.map((a) => a.name).filter(Boolean))
        for (const value of enumValues) {
            expect(schemaNames.has(value)).toBe(true)
        }
    })
})
