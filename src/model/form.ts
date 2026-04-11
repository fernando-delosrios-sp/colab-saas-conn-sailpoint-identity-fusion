import { Attributes } from '@sailpoint/connector-sdk'


/** Account representation used in fusion review forms, including optional match score. */
type Account = {
    id: string
    name: string
    sourceName: string
    attributes: Attributes
    /** Similarity scores if this account was matched against an identity */
    score?: Score
}

/**
 * Minimal account type for FusionDecision - only includes fields actually used.
 * Attributes are not needed since they're never accessed from FusionDecision.
 */
type FusionDecisionAccount = {
    /** Managed account key: sourceId::nativeIdentity */
    id: string
    name: string
    sourceName: string
    sourceId?: string
    nativeIdentity?: string
}

/** User reference used in form submissions (reviewer or submitter). */
type User = {
    id: string
    email: string
    name: string
}

/** Aggregated similarity score with per-attribute breakdown, used in review forms. */
type Score = {
    /** Per-attribute score details */
    attributes: { attribute: string; score: number; threshold: number }[]
    /** Overall combined score */
    score: number
    /** Overall threshold that must be met */
    threshold: number
}

/**
 * A reviewer's decision on a fusion (Match) form.
 * Captures whether to create a new identity or merge into an existing one.
 *
 * For record/orphan source types, the `newIdentity` field represents
 * "no match" semantics: true means no match (do not link), false means
 * link to an existing identity.
 */
export type FusionDecision = {
    submitter: User
    account: FusionDecisionAccount
    newIdentity: boolean
    /**
     * Correlated identity ID for the fusion account at the time the decision was created.
     * This allows downstream reporting/history to resolve a human-friendly display name
     * even when the managed account name is an opaque identifier.
     */
    correlatedIdentityId?: string
    identityId?: string
    /** Selected identity display name at decision time (when available). */
    identityName?: string
    comments: string
    /**
     * Indicates whether the reviewer has finished the decision.
     * Unfinished decisions are kept for reviewer context but skipped by fusion processing.
     */
    finished: boolean
    /**
     * Set only by the connector when assigning to an existing identity without a review form
     * (exact attribute match). Drives the `auto` status entitlement and auto-assignment history.
     */
    automaticAssignment?: boolean
    /**
     * Optional URL of the underlying form instance (standalone form).
     * Used to populate reviewer review links without refetching form instances.
     */
    formUrl?: string
    /** Source type of the managed source this decision pertains to. */
    sourceType?: 'authoritative' | 'record' | 'orphan'
}
/** Data payload for creating a new fusion review form instance. */
export type FusionRequest = {
    title: string
    recipient: User
    account: Account
    candidates: Account[]
}
