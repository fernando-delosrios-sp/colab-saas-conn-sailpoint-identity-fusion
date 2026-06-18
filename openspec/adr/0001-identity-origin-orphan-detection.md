# 0001. Identity-Origin Fusion Accounts Are Eligible for Orphan Deletion

- Status: accepted
- Date: 2026-06-18

## Context

Fusion accounts can originate from two places: managed source accounts (uncorrelated accounts that enter the Match workflow) and ISC identities (authoritative mode). The connector has a `deleteEmpty` setting that removes orphan Fusion accounts — those with no remaining managed source accounts — from aggregation output, causing ISC to delete them.

Historically, identity-origin accounts were protected from orphan deletion by the `baseline` status: the orphan rule explicitly skipped any account with `baseline`. This made sense when identities were treated as permanent anchors, but it leaves stale identity-origin accounts behind when the underlying ISC identity is deleted or removed from the configured identity scope.

## Decision

Identity-origin Fusion accounts are eligible for orphan status. An identity-origin account becomes orphan when:

1. It has no managed source accounts left, and
2. Its origin identity is not present in the configured identity scope (`includeIdentities` + `identityScopeQuery`).

Identity-origin detection relies on existing persisted metadata: `originSource === 'Identities'` and `originAccount` (the identity ID), falling back to `identityId` for older records that may lack `originAccount`.

The `baseline` status is retained when orphan is added; the two statuses are orthogonal.

## Consequences

- Stale identity-origin accounts are cleaned up automatically when `deleteEmpty` is enabled.
- Scope configuration becomes the source of truth for whether an identity-origin account still has a valid anchor.
- Single-account rebuild operations must perform a targeted scope check (`id:"<id>"` combined with the scope query) to apply the same rule without loading the full identity population.
