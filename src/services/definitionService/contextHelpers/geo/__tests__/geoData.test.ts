import { State } from '../geoData'

describe('geoData State facade', () => {
    describe('getStateByCodeAndCountry', () => {
        it('returns the US state for a US code', () => {
            const state = State.getStateByCodeAndCountry('NY', 'US')
            expect(state).toBeDefined()
            expect(state?.name).toBe('New York')
            expect(state?.isoCode).toBe('NY')
        })

        it('returns the UK region for a GB code', () => {
            const state = State.getStateByCodeAndCountry('LND', 'GB')
            expect(state).toBeDefined()
            expect(state?.name).toBe('Greater London')
            expect(state?.isoCode).toBe('LND')
        })

        it('returns the UK region when UK alias is used', () => {
            const state = State.getStateByCodeAndCountry('LND', 'UK')
            expect(state).toBeDefined()
            expect(state?.name).toBe('Greater London')
        })

        it('returns undefined for unsupported country codes', () => {
            expect(State.getStateByCodeAndCountry('NY', 'CA')).toBeUndefined()
        })

        it('returns undefined for unknown codes', () => {
            expect(State.getStateByCodeAndCountry('ZZ', 'US')).toBeUndefined()
        })
    })

    describe('getStateByNameAndCountry', () => {
        it('returns the US state for a US name', () => {
            const state = State.getStateByNameAndCountry('New York', 'US')
            expect(state).toBeDefined()
            expect(state?.name).toBe('New York')
            expect(state?.isoCode).toBe('NY')
        })

        it('matches US names case-insensitively', () => {
            const state = State.getStateByNameAndCountry('new york', 'US')
            expect(state).toBeDefined()
            expect(state?.isoCode).toBe('NY')
        })

        it('returns the UK region for a GB name', () => {
            const state = State.getStateByNameAndCountry('Greater London', 'GB')
            expect(state).toBeDefined()
            expect(state?.name).toBe('Greater London')
            expect(state?.isoCode).toBe('LND')
        })

        it('returns the UK region when UK alias is used', () => {
            const state = State.getStateByNameAndCountry('Greater London', 'UK')
            expect(state).toBeDefined()
            expect(state?.isoCode).toBe('LND')
        })

        it('matches UK names case-insensitively', () => {
            const state = State.getStateByNameAndCountry('greater london', 'GB')
            expect(state).toBeDefined()
            expect(state?.isoCode).toBe('LND')
        })

        it('returns undefined for unsupported country codes', () => {
            expect(State.getStateByNameAndCountry('Ontario', 'CA')).toBeUndefined()
        })

        it('returns undefined for unknown names', () => {
            expect(State.getStateByNameAndCountry('Atlantis', 'US')).toBeUndefined()
        })
    })
})
