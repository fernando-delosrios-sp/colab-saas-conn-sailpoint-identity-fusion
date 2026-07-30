import type { FusionConfig } from '../../model/config'
import { locales } from './locales'

export type LocalizationConfig = Pick<
    FusionConfig,
    'enableLocalization' | 'defaultLanguage' | 'identityLanguageAttribute'
>

const LEGACY_LANGUAGE_ATTRIBUTES = ['preferredLanguage', 'language', 'locale', 'userLanguage'] as const

/**
 * Normalizes a language attribute string into a supported 2-letter ISO locale.
 * Typical values like 'en', 'eng', 'english', 'en-US' will map to 'en'.
 */
export function normalizeLanguageCode(lang: string | undefined | null): string | undefined {
    if (!lang || typeof lang !== 'string') return undefined

    const lower = lang.toLowerCase().trim()
    if (!lower) return undefined

    if (lower.startsWith('en')) return 'en'
    if (lower.startsWith('es') || lower === 'spa' || lower === 'spanish') return 'es'
    if (lower.startsWith('fr') || lower === 'fra' || lower === 'fre' || lower === 'french') return 'fr'
    if (lower.startsWith('de') || lower === 'ger' || lower === 'deu' || lower === 'german') return 'de'
    if (lower.startsWith('zh') || lower === 'zho' || lower === 'chi' || lower === 'chinese') return 'zh'
    if (lower.startsWith('ja') || lower === 'jpn' || lower === 'japanese') return 'ja'
    if (lower.startsWith('pt') || lower === 'por' || lower === 'portuguese') return 'pt'
    if (lower.startsWith('it') || lower === 'ita' || lower === 'italian') return 'it'
    if (lower.startsWith('ru') || lower === 'rus' || lower === 'russian') return 'ru'
    if (lower.startsWith('ar') || lower === 'ara' || lower === 'arabic') return 'ar'

    const code = lower.substring(0, 2)
    if (locales[code]) return code

    return undefined
}

/** Returns true when connector localization is explicitly enabled. */
export function isLocalizationEnabled(config: LocalizationConfig): boolean {
    return config.enableLocalization === true
}

/** Reads raw language value from identity attributes using config and legacy fallbacks. */
export function resolveIdentityLanguageRaw(
    config: Pick<FusionConfig, 'identityLanguageAttribute'>,
    attributes: Record<string, unknown> | undefined
): string | undefined {
    if (!attributes) return undefined

    const configured = config.identityLanguageAttribute?.trim()
    if (configured) {
        const configuredValue = attributes[configured]
        if (configuredValue != null && String(configuredValue).trim()) {
            return String(configuredValue)
        }
    }

    for (const key of LEGACY_LANGUAGE_ATTRIBUTES) {
        const value = attributes[key]
        if (value != null && String(value).trim()) {
            return String(value)
        }
    }

    return undefined
}

/** Returns the locale for review forms from defaultLanguage when localization is enabled. */
export function resolveFormLocale(config: LocalizationConfig): string {
    if (!isLocalizationEnabled(config)) {
        return 'en'
    }

    return normalizeLanguageCode(config.defaultLanguage) || 'en'
}

/**
 * Resolves the effective locale for user communications from config and optional identity attributes.
 * Returns `'en'` when localization is disabled or no supported language is found.
 */
export function resolveEffectiveLocale(
    config: LocalizationConfig,
    identityAttributes?: Record<string, unknown>
): string {
    if (!isLocalizationEnabled(config)) {
        return 'en'
    }

    const fromIdentity = normalizeLanguageCode(resolveIdentityLanguageRaw(config, identityAttributes))
    if (fromIdentity) return fromIdentity

    const fromDefault = normalizeLanguageCode(config.defaultLanguage)
    if (fromDefault) return fromDefault

    return 'en'
}

/**
 * Translates a given key using the provided language dictionary.
 * Falls back to English ('en') if the language or translation key is missing.
 */
export function translate(key: string, language: string | undefined): string {
    const localeCode = normalizeLanguageCode(language) || 'en'
    const dict = locales[localeCode] || locales['en']
    const enDict = locales['en']

    return dict[key] || enDict[key] || key
}

/** Translates a key and replaces `{{param}}` placeholders in the result. */
export function translateWithParams(
    key: string,
    language: string | undefined,
    params?: Record<string, string | number>
): string {
    let text = translate(key, language)
    if (!params) return text

    for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(paramValue))
    }
    return text
}

/** Returns localized HTML for workflow body truncation notices. */
export function buildTruncationNoticeHtml(locale: string | undefined): string {
    const message = translate('truncation_notice', locale)
    return `<div style="margin-top:16px;padding:12px;border:1px solid #fde68a;border-left:6px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:12px;">${message}</div>`
}

/** Maps fusion review decision types to locale dictionary keys. */
export function decisionLabelKey(decisionType: string): string {
    if (decisionType === 'merge-existing-identity') return 'decision_merge_existing'
    if (decisionType === 'create-new-identity') return 'decision_create_new'
    return 'decision_no_match'
}

