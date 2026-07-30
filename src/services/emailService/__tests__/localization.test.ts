import type { FusionConfig } from '../../model/config'
import {
    isLocalizationEnabled,
    resolveEffectiveLocale,
    resolveFormLocale,
    resolveIdentityLanguageRaw,
    normalizeLanguageCode,
    translate,
    translateWithParams,
    buildFormDefinitionDescription,
    parseFormDefinitionLocale,
    shouldRefreshLocalizedFormDefinition,
    scoreAttributeLabel,
    formDefinitionLabelsMatchLocale,
    readNewIdentityToggleLabel,
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

        it('uses defaultLanguage as the authoritative form locale', () => {
            expect(resolveFormLocale({ enableLocalization: true, defaultLanguage: 'ja' })).toBe('ja')
            expect(resolveFormLocale({ enableLocalization: true, defaultLanguage: 'fr' })).toBe('fr')
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

        it('uses configured identity attribute when enabled', () => {
            expect(resolveEffectiveLocale(baseConfig, { customLang: 'spanish' })).toBe('es')
        })

        it('prefers identity attribute over defaultLanguage for communications', () => {
            expect(
                resolveEffectiveLocale(
                    { enableLocalization: true, defaultLanguage: 'en' },
                    { preferredLanguage: 'ja' }
                )
            ).toBe('ja')
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

        it('returns localized review email subject for zh', () => {
            expect(translate('review_email_subject', 'zh')).toContain('审核候选身份匹配')
        })

        it('returns localized email header subtitle', () => {
            expect(
                translateWithParams('email_header_subtitle', 'fr', {
                    host: 'tenant.example.com',
                    sourceName: 'Fusion',
                })
            ).toBe('tenant.example.com - Fusion')
        })

        it('localizes Combined score attribute label', () => {
            expect(scoreAttributeLabel('Combined score', 'fr')).toBe('Score combiné')
        })

        it('localizes Combined score attribute label case-insensitively', () => {
            expect(scoreAttributeLabel('combined score', 'de')).toBe('Kombinierter Score')
        })

        it('localizes combined_score_attribute key when passed as attribute name', () => {
            expect(scoreAttributeLabel('combined_score_attribute', 'fr')).toBe('Score combiné')
        })
    })

    describe('form definition locale marker', () => {
        it('embeds locale marker when localization is enabled', () => {
            const description = buildFormDefinitionDescription('fr', true)
            expect(description.startsWith('fusion-locale:3:fr|')).toBe(true)
            expect(parseFormDefinitionLocale(description)).toBe('fr')
        })

        it('returns plain description when localization is disabled', () => {
            const description = buildFormDefinitionDescription('fr', false)
            expect(description).not.toContain('fusion-locale:')
        })

        it('requires refresh for legacy definitions without marker', () => {
            expect(shouldRefreshLocalizedFormDefinition('English only description', 'fr', true)).toBe(true)
        })

        it('requires refresh when stored locale differs', () => {
            const description = buildFormDefinitionDescription('en', true)
            expect(shouldRefreshLocalizedFormDefinition(description, 'fr', true)).toBe(true)
        })

        it('skips refresh when stored locale, version, and labels match', () => {
            const description = buildFormDefinitionDescription('fr', true)
            const frenchElements = [
                {
                    key: 'identitiesSection',
                    config: {
                        formElements: [
                            {
                                key: 'decisionsColumnSet',
                                config: {
                                    columns: [[{ key: 'newIdentity', config: { label: 'Nouvelle identité' } }]],
                                },
                            },
                        ],
                    },
                },
            ] as any
            expect(shouldRefreshLocalizedFormDefinition(description, 'fr', true, frenchElements)).toBe(false)
        })

        it('requires refresh when stored localization version is older', () => {
            expect(shouldRefreshLocalizedFormDefinition('fusion-locale:fr|French description', 'fr', true)).toBe(true)
        })

        it('requires refresh when marker matches but stored labels are still English', () => {
            const description = buildFormDefinitionDescription('fr', true)
            const englishElements = [
                {
                    key: 'identitiesSection',
                    config: {
                        formElements: [
                            {
                                key: 'decisionsColumnSet',
                                config: {
                                    columns: [[{ key: 'newIdentity', config: { label: 'New identity' } }]],
                                },
                            },
                        ],
                    },
                },
            ] as any
            expect(shouldRefreshLocalizedFormDefinition(description, 'fr', true, englishElements)).toBe(true)
            expect(formDefinitionLabelsMatchLocale(englishElements, 'fr')).toBe(false)
            expect(readNewIdentityToggleLabel(englishElements)).toBe('New identity')
        })
    })
})


