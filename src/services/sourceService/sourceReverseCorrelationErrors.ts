export const IDENTITY_PROFILE_PENDING_OPERATIONS_HINT =
    'Please ensure there are no pending operations on identity profiles in ISC, then retry.'

export function buildIdentityAttributeCreateErrorMessage(attributeName: string, error: any): string {
    const detailCode = error?.response?.data?.detailCode
    const messages = error?.response?.data?.messages
    const hasSearchableLimitMessage =
        Array.isArray(messages) &&
        messages.some((m: any) =>
            String(m?.text ?? '')
                .toLowerCase()
                .includes('searchable')
        ) &&
        Array.isArray(messages) &&
        messages.some((m: any) =>
            String(m?.text ?? '')
                .toLowerCase()
                .includes('max limit')
        )

    if (detailCode === '400.1 Bad request content' && hasSearchableLimitMessage) {
        return (
            `Failed to create searchable identity attribute "${attributeName}": ISC tenant limit reached for searchable identity attributes. ` +
            'Please mark an unused identity attribute as non-searchable or reuse an existing searchable identity attribute, then retry reverse correlation setup.'
        )
    }

    return `Failed to create searchable identity attribute "${attributeName}".`
}

export function buildIdentityProfileUpsertErrorMessage(profileId: string, attributeName: string, error: any): string {
    const detailCode = error?.response?.data?.detailCode
    const messages = Array.isArray(error?.response?.data?.messages)
        ? error.response.data.messages.map((m: any) => String(m?.text ?? '')).filter((m: string) => m.length > 0)
        : []
    const hasMissingIdentityObjectConfigAttribute = messages.some((m: string) =>
        m.includes('Identity Object Config attribute(s) referenced by Identity Profile attribute mapping(s)')
    )
    const detail =
        messages.length > 0
            ? messages.join(' | ')
            : detailCode
              ? String(detailCode)
              : error instanceof Error
                ? error.message
                : String(error)
    if (hasMissingIdentityObjectConfigAttribute) {
        return (
            `Failed to update identity profile ${profileId} for reverse correlation attribute "${attributeName}". ` +
            'Identity profile contains mapping(s) to missing Identity Object Config attribute(s). ' +
            'Restore the missing identity attribute(s) or remove stale mapping(s) from the identity profile, then retry reverse correlation setup. ' +
            `ISC detail: ${detail}`
        )
    }
    return (
        `Failed to update identity profile ${profileId} for reverse correlation attribute "${attributeName}". ` +
        `${IDENTITY_PROFILE_PENDING_OPERATIONS_HINT} ISC detail: ${detail}`
    )
}
