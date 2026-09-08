import { FusionAccount } from '../../model/account'
import { SourceType } from '../../model/config'
import { UrlContext } from '../../utils/url'
import { capitalizeFirst } from '../../utils/attributes'
import { translate, translateWithParams, scoreAttributeLabel } from '../emailService/localization'
import { ALGORITHM_LABELS } from './constants'
import { Candidate, Score } from './types'

/** Launch-time formInput key for account-context DESCRIPTION HTML. */
export const FORM_HTML_ACCOUNT_INPUT = 'accountHtml'

/** Launch-time formInput key for candidate score-table DESCRIPTION HTML. */
export const FORM_HTML_CANDIDATES_INPUT = 'candidatesHtml'

const LINK_COLOR = '#0b5cab'
const MATCH_ROW_BG = '#f0fdf4'
const MISS_ROW_BG = '#fef2f2'
const FUSION_ROW_BG = '#e0f2fe'

const TABLE_STYLE = 'display:inline-table;width:auto;border-collapse:collapse;table-layout:auto;vertical-align:top;'
const TH_STYLE =
    'white-space:nowrap;text-align:left;padding:4px 6px;border:1px solid #eef2f7;background:#f6f8ff;color:#5f6b7a;font-size:9px;font-weight:600;'
const TD_STYLE = 'white-space:nowrap;padding:4px 6px;border:1px solid #eef2f7;color:#0f172a;font-size:9px;'

export type AccountDisplayHtmlArgs = {
    accountLabel: string
    sourceName: string
    attributes: Record<string, unknown>
    fusionFormAttributes?: string[]
    locale?: string
    urlContext?: UrlContext
    accountIscId?: string
    sourceType?: SourceType
}

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1)

const getAttrValue = (attrs: Record<string, unknown> | undefined, name: string): string =>
    String(attrs?.[name] ?? attrs?.[lowerFirst(name)] ?? '')

/**
 * HTML-escapes untrusted text for DESCRIPTION content.
 */
export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * Renders an ISC UI anchor when a URL exists; otherwise escaped plain text.
 */
export function renderIscUiLink(label: string, url: string | undefined): string {
    const text = escapeHtml(label)
    if (!url) {
        return text
    }
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:${LINK_COLOR};text-decoration:underline;">${text}</a>`
}

/**
 * Custom Forms DESCRIPTION interpolation of a launch-time formInput key.
 */
export function formInputInterpolation(key: string): string {
    return `{{$.form.input.${key}}}`
}

function isAverageScoreRow(attribute?: string, algorithm?: string): boolean {
    const attr = String(attribute ?? '')
    const alg = String(algorithm ?? '')
    return (
        attr === 'Average Score' ||
        attr === 'Combined score' ||
        attr === 'Combined match score' ||
        alg === 'average' ||
        alg === 'weighted-mean'
    )
}

function formatPercent(value: unknown): string {
    const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
    if (Number.isNaN(num)) {
        return '0'
    }
    return String(Math.round(num))
}

function algorithmLabel(algorithmKey: string, locale: string): string {
    const normalized = algorithmKey.replace(/-/g, '_')
    const key = `algorithm_${normalized}`
    const translated = translate(key, locale)
    return translated !== key ? translated : (ALGORITHM_LABELS[algorithmKey] ?? algorithmKey)
}

function scoreRowBackground(score: Score): string {
    if (isAverageScoreRow(score.attribute, score.algorithm)) {
        return FUSION_ROW_BG
    }
    return score.isMatch ? MATCH_ROW_BG : MISS_ROW_BG
}

function valueCell(score: Score): string {
    if (score.skipped || isAverageScoreRow(score.attribute, score.algorithm)) {
        return '—'
    }
    const raw = Number(score.score)
    return Number.isFinite(raw) ? `${formatPercent(raw)}%` : '—'
}

function scoreCell(score: Score): string {
    if (score.skipped) {
        return '—'
    }
    if (isAverageScoreRow(score.attribute, score.algorithm)) {
        const s = Number(score.score)
        return Number.isFinite(s) ? `${formatPercent(s)}%` : '—'
    }
    if (typeof score.weightedScore === 'number' && Number.isFinite(score.weightedScore)) {
        return `${formatPercent(score.weightedScore)}%`
    }
    return '—'
}

function thresholdCell(score: Score): string {
    const t = Number(score.fusionScore)
    return Number.isFinite(t) ? `${formatPercent(t)}%` : '—'
}

/**
 * Account context HTML: header, source, optional human-account link, configured form attributes.
 */
export function renderAccountDisplayHtml(args: AccountDisplayHtmlArgs): string {
    const locale = args.locale ?? 'en'
    const sectionKey =
        args.sourceType === SourceType.Record
            ? 'form_section_desc_record'
            : args.sourceType === SourceType.Orphan
              ? 'form_section_desc_orphan'
              : 'form_section_desc_authoritative'
    const header = escapeHtml(
        translateWithParams('form_review_required_header', locale, { sourceName: args.sourceName })
    )
    const sourceTypeNote = escapeHtml(translate(sectionKey, locale))
    const accountLink = renderIscUiLink(args.accountLabel, args.urlContext?.humanAccount(args.accountIscId))
    const sourceLabel = escapeHtml(translate('source', locale))
    const sourceValue = escapeHtml(args.sourceName)

    const attrRows = (args.fusionFormAttributes ?? [])
        .map((attrName) => {
            const label = escapeHtml(capitalizeFirst(attrName))
            const value = escapeHtml(getAttrValue(args.attributes, attrName))
            return `<tr><td style="${TD_STYLE}"><strong>${label}</strong></td><td style="${TD_STYLE}">${value}</td></tr>`
        })
        .join('')

    const attrTable = attrRows
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${TABLE_STYLE}">${attrRows}</table>`
        : ''

    return (
        `<p style="text-align:center;"><span style="font-size:18pt;color:${LINK_COLOR};"><strong>${header}</strong></span></p>` +
        `<p>${sourceTypeNote}</p>` +
        `<p style="font-size:15px;font-weight:800;color:${LINK_COLOR};">${accountLink}</p>` +
        `<p>${sourceLabel} <span style="color:${LINK_COLOR};">${sourceValue}</span></p>` +
        attrTable
    )
}

function renderCandidateScoreTable(candidate: Candidate, locale: string): string {
    const scoreRows = candidate.scores
        .filter((score) => score.attribute && score.score !== undefined)
        .map((score) => {
            const bg = scoreRowBackground(score)
            const attr = escapeHtml(scoreAttributeLabel(String(score.attribute), locale))
            const algo = escapeHtml(algorithmLabel(String(score.algorithm ?? 'unknown'), locale))
            const weight = isAverageScoreRow(score.attribute, score.algorithm) ? 'font-weight:900;' : ''
            return (
                `<tr style="background:${bg};">` +
                `<td style="${TD_STYLE}${weight}">${attr}</td>` +
                `<td style="${TD_STYLE}${weight}">${algo}</td>` +
                `<td style="${TD_STYLE}text-align:right;${weight}">${thresholdCell(score)}</td>` +
                `<td style="${TD_STYLE}text-align:right;">${valueCell(score)}</td>` +
                `<td style="${TD_STYLE}text-align:right;font-weight:900;">${scoreCell(score)}</td>` +
                `</tr>`
            )
        })
        .join('')

    if (!scoreRows) {
        return ''
    }

    const th = (key: string) => `<th style="${TH_STYLE}">${escapeHtml(translate(key, locale))}</th>`
    return (
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${TABLE_STYLE}">` +
        `<tr>${th('attribute')}${th('algorithm')}${th('threshold')}${th('value')}${th('score')}</tr>` +
        scoreRows +
        `</table>`
    )
}

/**
 * One HTML block listing every form candidate with email-aligned score tables and identity links.
 */
export function renderCandidatesDisplayHtml(candidates: Candidate[], locale = 'en', urlContext?: UrlContext): string {
    return candidates
        .filter((candidate) => candidate?.id && candidate.name)
        .map((candidate) => {
            const nameLink = renderIscUiLink(candidate.name, urlContext?.identity(candidate.id))
            const table = renderCandidateScoreTable(candidate, locale)
            return `<p style="font-size:13px;font-weight:800;color:${LINK_COLOR};">${nameLink}</p>` + table
        })
        .join('')
}

/**
 * Account-context DESCRIPTION HTML for a Fusion review, including UrlContext links when available.
 */
export function renderFusionAccountHtml(
    fusionAccount: FusionAccount,
    fusionFormAttributes: string[] | undefined,
    locale: string,
    urlContext?: UrlContext,
    sourceType?: SourceType
): string {
    const managedKey = fusionAccount.managedAccountId ?? fusionAccount.managedKey ?? ''
    const accountLabel =
        fusionAccount.identityDisplayName || fusionAccount.name || fusionAccount.displayName || managedKey
    return renderAccountDisplayHtml({
        accountLabel,
        sourceName: fusionAccount.sourceName ?? '',
        attributes: (fusionAccount.attributes ?? {}) as Record<string, unknown>,
        fusionFormAttributes,
        locale,
        urlContext,
        accountIscId: fusionAccount.iscAccountId,
        sourceType,
    })
}
