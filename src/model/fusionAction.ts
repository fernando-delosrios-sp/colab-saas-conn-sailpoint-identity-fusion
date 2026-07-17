/**
 * Canonical string identifiers for action entitlements and action-scoped prefixes
 * produced or consumed by the Identity Fusion connector.
 *
 * Every action string produced by `FusionAccount` action APIs MUST be a member
 * of this enum. The runtime value of each member is the exact string the SDK has
 * historically used for that action, so persisted payloads round-trip unchanged.
 */
export enum FusionAction {
    Correlated = 'correlated',
    ReviewerPrefix = 'reviewer:',
}
