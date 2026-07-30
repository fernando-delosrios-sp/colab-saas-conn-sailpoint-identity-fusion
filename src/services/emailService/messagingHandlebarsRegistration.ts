import Handlebars from 'handlebars'

import { hasValue, isDefined, missing, trimStr } from '../../utils/safeRead'

import {
    mailtoHrefForHtmlAttribute,
    maxDisplayCharsForAccountAttributeValue,
    truncateWithEllipsis,
} from './accountAttributeValueDisplay'
import { translate } from './localization'

const ALGORITHM_LABEL_KEYS: Record<string, string> = {
    'name-matcher': 'algorithm_name_matcher',
    'jaro-winkler': 'algorithm_jaro_winkler',
    lig3: 'algorithm_lig3',
    dice: 'algorithm_dice',
    'double-metaphone': 'algorithm_double_metaphone',
    binary: 'algorithm_binary',
    custom: 'algorithm_custom',
    average: 'algorithm_average',
    'weighted-mean': 'algorithm_weighted_mean',
}

const PIPELINE_PHASE_ORDER = ['Setup', 'Fetch', 'Refresh', 'Process', 'Output', 'Report'] as const

function formatDateYmd(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 'N/A'
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}/${month}/${day}`
}

function buildProcessingStatsCards(
    stats: Record<string, any>,
    locale: string | undefined
): Array<{ label: string; value: string }> {
    const cards: Array<{ label: string; value: string }> = []
    const pushCard = (labelKey: string, value: any): void => {
        if (missing(value)) return
        cards.push({ label: translate(labelKey, locale), value: String(value) })
    }

    pushCard('total_processing_time', stats.totalProcessingTime)
    pushCard('used_memory', stats.usedMemory)
    pushCard('fusion_accounts_returned', stats.totalFusionAccounts)
    pushCard('fusion_accounts_found', stats.fusionAccountsFound)
    pushCard('identities_found', stats.identitiesFound)
    pushCard('managed_accounts_found', stats.managedAccountsFound)
    pushCard('fusion_reviews_processed', stats.fusionReviewsProcessed)
    pushCard('identities_processed', stats.identitiesProcessed)
    pushCard('managed_accounts_processed', stats.managedAccountsProcessed)
    pushCard('fusion_reviews_found', stats.fusionReviewsFound)
    pushCard('fusion_review_instances_found', stats.fusionReviewInstancesFound)

    return cards
}

function registerFormatHelpers(): void {
    const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const accountAttrMaxChars = maxDisplayCharsForAccountAttributeValue()

    Handlebars.registerHelper('formatAttribute', function (this: any, value: unknown, options: any) {
        const locale = options?.data?.root?.locale
        if (!isDefined(value)) {
            return translate('not_available', locale)
        }
        if (typeof value === 'object') {
            return JSON.stringify(value)
        }
        return String(value)
    })

    Handlebars.registerHelper('i18n', function (this: any, key: string, options: any) {
        const locale = options?.data?.root?.locale
        return translate(key, locale)
    })

    /** Renders attribute values; long text is shortened with a character budget; emails become mailto links (triple braces in templates). */
    Handlebars.registerHelper('formatAccountAttributeValue', function (this: any, _attributeKey: unknown, value: unknown, options: any) {
        const locale = options?.data?.root?.locale
        if (!isDefined(value)) {
            return translate('not_available', locale)
        }
        if (typeof value === 'object') {
            const raw = JSON.stringify(value)
            const { display, title } = truncateWithEllipsis(raw, accountAttrMaxChars)
            const escDisplay = Handlebars.escapeExpression(display)
            const titleAttr = title ? ` title="${Handlebars.escapeExpression(title)}"` : ''
            return new Handlebars.SafeString(
                `<span style="word-break:break-word; overflow-wrap:anywhere;"${titleAttr}>${escDisplay}</span>`
            )
        }
        const str = trimStr(value) ?? ''
        const { display, title } = truncateWithEllipsis(str, accountAttrMaxChars)
        const escDisplay = Handlebars.escapeExpression(display)
        const titleAttr = title ? ` title="${Handlebars.escapeExpression(title)}"` : ''
        const linkStyle = 'color:#0b5cab;text-decoration:underline;'

        if (!emailAddressPattern.test(str)) {
            return new Handlebars.SafeString(
                `<span style="word-break:break-word; overflow-wrap:anywhere;"${titleAttr}>${escDisplay}</span>`
            )
        }
        const href = mailtoHrefForHtmlAttribute(str)
        const escFull = Handlebars.escapeExpression(str)
        return new Handlebars.SafeString(`<a href="${href}" title="${escFull}" style="${linkStyle}">${escDisplay}</a>`)
    })

    Handlebars.registerHelper('formatScores', function (this: any, scores: any[], options: any) {
        const locale = options?.data?.root?.locale
        if (!scores || scores.length === 0) {
            return translate('not_available', locale)
        }
        return scores
            .map((score) => {
                const num = typeof score.score === 'number' ? score.score : Number.parseFloat(String(score.score))
                const trimmedScore = Number.isFinite(num) ? parseFloat(num.toFixed(2)) : score.score
                const matchLabel = score.isMatch
                    ? translate('score_match', locale)
                    : translate('score_no_match', locale)
                return `${score.attribute}: ${trimmedScore}% (${matchLabel})`
            })
            .join(', ')
    })

    Handlebars.registerHelper('formatPercent', (value: unknown) => {
        const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
        if (Number.isNaN(num)) return '0'
        return String(Math.round(num))
    })

    Handlebars.registerHelper('formatDate', (date: string | Date) => {
        if (!date) {
            return 'N/A'
        }
        return formatDateYmd(date)
    })

    Handlebars.registerHelper('algorithmLabel', function (this: any, algorithm?: string, options: any) {
        const locale = options?.data?.root?.locale
        if (!algorithm) return translate('not_available', locale)
        const labelKey = ALGORITHM_LABEL_KEYS[String(algorithm)]
        return labelKey ? translate(labelKey, locale) : String(algorithm)
    })
}

function registerComparisonHelpers(): void {
    Handlebars.registerHelper('isFiniteNumber', (value: unknown) => typeof value === 'number' && Number.isFinite(value))

    Handlebars.registerHelper('multiply', (a: unknown, b: unknown) => {
        const left = typeof a === 'number' ? a : Number.parseFloat(String(a))
        const right = typeof b === 'number' ? b : Number.parseFloat(String(b))
        if (Number.isNaN(left) || Number.isNaN(right)) return 0
        return Math.round(left * right)
    })

    Handlebars.registerHelper('exists', (value: unknown) => {
        return hasValue(value)
    })

    Handlebars.registerHelper('anyExists', (...args: unknown[]) => {
        const values = args.slice(0, -1)
        return values.some((value) => hasValue(value))
    })

    Handlebars.registerHelper('decisionAssigned', (decisions: unknown, outcome: unknown) => {
        const decisionValue = Number.parseInt(String(decisions ?? ''), 10)
        if (!Number.isFinite(decisionValue)) return '-'
        const outcomeValue = Number.parseInt(String(outcome ?? '0'), 10)
        if (!Number.isFinite(outcomeValue)) return String(Math.max(decisionValue, 0))
        return String(Math.max(decisionValue - outcomeValue, 0))
    })

    Handlebars.registerHelper('gt', (a: number, b: number) => {
        return a > b
    })

    Handlebars.registerHelper('gte', (a: number, b: number) => {
        return a >= b
    })

    Handlebars.registerHelper('isAverageScoreRow', (attribute?: string, algorithm?: string) => {
        const attr = String(attribute ?? '')
        const alg = String(algorithm ?? '')
        return (
            attr === 'Average Score' ||
            attr === 'Combined score' ||
            attr === 'Combined match score' ||
            alg === 'average' ||
            alg === 'weighted-mean'
        )
    })
}

function registerReportHelpers(): void {
    Handlebars.registerHelper('sourceTypeLabel', function (this: any, sourceType: string, options: any) {
        const locale = options?.data?.root?.locale
        const labels: Record<string, string> = {
            authoritative: translate('authoritative', locale),
            record: translate('record', locale),
            orphan: translate('orphan', locale),
        }
        return labels[sourceType] ?? sourceType
    })

    Handlebars.registerHelper('chunk', (arr: any[], size: any) => {
        const n = Math.max(1, Number.parseInt(String(size), 10) || 1)
        if (!Array.isArray(arr) || arr.length === 0) return []
        const out: any[] = []
        for (let i = 0; i < arr.length; i += n) {
            const row = arr.slice(i, i + n)
            while (row.length < n) row.push(null)
            out.push(row)
        }
        return out
    })

    Handlebars.registerHelper('processingStatsCards', function (this: any, stats: Record<string, any>, options: any) {
        const locale = options?.data?.root?.locale
        if (!stats || typeof stats !== 'object') return []
        return buildProcessingStatsCards(stats, locale)
    })

    /** Ordered phase tiles for HTML; missing phases show an em dash. */
    Handlebars.registerHelper('orderedPhaseTimingEntries', (stats: Record<string, unknown> | null | undefined) => {
        const raw = stats?.phaseTiming
        const byPhase = new Map<string, string>()
        if (Array.isArray(raw)) {
            for (const e of raw) {
                if (e && typeof e === 'object' && typeof (e as { phase?: string }).phase === 'string') {
                    const phase = (e as { phase: string }).phase
                    const elapsed = (e as { elapsed?: unknown }).elapsed
                    byPhase.set(phase, isDefined(elapsed) ? String(elapsed) : '—')
                }
            }
        }
        return PIPELINE_PHASE_ORDER.map((phase) => ({
            phase,
            elapsed: byPhase.get(phase) ?? '—',
        }))
    })
}

/**
 * Register Handlebars helpers for common operations (email/report templates).
 */
export const registerHandlebarsHelpers = (): void => {
    registerFormatHelpers()
    registerComparisonHelpers()
    registerReportHelpers()
}

