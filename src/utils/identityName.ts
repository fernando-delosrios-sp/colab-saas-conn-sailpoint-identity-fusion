import { StdAccountCreateInput } from '@sailpoint/connector-sdk'
import { trimStr } from './safeRead'

/**
 * Resolves the authoritative identity name for an account-create payload.
 *
 * Priority:
 * 1. The configured fusion display attribute (if provided and present)
 * 2. The `name` attribute from the create input
 * 3. The top-level `identity` field from the create input
 *
 * All candidates are trimmed; empty/whitespace-only values are ignored.
 */
export function resolveIdentityNameFromCreateInput(
    input: StdAccountCreateInput,
    displayAttribute?: string
): string | undefined {
    const displayValue = displayAttribute ? input.attributes?.[displayAttribute] : undefined
    return trimStr(displayValue) ?? trimStr(input.attributes?.name) ?? trimStr(input.identity) ?? undefined
}

/**
 * Resolves the display name for an identity document from the ISC API.
 *
 * Priority:
 * 1. `displayName` field
 * 2. `attributes.displayName` field
 * 3. `name` field
 *
 * Uses `any` cast internally because `attributes` is not typed on `IdentityDocument` but is often present in responses.
 */
export function resolveIdentityDisplayName(identity: any): string | undefined {
    if (!identity) return undefined
    return identity.displayName || identity.attributes?.displayName || identity.name || undefined
}
