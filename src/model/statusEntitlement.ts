/**
 * Canonical string identifiers for the connector's status entitlements.
 *
 * Every status produced or consumed by `src/data/status.ts` and the
 * `FusionAccount` status APIs MUST be a member of this enum. Adding a new status
 * is a single edit here plus a matching entry in `data/status.ts`; the contract
 * test in `src/model/__tests__/statusEntitlement.test.ts` fails if either side
 * drifts.
 *
 * The runtime value of each member is the exact string the SDK has historically
 * used for that status, so persisted payloads round-trip unchanged.
 */
export enum StatusEntitlement {
    Authorized = 'authorized',
    Auto = 'auto',
    Baseline = 'baseline',
    Manual = 'manual',
    Orphan = 'orphan',
    NonMatched = 'nonMatched',
    Reviewer = 'reviewer',
    Requested = 'requested',
    Uncorrelated = 'uncorrelated',
    ActiveReviews = 'activeReviews',
    Candidate = 'candidate',
}
