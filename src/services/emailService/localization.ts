import { locales } from './locales'

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

    // Return the two letter code if it matches any other supported languages directly
    const code = lower.substring(0, 2)
    if (locales[code]) return code

    return undefined
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
