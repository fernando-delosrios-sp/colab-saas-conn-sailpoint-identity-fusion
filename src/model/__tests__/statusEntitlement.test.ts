import { StatusEntitlement } from '../statusEntitlement'
import { statuses } from '../../data/status'

const enumValues = Object.values(StatusEntitlement).filter((v) => typeof v === 'string') as string[]

describe('StatusEntitlement', () => {
    it('declares exactly the twelve current statuses including new', () => {
        expect(StatusEntitlement.New).toBe('new')
        expect(enumValues).toHaveLength(12)
        expect(enumValues).toContain('new')
    })

    it('every enum value appears as an id in the statuses data file', () => {
        const dataIds = new Set(statuses.map((s) => s.id))
        expect(dataIds.has('new')).toBe(true)
        for (const value of enumValues) {
            expect(dataIds.has(value)).toBe(true)
        }
    })

    it('every id in the statuses data file equals a StatusEntitlement value', () => {
        const enumSet = new Set(enumValues)
        for (const entry of statuses) {
            expect(enumSet.has(entry.id)).toBe(true)
        }
    })
})
