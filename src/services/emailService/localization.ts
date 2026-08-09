import type { FusionConfig } from '../../model/config'
import { FormElementV2025 } from 'sailpoint-api-client'
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
    if (config.enableLocalization === true) {
        return true
    }
    return String(config.enableLocalization ?? '').toLowerCase() === 'true'
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

/** Returns the locale for review forms from defaultLanguage when localization is enabled. Ignores identity language attributes. */
export function resolveFormLocale(config: LocalizationConfig): string {
    if (!isLocalizationEnabled(config)) {
        return 'en'
    }

    return normalizeLanguageCode(config.defaultLanguage) || 'en'
}

/**
 * Resolves the effective locale for user communications (email, reports).
 * Precedence when localization is enabled: recipient identity language attribute, then defaultLanguage, then English.
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

/** Prefix embedded in form definition descriptions to track localization locale. */
const FORM_DEFINITION_LOCALE_PREFIX = 'fusion-locale:'

/** Bump when localized form element labels change so existing definitions are patched. */
const FORM_DEFINITION_LOCALIZATION_VERSION = 3

const COMBINED_SCORE_ATTRIBUTE_NAMES = new Set([
    'Combined score',
    'Combined match score',
    'Average Score',
])

type ParsedFormDefinitionLocaleMarker = {
    locale?: string
    version?: number
}

function isCombinedScoreAttributeName(name: string): boolean {
    if (COMBINED_SCORE_ATTRIBUTE_NAMES.has(name)) {
        return true
    }
    const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim()
    return (
        normalized === 'combined score' ||
        normalized === 'combined match score' ||
        normalized === 'average score' ||
        normalized === 'combined_score_attribute'
    )
}

/** Builds form definition description, optionally embedding locale marker when localization is enabled. */
export function buildFormDefinitionDescription(locale: string, enableLocalization: boolean): string {
    const text = translate('form_definition_description', locale)
    if (!enableLocalization) {
        return text
    }
    return `${FORM_DEFINITION_LOCALE_PREFIX}${FORM_DEFINITION_LOCALIZATION_VERSION}:${locale}|${text}`
}

/** Parses locale/version marker from a stored form definition description. */
function parseFormDefinitionLocaleMarker(description: string | undefined): ParsedFormDefinitionLocaleMarker {
    if (!description?.startsWith(FORM_DEFINITION_LOCALE_PREFIX)) {
        return {}
    }
    const rest = description.slice(FORM_DEFINITION_LOCALE_PREFIX.length)
    const separator = rest.indexOf('|')
    if (separator <= 0) {
        return {}
    }
    const tag = rest.slice(0, separator)
    const legacyLocale = normalizeLanguageCode(tag)
    if (legacyLocale) {
        return { locale: legacyLocale, version: 1 }
    }
    const versionSep = tag.indexOf(':')
    if (versionSep <= 0) {
        return {}
    }
    const version = Number.parseInt(tag.slice(0, versionSep), 10)
    const locale = normalizeLanguageCode(tag.slice(versionSep + 1))
    if (!Number.isFinite(version) || !locale) {
        return {}
    }
    return { locale, version }
}

/** Parses locale marker from a stored form definition description. */
export function parseFormDefinitionLocale(description: string | undefined): string | undefined {
    return parseFormDefinitionLocaleMarker(description).locale
}

/** Returns true when an existing form definition should be patched for the target locale. */
export function shouldRefreshLocalizedFormDefinition(
    description: string | undefined,
    formLocale: string,
    enableLocalization: boolean,
    formElements?: FormElementV2025[]
): boolean {
    if (!enableLocalization) {
        return false
    }
    const marker = parseFormDefinitionLocaleMarker(description)
    if (!marker.locale) {
        return true
    }
    if (marker.locale !== formLocale) {
        return true
    }
    if ((marker.version ?? 1) < FORM_DEFINITION_LOCALIZATION_VERSION) {
        return true
    }
    return !formDefinitionLabelsMatchLocale(formElements, formLocale)
}

/** Reads the New identity toggle label from a stored form definition tree. */
export function readNewIdentityToggleLabel(formElements: FormElementV2025[] | undefined): string | undefined {
    if (!formElements?.length) {
        return undefined
    }

    const queue: FormElementV2025[] = [...formElements]
    while (queue.length > 0) {
        const element = queue.shift()
        if (!element) continue
        if (element.key === 'newIdentity') {
            const label = (element.config as { label?: unknown } | undefined)?.label
            return label == null ? undefined : String(label)
        }

        const config = element.config as
            | {
                  formElements?: FormElementV2025[]
                  columns?: FormElementV2025[][]
              }
            | undefined
        if (config?.formElements?.length) {
            queue.push(...config.formElements)
        }
        if (config?.columns?.length) {
            for (const column of config.columns) {
                if (column?.length) {
                    queue.push(...column)
                }
            }
        }
    }

    return undefined
}

/** Returns true when stored form element labels literally match the target locale. */
export function formDefinitionLabelsMatchLocale(
    formElements: FormElementV2025[] | undefined,
    locale: string
): boolean {
    const actual = readNewIdentityToggleLabel(formElements)
    if (!actual) {
        return false
    }
    return actual === translate('form_toggle_new_identity', locale)
}

/** Localizes score row attribute labels shown on review forms and in report tables. */
export function scoreAttributeLabel(attribute: string | undefined, locale: string | undefined): string {
    const name = String(attribute ?? '').trim()
    if (!name) {
        return ''
    }
    if (isCombinedScoreAttributeName(name)) {
        return translate('combined_score_attribute', locale)
    }
    return name
}


