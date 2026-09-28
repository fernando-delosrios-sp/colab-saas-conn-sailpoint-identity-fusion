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

    it('Ownership review copy exists in every locale', () => {
        for (const [code, dict] of Object.entries(locales)) {
            const section = dict.form_section_desc_ownership
            const toggle = dict.form_toggle_help_no_match_ownership
            expect(section, `${code} section`).toBeTruthy()
            expect(toggle, `${code} toggle`).toBeTruthy()
            const combined = `${section} ${toggle}`.toLowerCase()
            expect(combined, code).not.toMatch(/correlat|merge|fusionar|fusionner|zusammenführ/)
        }
    })
})
