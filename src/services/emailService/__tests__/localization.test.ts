import type { FusionConfig } from '../../model/config'
import {
    isLocalizationEnabled,
    resolveEffectiveLocale,
    resolveFormLocale,
    resolveIdentityLanguageRaw,
    normalizeLanguageCode,
    translate,
    translateWithParams,
} from '../localization'

const baseConfig = {
    enableLocalization: true,
    defaultLanguage: 'fr',
    identityLanguageAttribute: 'customLang',
} as Pick<FusionConfig, 'enableLocalization' | 'defaultLanguage' | 'identityLanguageAttribute'>

describe('localization', () => {
    describe('isLocalizationEnabled', () => {
        it('returns true only when enableLocalization is strictly true', () => {
            expect(isLocalizationEnabled({ enableLocalization: true })).toBe(true)
            expect(isLocalizationEnabled({ enableLocalization: false })).toBe(false)
            expect(isLocalizationEnabled({})).toBe(false)
            expect(isLocalizationEnabled({ enableLocalization: undefined })).toBe(false)
        })
    })

    describe('resolveIdentityLanguageRaw', () => {
        it('reads configured identityLanguageAttribute first', () => {
            expect(
                resolveIdentityLanguageRaw(baseConfig, {
                    customLang: 'es-ES',
                    preferredLanguage: 'de',
                })
            ).toBe('es-ES')
        })

        it('falls back to legacy attributes when configured attribute is empty', () => {
            expect(
                resolveIdentityLanguageRaw(baseConfig, {
                    preferredLanguage: 'ja',
                })
            ).toBe('ja')
        })
    })

    describe('resolveFormLocale', () => {
        it('returns en when localization is disabled', () => {
            expect(resolveFormLocale({ enableLocalization: false, defaultLanguage: 'fr' })).toBe('en')
        })

        it('uses defaultLanguage when localization is enabled', () => {
            expect(resolveFormLocale({ enableLocalization: true, defaultLanguage: 'fr' })).toBe('fr')
        })

        it('falls back to en for unsupported defaultLanguage', () => {
            expect(resolveFormLocale({ enableLocalization: true, defaultLanguage: 'xx' })).toBe('en')
        })
    })

    describe('resolveEffectiveLocale', () => {
        it('returns en when localization is disabled', () => {
            expect(
                resolveEffectiveLocale(
                    { enableLocalization: false, defaultLanguage: 'es' },
                    { preferredLanguage: 'es' }
                )
            ).toBe('en')
        })

        it('uses identity attribute when enabled', () => {
            expect(resolveEffectiveLocale(baseConfig, { customLang: 'spanish' })).toBe('es')
        })

        it('falls back to defaultLanguage when identity has no language', () => {
            expect(resolveEffectiveLocale(baseConfig, {})).toBe('fr')
        })

        it('falls back to en when nothing resolves', () => {
            expect(
                resolveEffectiveLocale({ enableLocalization: true }, { preferredLanguage: 'unknown' })
            ).toBe('en')
        })
    })

    describe('normalizeLanguageCode', () => {
        it('normalizes common language codes', () => {
            expect(normalizeLanguageCode('es-ES')).toBe('es')
            expect(normalizeLanguageCode('fra')).toBe('fr')
            expect(normalizeLanguageCode(null)).toBeUndefined()
        })
    })

    describe('translateWithParams', () => {
        it('interpolates placeholders in translated strings', () => {
            const result = translateWithParams('review_email_subject', 'en', {
                accountName: 'Acct',
                accountSource: 'HR',
            })
            expect(result).toContain('Acct')
            expect(result).toContain('HR')
        })
    })

    describe('translate', () => {
        it('returns Spanish review title when locale is es', () => {
            expect(translate('review_required', 'es')).toBe('Revisión de Identity Fusion requerida')
        })
    })
})

