import { locales } from '../locales'

describe('locales dictionary parity', () => {
    it('includes every English key in all locale dictionaries', () => {
        const enKeys = Object.keys(locales.en)
        for (const [code, dict] of Object.entries(locales)) {
            if (code === 'en') continue
            const missing = enKeys.filter((key) => !dict[key])
            expect(missing, `${code} missing keys`).toEqual([])
        }
    })
})
