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
 * Resolve candidate template locations across local and packaged layouts.
 *
 * Why this exists:
 * - Local development typically resolves from `src/services/messagingService/templates`.
 * - Packaged connector runtimes may place assets under different paths (for example
 *   `/app/connector/templates` or `dist/templates`), and some builds may omit the
 *   `.hbs` assets entirely.
 *
 * We search multiple known locations and then fall back to built-in template strings
 * in `compileEmailTemplates()` when optional files are missing.
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

    // Walk up from __dirname to locate project root and add stable template paths.
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

        {{#if warnings.duplicateFusionIdentities}}
        <div style="margin-top: 14px; padding: 12px; border: 1px solid #fecaca; border-left: 6px solid #ef4444; border-radius: 10px; background: #fef2f2;">
          <div style="font-size: 12px; color: #991b1b; font-weight: 800; text-transform: uppercase; margin-bottom: 6px;">Warning</div>
          <div style="font-size: 13px; color: #7f1d1d; line-height: 1.5; margin-bottom: 10px;">{{warnings.duplicateFusionIdentities.message}}</div>
          {{#if (gt warnings.duplicateFusionIdentities.occurrences.length 0)}}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
            <tr>
              <th style="text-align: left; border: 1px solid #fecaca; background: #fee2e2; color: #7f1d1d; font-size: 11px; padding: 6px 8px; text-transform: uppercase;">Identity ID</th>
              <th style="text-align: left; border: 1px solid #fecaca; background: #fee2e2; color: #7f1d1d; font-size: 11px; padding: 6px 8px; text-transform: uppercase;">Fusion Accounts</th>
              <th style="text-align: left; border: 1px solid #fecaca; background: #fee2e2; color: #7f1d1d; font-size: 11px; padding: 6px 8px; text-transform: uppercase;">Account Names / Native Identities</th>
            </tr>
            {{#each warnings.duplicateFusionIdentities.occurrences}}
            <tr>
              <td style="border: 1px solid #fecaca; color: #7f1d1d; font-size: 12px; padding: 6px 8px; word-break: break-all;">{{identityId}}</td>
              <td style="border: 1px solid #fecaca; color: #7f1d1d; font-size: 12px; padding: 6px 8px; font-weight: 700;">{{accountCount}}</td>
              <td style="border: 1px solid #fecaca; color: #7f1d1d; font-size: 12px; padding: 6px 8px;">
                {{#each accountNames}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
                {{#if nativeIdentities}} ({{#each nativeIdentities}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}){{/if}}
              </td>
            </tr>
            {{/each}}
          </table>
          {{/if}}
        </div>
        {{/if}}

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
          {{#if (gt stats.aggregationWarnings 0)}}
          <div style="margin-top: 10px; padding: 10px 12px; border: 1px solid #fde68a; border-left: 6px solid #f59e0b; border-radius: 10px; background: #fffbeb;">
            <div style="font-size: 11px; color: #92400e; font-weight: 800; text-transform: uppercase; margin-bottom: 6px;">Aggregation Warnings ({{stats.aggregationWarnings}})</div>
            {{#if stats.warningSamples}}
            <div style="font-size: 12px; color: #78350f; line-height: 1.4;">
              {{#each stats.warningSamples}}
              <div style="margin-bottom: 4px;">- {{this}}</div>
              {{/each}}
            </div>
            {{/if}}
          </div>
          {{/if}}
          {{#if (gt stats.aggregationErrors 0)}}
          <div style="margin-top: 10px; padding: 10px 12px; border: 1px solid #fecaca; border-left: 6px solid #ef4444; border-radius: 10px; background: #fef2f2;">
            <div style="font-size: 11px; color: #991b1b; font-weight: 800; text-transform: uppercase; margin-bottom: 6px;">Aggregation Errors ({{stats.aggregationErrors}})</div>
            {{#if stats.errorSamples}}
            <div style="font-size: 12px; color: #7f1d1d; line-height: 1.4;">
              {{#each stats.errorSamples}}
              <div style="margin-bottom: 4px;">- {{this}}</div>
              {{/each}}
            </div>
            {{/if}}
          </div>
          {{/if}}
        </div>
        {{/if}}

        {{#if accounts}}
          {{#each accounts}}
          <div style="margin-top: 18px; border: 1px solid #e6ebf5; border-radius: 10px; padding: 14px;">
            <div style="width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate; border-spacing:0; width:auto; min-width:100%;">
                <tr>
                  <td style="width:280px; min-width:280px; max-width:280px; vertical-align:top; padding-right:14px; border-right:1px solid #eef2f7;">
                    <div style="color:#0b5cab; font-size:18px; font-weight:800; margin:0 0 6px 0;">{{accountName}}</div>
                    <div style="font-size:12px; color:#5f6b7a; margin-bottom:10px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;">
                        <tr>
                          <td style="font-weight:800; white-space:nowrap; padding:2px 8px 2px 0;">Source:</td>
                          <td style="padding:2px 8px;">{{accountSource}} {{#if sourceType}}<span style="display:inline-block; margin-left:4px; padding:1px 6px; border-radius:6px; background:#eef2f7; color:#5f6b7a; font-size:10px; font-weight:700; text-transform:capitalize;">{{sourceTypeLabel sourceType}}</span>{{/if}}</td>
                        </tr>
                        {{#if accountId}}
                        <tr>
                          <td style="font-weight:800; white-space:nowrap; padding:2px 8px 2px 0;">ID:</td>
                          <td style="padding:2px 8px; white-space:nowrap; word-break:keep-all;">{{accountId}}</td>
                        </tr>
                        {{/if}}
                        {{#if accountEmail}}
                        <tr>
                          <td style="font-weight:800; white-space:nowrap; padding:2px 8px 2px 0;">Email:</td>
                          <td style="padding:2px 8px; word-break:break-all;">{{accountEmail}}</td>
                        </tr>
                        {{/if}}
                      </table>
                    </div>

                    {{#if accountAttributes}}
                    <div style="color:#0b5cab; font-size:12px; font-weight:900; letter-spacing:0.35px; text-transform:uppercase; margin:12px 0 8px 0;">Attributes</div>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;">
                      {{#each accountAttributes}}
                      <tr>
                        <td style="padding:6px 8px; font-size:12px; color:#5f6b7a; font-weight:700; border:1px solid #eef2f7; background:#f8fbff; width:40%;">{{@key}}</td>
                        <td style="padding:6px 8px; font-size:12px; color:#0f172a; border:1px solid #eef2f7;">{{formatAttribute this}}</td>
                      </tr>
                      {{/each}}
                    </table>
                    {{/if}}
                  </td>
                  <td style="vertical-align:top; padding-left:14px;">
                    {{#if error}}
                    <div style="padding:16px 18px; background:#fef2f2; border:1px solid #fecaca; border-left:6px solid #ef4444; border-radius:10px;">
                      <div style="font-size:12px; color:#991b1b; font-weight:900; letter-spacing:0.35px; text-transform:uppercase; margin-bottom:6px;">Error</div>
                      <div style="font-size:13px; color:#7f1d1d; line-height:1.5;">{{error}}</div>
                    </div>
                    {{else}}
                    {{#if matches}}
                    {{#if (gt matches.length 0)}}
                    <div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:12px;">
                        <tr>
                        {{#each matches}}
                        <td valign="top" width="280" style="width:280px; vertical-align:top; padding:6px;">
                          <table role="presentation" width="280" cellpadding="0" cellspacing="0" border="0" style="width:280px; border-collapse:collapse;">
                            <tr>
                              <td colspan="4" style="font-weight:900; padding:6px 8px; border-bottom:1px solid #e0e0e0; color:#0b5cab; font-size:12px; letter-spacing:0.35px; text-transform:uppercase; white-space:nowrap;">
                                Potential Matches
                              </td>
                            </tr>
                            <tr>
                              <td colspan="4" style="padding:6px 8px;">
                                <div style="font-size:14px; font-weight:800; color:#0b5cab; line-height:1.3; word-wrap:break-word;">
                                  {{#if identityUrl}}
                                  <a href="{{identityUrl}}" style="color:#0b5cab; text-decoration:underline; word-wrap:break-word;">{{identityName}}</a>
                                  {{else}}
                                  {{identityName}}
                                  {{/if}}
                                </div>
                              </td>
                            </tr>
                            {{#if scores}}
                            <tr>
                              <th width="90" style="width:90px; text-align:left; padding:6px 4px; border:1px solid #eef2f7; background:#f6f8ff; color:#5f6b7a; font-size:10px; font-weight:600;">Attribute</th>
                              <th width="110" style="width:110px; text-align:left; padding:6px 4px; border:1px solid #eef2f7; background:#f6f8ff; color:#5f6b7a; font-size:10px; font-weight:600;">Algorithm</th>
                              <th width="40" style="width:40px; text-align:right; padding:6px 4px; border:1px solid #eef2f7; background:#f6f8ff; color:#5f6b7a; font-size:10px; font-weight:600;">Score</th>
                              <th width="40" style="width:40px; text-align:right; padding:6px 4px; border:1px solid #eef2f7; background:#f6f8ff; color:#5f6b7a; font-size:10px; font-weight:600;">Threshold</th>
                            </tr>
                            {{#each scores}}
                            <tr style="background:{{#if (isAverageScoreRow attribute algorithm)}}#e0f2fe{{else}}{{#if isMatch}}#f0fdf4{{else}}#fef2f2{{/if}}{{/if}};">
                              <td width="90" style="width:90px; padding:6px 4px; border:1px solid #eef2f7; color:#0f172a; font-size:10px; {{#if (isAverageScoreRow attribute algorithm)}}font-weight:900;{{/if}}">{{attribute}}</td>
                              <td width="110" style="width:110px; padding:6px 4px; border:1px solid #eef2f7; color:#0f172a; font-size:10px; {{#if (isAverageScoreRow attribute algorithm)}}font-weight:900;{{/if}}">{{algorithmLabel algorithm}}</td>
                              <td width="40" style="width:40px; padding:6px 4px; border:1px solid #eef2f7; color:#0f172a; text-align:right; font-weight:900; font-size:10px;">{{formatPercent score}}%</td>
                              <td width="40" style="width:40px; padding:6px 4px; border:1px solid #eef2f7; color:#0f172a; text-align:right; font-size:10px; {{#if (isAverageScoreRow attribute algorithm)}}font-weight:900;{{/if}}">{{formatPercent fusionScore}}%</td>
                            </tr>
                            {{/each}}
                            {{/if}}
                          </table>
                        </td>
                        {{/each}}
                        </tr>
                      </table>
                    </div>
                    {{else}}
                    <div style="color:#999; font-style:italic; padding:20px; background-color:#f8f9fa; border-radius:4px; text-align:center;">No potential matches found for this account.</div>
                    {{/if}}
                    {{else}}
                    <div style="color:#999; font-style:italic; padding:20px; background-color:#f8f9fa; border-radius:4px; text-align:center;">No potential matches found for this account.</div>
                    {{/if}}
                    {{/if}}
                  </td>
                </tr>
              </table>
            </div>
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
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Identity Fusion Review Required</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: none;
            margin: 0;
            padding: 0;
            background: linear-gradient(180deg, #f3f6fb 0%, #ffffff 100%);
        }

        /* Responsive stacking for main columns only (keep match row horizontal) */
        @media only screen and (max-width:600px) {
            .main-col {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
            }
        }
    </style>
</head>
<body style="margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; background:#f3f6fb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%; border-collapse:collapse;">
        <tr>
            <td align="center" style="padding:0 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;">
                    <tr>
                        <td style="padding:12px 0;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:separate; border-spacing:0; background:#ffffff; border:1px solid #e6ebf5; border-radius:14px; box-shadow:0 12px 30px rgba(16,24,40,0.12);">
                                <tr>
                                    <td style="padding:20px;">
                                        <div style="padding-bottom:18px; margin-bottom:22px; border-bottom:1px solid #e6ebf5;">
                                            <div style="margin-bottom:12px;">
                                                <h1 style="margin:0; color:#0b5cab; font-size:26px; letter-spacing:-0.2px;">Identity Fusion Review Required</h1>
                                                <div style="color:#5f6b7a; font-size:13px; margin-top:6px;">
                                                    Please review the potential duplicate and take appropriate action.
                                                </div>
                                                {{#each accounts}}
                                                {{#if accountSource}}
                                                <div style="color:#5f6b7a; font-size:12px; margin-top:8px; font-weight:600;">
                                                    Source: <span style="color:#0b5cab;">{{accountSource}}</span>
                                                    {{#if sourceType}}<span style="display:inline-block; margin-left:6px; padding:1px 8px; border-radius:8px; background:#eef2f7; color:#5f6b7a; font-size:11px; font-weight:700; text-transform:capitalize;">{{sourceTypeLabel sourceType}}</span>{{/if}}
                                                </div>
                                                {{/if}}
                                                {{/each}}
                                                {{#if formUrl}}
                                                <div style="margin-top:12px;">
                                                    <a href="{{formUrl}}" style="display:inline-block; padding:10px 14px; border-radius:10px; background:#0b5cab; color:#ffffff; font-weight:900; font-size:13px; text-decoration:none;">
                                                        Open Review Form
                                                    </a>
                                                </div>
                                                {{/if}}
                                            </div>
                                            <!-- No "potential duplicates" count in review email -->
                                        </div>

                                        {{#each accounts}}
                                        <div style="margin-bottom:28px; border:1px solid #e6ebf5; border-radius:14px; padding:18px; background:#ffffff; box-shadow:0 10px 24px rgba(16,24,40,0.08);">
                                            <div style="width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;">
                                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; width:auto; min-width:100%;">
                                                    <tr>
                                                    <!-- Left: duplicate account summary -->
                                                    <td class="main-col" valign="top" style="width:280px; min-width:280px; max-width:280px; vertical-align:top; padding:8px; border-right:1px solid #eef2f7;">
                                                        <div style="color:#0b5cab; font-size:18px; font-weight:800; margin:0 0 6px 0;">{{accountName}}</div>
                                                        <div style="font-size:12px; color:#5f6b7a; margin-bottom:10px;">
                                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;">
                                                                <tr>
                                                                    <td style="font-weight:800; white-space:nowrap; padding:2px 8px 2px 0;">Source:</td>
                                                                    <td style="padding:2px 8px;">{{accountSource}} {{#if sourceType}}<span style="display:inline-block; margin-left:4px; padding:1px 6px; border-radius:6px; background:#eef2f7; color:#5f6b7a; font-size:10px; font-weight:700; text-transform:capitalize;">{{sourceTypeLabel sourceType}}</span>{{/if}}</td>
                                                                </tr>
                                                                {{#if accountId}}
                                                                <tr>
                                                                    <td style="font-weight:800; white-space:nowrap; padding:2px 8px 2px 0;">ID:</td>
                                                                    <td style="padding:2px 8px; white-space:nowrap; word-break:keep-all;">{{accountId}}</td>
                                                                </tr>
                                                                {{/if}}
                                                                {{#if accountEmail}}
                                                                <tr>
                                                                    <td style="font-weight:800; white-space:nowrap; padding:2px 8px 2px 0;">Email:</td>
                                                                    <td style="padding:2px 8px; word-break:break-all;">{{accountEmail}}</td>
                                                                </tr>
                                                                {{/if}}
                                                            </table>
                                                        </div>

                                                        {{#if accountAttributes}}
                                                        <div style="color:#0b5cab; font-size:12px; font-weight:900; letter-spacing:0.35px; text-transform:uppercase; margin:12px 0 8px 0;">Attributes</div>
                                                        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%; border-collapse:collapse;">
                                                            {{#each accountAttributes}}
                                                            <tr>
                                                                <td style="padding:6px 8px; font-size:12px; color:#5f6b7a; font-weight:700; border:1px solid #eef2f7; background:#f8fbff; width:40%;">{{@key}}</td>
                                                                <td style="padding:6px 8px; font-size:12px; color:#0f172a; border:1px solid #eef2f7;">{{formatAttribute this}}</td>
                                                            </tr>
                                                            {{/each}}
                                                        </table>
                                                        {{/if}}
                                                    </td>

                                                    <!-- Right: matches (report-style) -->
                                                    <td class="main-col" valign="top" style="vertical-align:top; padding:8px;">
                                                        {{#if matches}}
                                                        {{#if (gt matches.length 0)}}
                                                        <div style="overflow-x:auto; -webkit-overflow-scrolling:touch;">
                                                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:12px;">
                                                                <tr>
                                                                {{#each matches}}
                                                                <td valign="top" width="280" style="width:280px; vertical-align:top; padding:4px;">
                                                                    <table role="presentation" width="280" cellpadding="0" cellspacing="0" border="0" style="width:280px; border-collapse:collapse;">
                                                                        <tr>
                                                                            <td colspan="4" style="font-weight:900; padding:6px 8px; border-bottom:1px solid #e0e0e0; color:#0b5cab; font-size:12px; letter-spacing:0.35px; text-transform:uppercase; white-space:nowrap;">
                                                                                Potential Matches
                                                                            </td>
                                                                        </tr>
                                                                        <tr>
                                                                            <td colspan="4" style="padding:6px 8px;">
                                                                                <div style="font-size:14px; font-weight:800; color:#0b5cab; line-height:1.3; word-wrap:break-word;">
                                                                                    {{#if identityUrl}}
                                                                                    <a href="{{identityUrl}}" style="color:#0b5cab; text-decoration:underline; word-wrap:break-word;">{{identityName}}</a>
                                                                                    {{else}}
                                                                                    {{identityName}}
                                                                                    {{/if}}
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                        {{#if scores}}
                                                                        <tr>
                                                                            <th width="90" style="width:90px; text-align:left; padding:6px 4px; border:1px solid #eef2f7; background:#f6f8ff; color:#5f6b7a; font-size:10px; font-weight:600;">Attribute</th>
                                                                            <th width="110" style="width:110px; text-align:left; padding:6px 4px; border:1px solid #eef2f7; background:#f6f8ff; color:#5f6b7a; font-size:10px; font-weight:600;">Algorithm</th>
                                                                            <th width="40" style="width:40px; text-align:right; padding:6px 4px; border:1px solid #eef2f7; background:#f6f8ff; color:#5f6b7a; font-size:10px; font-weight:600;">Score</th>
                                                                            <th width="40" style="width:40px; text-align:right; padding:6px 4px; border:1px solid #eef2f7; background:#f6f8ff; color:#5f6b7a; font-size:10px; font-weight:600;">Threshold</th>
                                                                        </tr>
                                                                        {{#each scores}}
                                                                        <tr style="background:{{#if (isAverageScoreRow attribute algorithm)}}#e0f2fe{{else}}{{#if isMatch}}#f0fdf4{{else}}#fef2f2{{/if}}{{/if}};">
                                                                            <td width="90" style="width:90px; padding:6px 4px; border:1px solid #eef2f7; color:#0f172a; font-size:10px; {{#if (isAverageScoreRow attribute algorithm)}}font-weight:900;{{/if}}">{{attribute}}</td>
                                                                            <td width="110" style="width:110px; padding:6px 4px; border:1px solid #eef2f7; color:#0f172a; font-size:10px; {{#if (isAverageScoreRow attribute algorithm)}}font-weight:900;{{/if}}">{{algorithmLabel algorithm}}</td>
                                                                            <td width="40" style="width:40px; padding:6px 4px; border:1px solid #eef2f7; color:#0f172a; text-align:right; font-weight:900; font-size:10px;">{{formatPercent score}}%</td>
                                                                            <td width="40" style="width:40px; padding:6px 4px; border:1px solid #eef2f7; color:#0f172a; text-align:right; font-size:10px; {{#if (isAverageScoreRow attribute algorithm)}}font-weight:900;{{/if}}">{{formatPercent fusionScore}}%</td>
                                                                        </tr>
                                                                        {{/each}}
                                                                        {{/if}}
                                                                    </table>
                                                                </td>
                                                                {{/each}}
                                                        </tr>
                                                    </table>
                                                </div>
                                                        {{else}}
                                                        <div style="color:#999; font-style:italic; padding:14px; background-color:#f8f9fa; border-radius:4px; text-align:center;">
                                                            No potential matches found for this account.
                                                        </div>
                                                        {{/if}}
                                                        {{else}}
                                                        <div style="color:#999; font-style:italic; padding:14px; background-color:#f8f9fa; border-radius:4px; text-align:center;">
                                                            No potential matches found for this account.
                                                        </div>
                                                        {{/if}}
                                                    </td>
                                                    </tr>
                                                </table>
                                            </div>
                                        </div>
                                        {{/each}}

                                        <div style="margin-top:28px; padding-top:18px; border-top:1px solid #e6ebf5; color:#5f6b7a; font-size:13px; text-align:center;">
                                            This review was generated by the Identity Fusion NG Connector.
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`

/**
 * Load a template from disk if available.
 *
 * For optional templates (`required = false`) this returns `undefined` instead of
 * throwing, allowing callers to use in-code defaults and avoid ENOENT startup/test
 * failures in packaged environments where template files are not present.
 */
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

    // Report template: prefer file-based `.hbs`, otherwise use the built-in fallback.
    const fusionReportTemplateFromFile = loadTemplate('fusion-report.hbs', false)
    if (!fusionReportTemplateFromFile) {
        process.stderr.write('[MessagingService] fusion-report.hbs not found; using built-in fallback template\n')
    }
    const fusionReportTemplate = fusionReportTemplateFromFile ?? DEFAULT_FUSION_REPORT_TEMPLATE
    templates.set('fusion-report', Handlebars.compile(fusionReportTemplate))

    // Review template: packaged builds have historically missed this file.
    // Keep this optional so email generation still works with fallback HTML.
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
        throw new ConnectorError(
            'Fusion review email template not found. Email templates may not have been compiled correctly.',
            ConnectorErrorType.Generic
        )
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
        throw new ConnectorError(
            'Edit request email template not found. Email templates may not have been compiled correctly.',
            ConnectorErrorType.Generic
        )
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
        throw new ConnectorError(
            'Fusion report email template not found. Email templates may not have been compiled correctly.',
            ConnectorErrorType.Generic
        )
    }
    return template(data)
}
