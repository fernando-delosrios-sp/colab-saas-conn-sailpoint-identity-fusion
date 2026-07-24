import { buildUniqueRegistrationPlan } from '../uniqueRegistrationPlan'

describe('buildUniqueRegistrationPlan', () => {
    it('intersects unique definition names with attribute map targets', () => {
        const plan = buildUniqueRegistrationPlan({
            uniqueAttributeDefinitions: [{ name: 'employeeId' }, { name: 'email' }] as any,
            attributeMaps: [{ newAttribute: 'employeeId', existingAttributes: ['emp_id'] }] as any,
        })

        expect([...plan.uniqueNames]).toEqual(['employeeId', 'email'])
        expect([...plan.mapTargets]).toEqual(['employeeId'])
        expect([...plan.passthroughNames]).toEqual(['email'])
    })

    it('treats all unique names as passthrough when no maps coincide', () => {
        const plan = buildUniqueRegistrationPlan({
            uniqueAttributeDefinitions: [{ name: 'externalId' }] as any,
            attributeMaps: [{ newAttribute: 'displayName', existingAttributes: ['name'] }] as any,
        })

        expect([...plan.mapTargets]).toEqual([])
        expect([...plan.passthroughNames]).toEqual(['externalId'])
    })
})
