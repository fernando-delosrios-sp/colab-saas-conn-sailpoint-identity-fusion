import fs from 'fs'
import path from 'path'
import Handlebars from 'handlebars'
import type { TemplateDelegate as HandlebarsTemplateDelegate } from 'handlebars'
import { ConnectorError, ConnectorErrorType } from '@sailpoint/connector-sdk'

// ============================================================================
// Handlebars Helpers
// ============================================================================

/**
 * Register Handlebars helpers for common operations
 */
export const registerHandlebarsHelpers = (): void => {
    const algorithmLabels: Record<string, string> = {
        'name-matcher': 'Name Matcher',
        'jaro-winkler': 'Jaro-Winkler',
        lig3: 'LIG3',
        dice: 'Dice',
        'double-metaphone': 'Double Metaphone',
        custom: 'Custom',
        average: 'Average Score',
    }

    // Format attribute values for display
    Handlebars.registerHelper('formatAttribute', (value: any) => {
        if (value === null || value === undefined) {
            return 'N/A'
        }
        if (typeof value === 'object') {
            return JSON.stringify(value)
        }
        return String(value)
    })

    // Format scores for display
    Handlebars.registerHelper('formatScores', (scores: any[]) => {
        if (!scores || scores.length === 0) {
            return 'N/A'
        }
        return scores
            .map((score) => {
                const num = typeof score.score === 'number' ? score.score : Number.parseFloat(String(score.score))
                const trimmedScore = Number.isFinite(num) ? parseFloat(num.toFixed(2)) : score.score
                return `${score.attribute}: ${trimmedScore}% (${score.isMatch ? 'Match' : 'No Match'})`
            })
            .join(', ')
    })

    // Format numeric percentages to 0 decimals
    Handlebars.registerHelper('formatPercent', (value: any) => {
        const num = typeof value === 'number' ? value : Number.parseFloat(String(value))
        if (Number.isNaN(num)) return '0'
        return String(Math.round(num))
    })

    // Simple numeric multiply helper (useful for width calculations)
    Handlebars.registerHelper('multiply', (a: any, b: any) => {
        const left = typeof a === 'number' ? a : Number.parseFloat(String(a))
        const right = typeof b === 'number' ? b : Number.parseFloat(String(b))
        if (Number.isNaN(left) || Number.isNaN(right)) return 0
        return Math.round(left * right)
    })

    // Check if value exists
    Handlebars.registerHelper('exists', (value: any) => {
        return value !== null && value !== undefined && value !== ''
    })

    // Greater than helper
    Handlebars.registerHelper('gt', (a: number, b: number) => {
        return a > b
    })

    // Greater than or equal helper
    Handlebars.registerHelper('gte', (a: number, b: number) => {
        return a >= b
    })

    // Format date
    Handlebars.registerHelper('formatDate', (date: string | Date) => {
        if (!date) {
            return 'N/A'
        }
        const d = typeof date === 'string' ? new Date(date) : date
        return d.toLocaleDateString()
    })

    // Friendly algorithm names (aligned with connector-spec.json)
    Handlebars.registerHelper('algorithmLabel', (algorithm?: string) => {
        if (!algorithm) return 'N/A'
        return algorithmLabels[String(algorithm)] ?? String(algorithm)
    })

    // Identify the "Average Score" rollup row
    Handlebars.registerHelper('isAverageScoreRow', (attribute?: string, algorithm?: string) => {
        const attr = String(attribute ?? '')
        const alg = String(algorithm ?? '')
        return attr === 'Average Score' || alg === 'average'
    })

    // Render a human-readable label for source type
    Handlebars.registerHelper('sourceTypeLabel', (sourceType: string) => {
        const labels: Record<string, string> = {
            authoritative: 'Authoritative',
            record: 'Record',
            orphan: 'Orphan',
        }
        return labels[sourceType] ?? sourceType
    })

    // Chunk an array into rows for table rendering
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
}

// ============================================================================
// Template Compilation
// ============================================================================

/**
 * Resolve template files across local dev and packaged runtime layouts.
 */
const resolveTemplateSearchDirectories = (): string[] => {
    const directories = new Set<string>([
        path.join(__dirname, 'templates'),
        path.join(__dirname, '..', 'templates'),
        path.join(__dirname, '..', '..', 'templates'),
        path.join(__dirname, '..', 'src', 'services', 'messagingService', 'templates'),
        path.join(process.cwd(), 'templates'),
        path.join(process.cwd(), 'src', 'services', 'messagingService', 'templates'),
    ])

    // Walk up from __dirname to locate repository root and add stable template paths.
    let currentDir = __dirname
    for (let depth = 0; depth < 8; depth++) {
        const packageJsonPath = path.join(currentDir, 'package.json')
        if (fs.existsSync(packageJsonPath)) {
            directories.add(path.join(currentDir, 'templates'))
            directories.add(path.join(currentDir, 'dist', 'templates'))
            directories.add(path.join(currentDir, 'src', 'services', 'messagingService', 'templates'))
            break
        }
        const parentDir = path.dirname(currentDir)
        if (parentDir === currentDir) break
        currentDir = parentDir
    }

    return Array.from(directories)
}

const DEFAULT_FUSION_REPORT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<body style="font-family: Arial, sans-serif; color: #1f2937; margin: 0; padding: 20px; background: #f7f9fc;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 920px; margin: 0 auto; background: #ffffff; border: 1px solid #e6ebf5; border-radius: 12px; box-shadow: 0 8px 20px rgba(16,24,40,0.08);">
    <tr>
      <td style="padding: 20px 22px;">
        <h1 style="margin: 0; color: #0b5cab; font-size: 24px;">Identity Fusion Report</h1>
        <p style="margin: 8px 0 0 0; color: #5f6b7a; font-size: 13px;">Fallback template in use (packaged report template not found).</p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 18px; border-collapse: collapse;">
          <tr>
            <td width="50%" style="padding: 6px 8px 6px 0;">
              <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Report Date</div>
                <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{formatDate reportDate}}</div>
              </div>
            </td>
            <td width="50%" style="padding: 6px 0 6px 8px;">
              <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Potential Duplicates</div>
                <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{potentialDuplicates}}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 6px 0 0 0;">
              <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Total Accounts Analyzed</div>
                <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{totalAccounts}}</div>
              </div>
            </td>
          </tr>
        </table>

        {{#if stats}}
        <div style="margin-top: 18px;">
          <div style="font-size: 12px; color: #0b5cab; font-weight: 800; text-transform: uppercase; margin-bottom: 8px;">Processing Statistics</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.totalFusionAccounts)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Total Fusion Accounts</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.totalFusionAccounts}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.fusionReviewsCreated)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Fusion Reviews Created</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewsCreated}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.fusionReviewAssignments)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Fusion Review Assignments</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewAssignments}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.fusionReviewNewIdentities)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Fusion Review New Identities</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewNewIdentities}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.fusionReviewNonMatches)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Fusion Review Non-Matches</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewNonMatches}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.identitiesFound)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Identities Found</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.identitiesFound}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.managedAccountsFound)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Managed Accounts Found</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.managedAccountsFound}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.managedAccountsProcessed)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Managed Accounts Processed</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.managedAccountsProcessed}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.managedAccountsFoundAuthoritative)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Managed Found (A)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.managedAccountsFoundAuthoritative}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.managedAccountsFoundOrphan)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Managed Found (O)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.managedAccountsFoundOrphan}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.managedAccountsFoundRecord)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Managed Found (R)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.managedAccountsFoundRecord}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.managedAccountsProcessedAuthoritative)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Managed Processed (A)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.managedAccountsProcessedAuthoritative}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.managedAccountsProcessedOrphan)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Managed Processed (O)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.managedAccountsProcessedOrphan}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.managedAccountsProcessedRecord)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Managed Processed (R)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.managedAccountsProcessedRecord}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.fusionReviewDecisionsAuthoritative)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Review Decisions (A)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewDecisionsAuthoritative}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.fusionReviewDecisionsOrphan)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Review Decisions (O)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewDecisionsOrphan}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.fusionReviewDecisionsRecord)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Review Decisions (R)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewDecisionsRecord}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.fusionReviewNewIdentitiesAuthoritative)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Decision Outcome (A new)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewNewIdentitiesAuthoritative}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.fusionReviewNoMatchesOrphan)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Decision Outcome (O no-match)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewNoMatchesOrphan}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.fusionReviewNoMatchesRecord)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Decision Outcome (R no-match)</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.fusionReviewNoMatchesRecord}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 6px 8px 6px 0;">
                {{#if (exists stats.totalProcessingTime)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Total Processing Time</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.totalProcessingTime}}</div>
                </div>
                {{/if}}
              </td>
              <td width="50%" style="padding: 6px 0 6px 8px;">
                {{#if (exists stats.usedMemory)}}
                <div style="border: 1px solid #e6ebf5; border-radius: 10px; padding: 10px;">
                  <div style="font-size: 11px; color: #5f6b7a; font-weight: 700; text-transform: uppercase;">Used Memory</div>
                  <div style="font-size: 16px; color: #0f172a; font-weight: 700;">{{stats.usedMemory}}</div>
                </div>
                {{/if}}
              </td>
            </tr>
          </table>
        </div>
        {{/if}}

        {{#if accounts}}
          {{#each accounts}}
          <div style="margin-top: 18px; border: 1px solid #e6ebf5; border-radius: 10px; padding: 14px;">
            <div style="font-size: 17px; color: #0b5cab; font-weight: 700;">{{accountName}}</div>
            <div style="font-size: 13px; color: #5f6b7a; margin-top: 4px;">
              <strong>Source:</strong> {{accountSource}}
              {{#if sourceType}} | <strong>Type:</strong> {{sourceTypeLabel sourceType}}{{/if}}
              {{#if accountId}} | <strong>ID:</strong> {{accountId}}{{/if}}
              {{#if accountEmail}} | <strong>Email:</strong> {{accountEmail}}{{/if}}
            </div>

            {{#if error}}
              <div style="margin-top: 10px; padding: 10px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b;">
                <strong>Error:</strong> {{error}}
              </div>
            {{else}}
              {{#if matches}}
                {{#if (gt matches.length 0)}}
                  <ul style="margin: 10px 0 0 16px; padding: 0;">
                    {{#each matches}}
                    <li style="margin-bottom: 8px;">
                      <strong>{{identityName}}</strong>
                      {{#if identityId}} ({{identityId}}){{/if}}
                      {{#if scores}}
                        <div style="margin-top: 4px; color: #4b5563; font-size: 12px;">{{formatScores scores}}</div>
                      {{/if}}
                    </li>
                    {{/each}}
                  </ul>
                {{else}}
                  <p style="margin: 10px 0 0 0; color: #6b7280;">No potential matches found for this account.</p>
                {{/if}}
              {{else}}
                <p style="margin: 10px 0 0 0; color: #6b7280;">No potential matches found for this account.</p>
              {{/if}}
            {{/if}}
          </div>
          {{/each}}
        {{else}}
          <p style="margin: 18px 0 0 0; color: #6b7280;">No accounts included in this report.</p>
        {{/if}}
      </td>
    </tr>
  </table>
</body>
</html>`

const DEFAULT_FUSION_REVIEW_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<body style="font-family: Arial, sans-serif; color: #333;">
  <h2>Identity Fusion Review Required</h2>
  <p>Please review the potential duplicate account match.</p>
  {{#if formUrl}}
    <p><a href="{{formUrl}}">Open Review Form</a></p>
  {{/if}}
  {{#each accounts}}
    <hr />
    <p><strong>Account:</strong> {{accountName}}</p>
    <p><strong>Source:</strong> {{accountSource}}</p>
    {{#if matches}}
      <ul>
        {{#each matches}}
          <li>{{identityName}}</li>
        {{/each}}
      </ul>
    {{else}}
      <p>No potential matches found.</p>
    {{/if}}
  {{/each}}
</body>
</html>`

const loadTemplate = (filename: string, required = true): string | undefined => {
    const templateSearchDirectories = resolveTemplateSearchDirectories()
    for (const directory of templateSearchDirectories) {
        const filePath = path.join(directory, filename)
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8')
        }
    }

    if (!required) {
        return undefined
    }

    throw new ConnectorError(
        `Email template "${filename}" not found. Searched: ${templateSearchDirectories.join(', ')}`,
        ConnectorErrorType.Generic
    )
}

export const compileEmailTemplates = (): Map<string, HandlebarsTemplateDelegate> => {
    const templates = new Map<string, HandlebarsTemplateDelegate>()
    const fusionReportTemplateFromFile = loadTemplate('fusion-report.hbs', false)
    if (!fusionReportTemplateFromFile) {
        process.stderr.write('[MessagingService] fusion-report.hbs not found; using built-in fallback template\n')
    }
    const fusionReportTemplate = fusionReportTemplateFromFile ?? DEFAULT_FUSION_REPORT_TEMPLATE
    templates.set('fusion-report', Handlebars.compile(fusionReportTemplate))

    // Some packaged builds may not ship fusion-review.hbs.
    const fusionReviewTemplateFromFile = loadTemplate('fusion-review.hbs', false)
    if (!fusionReviewTemplateFromFile) {
        process.stderr.write('[MessagingService] fusion-review.hbs not found; using built-in fallback template\n')
    }
    const fusionReviewTemplate = fusionReviewTemplateFromFile ?? DEFAULT_FUSION_REVIEW_TEMPLATE
    templates.set('fusion-review', Handlebars.compile(fusionReviewTemplate))
    return templates
}

// ============================================================================
// Template Rendering Types
// ============================================================================

/**
 * Review email uses the same data shape as the report (single-account report),
 * plus the standalone form URL for actioning the review.
 */
export type FusionReviewEmailData = {
    accounts: FusionReportEmailData['accounts']
    totalAccounts: number
    potentialDuplicates: number
    reportDate: Date | string
    formInstanceId?: string
    formUrl?: string
}

export type EditRequestEmailData = {
    accountName: string
    accountSource: string
    accountAttributes: Record<string, any>
    formInstanceId?: string
}

export type FusionReportEmailData = {
    accounts: Array<{
        accountName: string
        accountSource: string
        sourceType?: 'authoritative' | 'record' | 'orphan'
        accountId?: string
        accountEmail?: string
        accountAttributes?: Record<string, any>
        error?: string
        matches: Array<{
            identityName: string
            identityId?: string
            identityUrl?: string
            isMatch: boolean
            scores?: Array<{
                attribute: string
                algorithm?: string
                score: number
                fusionScore?: number
                isMatch: boolean
                comment?: string
            }>
        }>
    }>
    totalAccounts: number
    potentialDuplicates: number
    reportDate: Date | string
    stats?: {
        totalFusionAccounts?: number
        fusionReviewsCreated?: number
        fusionReviewAssignments?: number
        fusionReviewNewIdentities?: number
        fusionReviewNonMatches?: number
        fusionReviewDecisionsAuthoritative?: number
        fusionReviewDecisionsRecord?: number
        fusionReviewDecisionsOrphan?: number
        fusionReviewNewIdentitiesAuthoritative?: number
        fusionReviewNoMatchesRecord?: number
        fusionReviewNoMatchesOrphan?: number
        identitiesFound?: number
        managedAccountsFound?: number
        managedAccountsFoundAuthoritative?: number
        managedAccountsFoundRecord?: number
        managedAccountsFoundOrphan?: number
        managedAccountsProcessed?: number
        managedAccountsProcessedAuthoritative?: number
        managedAccountsProcessedRecord?: number
        managedAccountsProcessedOrphan?: number
        totalProcessingTime?: string
        usedMemory?: string
    }
}

// ============================================================================
// Template Rendering Functions
// ============================================================================

/**
 * Render fusion review email template
 */
export const renderFusionReviewEmail = (
    templates: Map<string, HandlebarsTemplateDelegate>,
    data: FusionReviewEmailData
): string => {
    const template = templates.get('fusion-review')
    if (!template) {
        throw new ConnectorError('Fusion review email template not found. Email templates may not have been compiled correctly.', ConnectorErrorType.Generic)
    }
    return template(data)
}

/**
 * Render edit request email template
 */
export const renderEditRequestEmail = (
    templates: Map<string, HandlebarsTemplateDelegate>,
    data: EditRequestEmailData
): string => {
    const template = templates.get('edit-request')
    if (!template) {
        throw new ConnectorError('Edit request email template not found. Email templates may not have been compiled correctly.', ConnectorErrorType.Generic)
    }
    return template(data)
}

/**
 * Render fusion report email template
 */
export const renderFusionReport = (
    templates: Map<string, HandlebarsTemplateDelegate>,
    data: FusionReportEmailData
): string => {
    const template = templates.get('fusion-report')
    if (!template) {
        throw new ConnectorError('Fusion report email template not found. Email templates may not have been compiled correctly.', ConnectorErrorType.Generic)
    }
    return template(data)
}
