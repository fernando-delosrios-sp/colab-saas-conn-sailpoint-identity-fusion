/**
 * Lightweight identity snapshot used as a match candidate, decoupled from the
 * full FusionAccount so emitted Fusion accounts can be released from memory.
 */
export interface MatchCandidateRecord {
    readonly identityId: string
    readonly identityName: string
    readonly attributes: Record<string, string>
}

/**
 * Create a MatchCandidateRecord, copying attributes so later mutations of the source do not leak in.
 */
export function createMatchCandidateRecord(
    identityId: string,
    identityName: string,
    attributes: Record<string, string>
): MatchCandidateRecord {
    return { identityId, identityName, attributes: { ...attributes } }
}
