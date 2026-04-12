/** Typings for the CommonJS scenario runner (see scenarioRunner.js). */

export interface ScenarioRunnerPassSummary {
    includeIdentities: boolean
    threshold: number
    managedAccountsCount: number
    identitiesCount: number
    formDecisionsCount: number
    matchesCount: number
    correlatedCount: number
    unmatchedCount: number
    disablePlannedCount: number
}

export interface ScenarioRunnerPassResult {
    pass: string
    summary: ScenarioRunnerPassSummary
    matches: unknown[]
    correlatedAccounts: Array<{ identityId?: string; [key: string]: unknown }>
    unmatchedAccountIds: unknown[]
    disablePlannedAccountIds: unknown[]
    decisionsApplied: unknown[]
}

export function runPass(
    passName: string,
    config: Record<string, unknown> | undefined,
    identities: unknown,
    managedAccounts: unknown,
    forms?: unknown
): ScenarioRunnerPassResult
