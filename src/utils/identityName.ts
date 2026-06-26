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
