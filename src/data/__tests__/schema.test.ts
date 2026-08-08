import { FusionAttribute, fusionAccountSchemaAttributes } from '../schema'

const enumValues = Object.values(FusionAttribute).filter((v) => typeof v === 'string') as string[]

describe('FusionAttribute', () => {
    it('declares exactly the eleven current default attributes', () => {
        expect(enumValues).toHaveLength(11)
    })

    it('persists identityId under the historical runtime key', () => {
        expect(FusionAttribute.IdentityId).toBe('identityId')
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

describe('fusionAccountSchemaAttributes descriptions', () => {
    const descriptionFor = (name: string) =>
        fusionAccountSchemaAttributes.find((a) => a.name === name)?.description ?? ''

    it('accounts description requires composite managed account keys only', () => {
        const description = descriptionFor('accounts')
        expect(description).toMatch(/sourceId::nativeIdentity/i)
        expect(description).not.toMatch(/legacy|backwards compat/i)
    })

    it('missing-accounts description requires composite managed account keys only', () => {
        const description = descriptionFor('missing-accounts')
        expect(description).toMatch(/sourceId::nativeIdentity/i)
        expect(description).not.toMatch(/legacy|backwards compat/i)
    })

    it('originAccount description distinguishes identity ID from composite managed account key', () => {
        const description = descriptionFor('originAccount')
        expect(description).toMatch(/identity ID/i)
        expect(description).toMatch(/sourceId::nativeIdentity/i)
        expect(description).not.toMatch(/legacy|backwards compat/i)
    })
})

