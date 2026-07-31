/**
 * URL utility functions for building ISC UI URLs and API endpoints.
 * Centralizes URL construction logic used across the codebase.
 */

/** Fallback tenant segment when baseurl is missing or unparseable. */
export const UNKNOWN_TENANT_SLUG = 'unknown-tenant'

/**
 * Derives a filesystem-safe tenant slug from an ISC API base URL.
 * Uses the first hostname label (e.g. `acme` from `acme.api.identitynow.com`).
 */
export function tenantSlugFromBaseurl(baseurl: string | undefined): string {
    if (!baseurl || typeof baseurl !== 'string' || !baseurl.trim()) {
        return UNKNOWN_TENANT_SLUG
    }
    try {
        let host = new URL(baseurl.trim()).hostname
        if (host.startsWith('[') && host.endsWith(']')) {
            host = host.slice(1, -1)
        }
        let segment: string
        if (host.includes(':')) {
            segment = host.replace(/[^a-fA-F0-9:._-]+/g, '_').replace(/:/g, '_')
        } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
            segment = host.replace(/\./g, '_')
        } else {
            const dot = host.indexOf('.')
            segment = dot === -1 ? host : host.slice(0, dot)
        }
        const safe = segment.replace(/[^a-zA-Z0-9._-]+/g, '_')
        return safe.length > 0 ? safe : UNKNOWN_TENANT_SLUG
    } catch {
        return UNKNOWN_TENANT_SLUG
    }
}

// ============================================================================
// UI Origin Helpers
// ============================================================================

/**
 * Extracts the UI origin from an API base URL.
 * ISC API URLs typically use 'api.' subdomain which needs to be removed for UI URLs.
 *
 * @param baseUrl - The API base URL (e.g., 'https://tenant.api.identitynow.com')
 * @returns The UI origin (e.g., 'https://tenant.identitynow.com') or undefined if invalid
 *
 * @example
 * getUIOriginFromBaseUrl('https://acme.api.identitynow.com')
 * // Returns: 'https://acme.identitynow.com'
 */
export function getUIOriginFromBaseUrl(baseUrl: string | undefined): string | undefined {
    if (!baseUrl) return undefined

    try {
        const url = new URL(baseUrl)
        // Remove the api subdomain segment used by the API host
        // Handles both '.api.' in the middle and 'api.' at the start
        const host = url.host.replace('.api.', '.').replace(/^api\./, '')
        return `${url.protocol}//${host}`
    } catch {
        return undefined
    }
}

// ============================================================================
// Generic Admin URL Builder
// ============================================================================

function buildAdminUrl(
    uiOrigin: string | undefined,
    id: string | undefined,
    buildPath: (encodedId: string) => string
): string | undefined {
    if (!uiOrigin || !id) return undefined
    return `${uiOrigin}/ui/a/admin/${buildPath(encodeURIComponent(id))}`
}

// ============================================================================
// Identity URL Builders
// ============================================================================

/**
 * Builds a URL to an identity's details page in the ISC UI.
 *
 * @param uiOrigin - The UI origin (from getUIOriginFromBaseUrl)
 * @param identityId - The identity ID
 * @returns The full URL to the identity details page, or undefined if inputs are invalid
 */
export function buildIdentityUrl(uiOrigin: string | undefined, identityId: string | undefined): string | undefined {
    return buildAdminUrl(uiOrigin, identityId, (encodedId) => `identities/${encodedId}/details/attributes`)
}

/**
 * Builds a URL to an identity's accounts page in the ISC UI.
 */
export function buildIdentityAccountsUrl(
    uiOrigin: string | undefined,
    identityId: string | undefined
): string | undefined {
    return buildAdminUrl(uiOrigin, identityId, (encodedId) => `identities/${encodedId}/accounts`)
}

// ============================================================================
// Source URL Builders
// ============================================================================

/**
 * Builds a URL to a source's details page in the ISC UI.
 */
export function buildSourceUrl(uiOrigin: string | undefined, sourceId: string | undefined): string | undefined {
    return buildAdminUrl(uiOrigin, sourceId, (encodedId) => `connections/sources/${encodedId}`)
}

/**
 * Builds a URL to a source's accounts page in the ISC UI.
 */
export function buildSourceAccountsUrl(uiOrigin: string | undefined, sourceId: string | undefined): string | undefined {
    return buildAdminUrl(uiOrigin, sourceId, (encodedId) => `connections/sources/${encodedId}/accounts`)
}

// ============================================================================
// Account URL Builders
// ============================================================================

/**
 * Builds a URL to an account's details page in the ISC UI.
 */
export function buildAccountUrl(uiOrigin: string | undefined, accountId: string | undefined): string | undefined {
    return buildAdminUrl(uiOrigin, accountId, (encodedId) => `accounts/${encodedId}`)
}

/**
 * Builds a URL to a human account in Accounts Management in the ISC UI.
 */
function buildHumanAccountManagementUrl(
    uiOrigin: string | undefined,
    accountId: string | undefined
): string | undefined {
    return buildAdminUrl(uiOrigin, accountId, (encodedId) => `accounts-management/human-accounts/${encodedId}`)
}

// ============================================================================
// Workflow URL Builders
// ============================================================================

/**
 * Builds a URL to a workflow's details page in the ISC UI.
 */
export function buildWorkflowUrl(uiOrigin: string | undefined, workflowId: string | undefined): string | undefined {
    return buildAdminUrl(uiOrigin, workflowId, (encodedId) => `workflows/${encodedId}`)
}

// ============================================================================
// Form URL Builders
// ============================================================================

/**
 * Builds a URL to a form definition's details page in the ISC UI.
 */
export function buildFormDefinitionUrl(uiOrigin: string | undefined, formId: string | undefined): string | undefined {
    return buildAdminUrl(uiOrigin, formId, (encodedId) => `forms/${encodedId}`)
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validates that a string is a valid URL.
 */
export function isValidUrl(url: string | undefined): boolean {
    if (!url) return false
    try {
        new URL(url)
        return true
    } catch {
        return false
    }
}

/**
 * Ensures a URL ends without a trailing slash.
 */
export function removeTrailingSlash(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url
}

/**
 * Ensures a URL ends with a trailing slash.
 */
export function ensureTrailingSlash(url: string): string {
    return url.endsWith('/') ? url : `${url}/`
}

// ============================================================================
// URL Context Builder
// ============================================================================

/**
 * Creates a URL builder context that caches the UI origin and provides
 * convenient methods for building various URLs.
 *
 * @example
 * const urls = createUrlContext('https://tenant.api.identitynow.com')
 * const identityUrl = urls.identity('abc123')
 * const sourceUrl = urls.source('def456')
 */
export interface UrlContext {
    readonly uiOrigin: string | undefined
    identity: (id: string | undefined) => string | undefined
    identityAccounts: (id: string | undefined) => string | undefined
    source: (id: string | undefined) => string | undefined
    sourceAccounts: (id: string | undefined) => string | undefined
    account: (id: string | undefined) => string | undefined
    humanAccount: (id: string | undefined) => string | undefined
    workflow: (id: string | undefined) => string | undefined
    form: (id: string | undefined) => string | undefined
}

export function createUrlContext(baseUrl: string | undefined): UrlContext {
    const uiOrigin = getUIOriginFromBaseUrl(baseUrl)

    return {
        uiOrigin,
        identity: (id) => buildIdentityUrl(uiOrigin, id),
        identityAccounts: (id) => buildIdentityAccountsUrl(uiOrigin, id),
        source: (id) => buildSourceUrl(uiOrigin, id),
        sourceAccounts: (id) => buildSourceAccountsUrl(uiOrigin, id),
        account: (id) => buildAccountUrl(uiOrigin, id),
        humanAccount: (id) => buildHumanAccountManagementUrl(uiOrigin, id),
        workflow: (id) => buildWorkflowUrl(uiOrigin, id),
        form: (id) => buildFormDefinitionUrl(uiOrigin, id),
    }
}

