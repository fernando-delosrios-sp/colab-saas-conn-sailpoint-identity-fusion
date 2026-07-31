import * as path from 'path'
import { tenantSlugFromBaseurl } from '../utils/url'

/** Root directory for record/replay scenario artifacts (repo-relative: `./recordings`). */
export const RECORDINGS_DIR = path.resolve('recordings')

export type ParsedRecordingScenarioRef = {
    tenant: string
    scenarioName: string
    /** Normalized `tenant/scenarioName` reference. */
    scenarioRef: string
}

/** @deprecated Use `ParsedRecordingScenarioRef`. */
export type ParsedRecordingChainRef = ParsedRecordingScenarioRef & {
    /** @deprecated Use `scenarioName`. */
    chainName: string
    /** @deprecated Use `scenarioRef`. */
    chainRef: string
}

/** Sanitize a single tenant or scenario segment for filesystem use. */
export function sanitizeRecordingSegment(segment: string): string {
    return segment.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
}

export function normalizeScenarioRefInput(scenarioRef: string): string {
    return scenarioRef.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
}

/** @deprecated Use `normalizeScenarioRefInput`. */
export function normalizeChainRefInput(chainRef: string): string {
    return normalizeScenarioRefInput(chainRef)
}

/**
 * Parses a scenario reference: `tenant/scenarioName` or bare `scenarioName` (tenant from baseurl).
 */
export function parseRecordingScenarioRef(scenarioRef: string, baseurl?: string): ParsedRecordingScenarioRef {
    const trimmed = normalizeScenarioRefInput(scenarioRef)
    if (!trimmed) {
        throw new Error('Invalid scenario reference: empty value')
    }
    if (trimmed.endsWith('/')) {
        throw new Error(
            `Invalid scenario reference: "${scenarioRef}" — scenario name is missing after "/". ` +
                'Use tenant/scenario (e.g. company12926-poc/fernando).'
        )
    }
    const slash = trimmed.indexOf('/')
    if (slash !== -1) {
        const tenant = sanitizeRecordingSegment(trimmed.slice(0, slash))
        const scenarioName = sanitizeRecordingSegment(trimmed.slice(slash + 1))
        if (!tenant || !scenarioName) {
            throw new Error(
                `Invalid scenario reference: "${scenarioRef}". Use tenant/scenario (e.g. company12926-poc/fernando).`
            )
        }
        return { tenant, scenarioName, scenarioRef: `${tenant}/${scenarioName}` }
    }
    const tenant = tenantSlugFromBaseurl(baseurl)
    const scenarioName = sanitizeRecordingSegment(trimmed)
    if (!scenarioName) {
        throw new Error(`Invalid scenario reference: ${scenarioRef}`)
    }
    return { tenant, scenarioName, scenarioRef: `${tenant}/${scenarioName}` }
}

/**
 * @deprecated Use `parseRecordingScenarioRef`.
 * Parses a chain reference: `tenant/chainName` or bare `chainName` (tenant from baseurl).
 */
export function parseRecordingChainRef(chainRef: string, baseurl?: string): ParsedRecordingChainRef {
    const parsed = parseRecordingScenarioRef(chainRef, baseurl)
    return {
        ...parsed,
        chainName: parsed.scenarioName,
        chainRef: parsed.scenarioRef,
    }
}

/** Cache/lifecycle key scoped by tenant and scenario name (`tenant/scenarioName`). */
export function recordingCacheKey(scenarioRef: string, baseurl?: string): string {
    return parseRecordingScenarioRef(scenarioRef, baseurl).scenarioRef
}

/** Absolute path to a named scenario directory under recordings/<tenant>/. */
export function recordingScenarioDir(scenarioRef: string, baseurl?: string): string {
    const { tenant, scenarioName } = parseRecordingScenarioRef(scenarioRef, baseurl)
    return path.join(RECORDINGS_DIR, tenant, scenarioName)
}

/** Repo-relative path to a named scenario directory (for manifests and scenario.json). */
export function recordingScenarioDirRelative(scenarioRef: string, baseurl?: string): string {
    const { tenant, scenarioName } = parseRecordingScenarioRef(scenarioRef, baseurl)
    return path.join('recordings', tenant, scenarioName)
}

/** @deprecated Use `recordingScenarioDir`. */
export function recordingChainDir(chainRef: string, baseurl?: string): string {
    return recordingScenarioDir(chainRef, baseurl)
}

/** @deprecated Use `recordingScenarioDirRelative`. */
export function recordingChainDirRelative(chainRef: string, baseurl?: string): string {
    return recordingScenarioDirRelative(chainRef, baseurl)
}
