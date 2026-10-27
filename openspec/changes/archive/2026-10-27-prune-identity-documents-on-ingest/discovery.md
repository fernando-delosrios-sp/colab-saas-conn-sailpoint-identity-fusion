## Scope

Prune incoming ISC IdentityDocument payloads on page arrival during identity ingestion (and on-demand identity fetch) by stripping unreferenced attributes outside the referenced attribute set and filtering linked accounts to only configured Fusion and managed sources.

## Language

**Identity Document Pruning** (`promote`):
Dropping unreferenced attributes from `identity.attributes` and filtering `identity.accounts` upon page arrival during identity fetch to retain only data required by the connector pipeline.
_Avoid_: identity stripping, identity trimming.

**Identity Account Filtering** (`promote`):
Restricting the `identity.accounts` array on an incoming `IdentityDocument` to only accounts belonging to the Fusion source or configured managed sources.
_Avoid_: account discarding, unmanaged account purging.

## Decisions

- **Context**: In enterprise ISC environments, identities typically contain 50–120 attributes and dozens of linked accounts on unmanaged enterprise sources (e.g. ServiceNow, AWS, GitHub, Slack, SAP).
- **Q1**: Where should identity pruning occur?
  - *Chosen*: On page arrival inside `IdentityService.fetchIdentities` (and in `fetchIdentityById`) before identities are registered in `FusionRun.addIdentity`.
- **Q2**: Which attributes should be preserved?
  - *Chosen*: Preserve core identity fields (`id`, `name`, `displayName`, `email`, `disabled`, `protected`) unconditionally, plus all attribute keys present in `referencedAttributeSet`.
- **Q3**: Which linked accounts should be preserved?
  - *Chosen*: Only keep accounts belonging to the Fusion source (`source.id === fusionSourceId`) and configured managed sources (`source.name in managedSourceNames`), retaining only essential fields (`id`, `nativeIdentity`, `name`, `disabled`, `source`). All unmanaged source accounts are discarded immediately.

## Open questions

None.

## Scenarios discussed

- Identity with unreferenced custom attributes: Custom attributes not in `referencedAttributeSet` (e.g., `costCenterCode`, `badgeId`) are pruned immediately on page arrival, freeing heap space.
- Identity with third-party enterprise accounts: Accounts on sources not managed by Fusion (e.g., ServiceNow, AWS, Slack) are filtered out of `identity.accounts[]`, preventing thousands of useless account objects from lingering in RAM.
- Identity with managed accounts & Fusion account: Accounts belonging to configured managed sources and the Fusion source are preserved with full fidelity for correlation and duplicate checks.
- On-demand identity hydration (`fetchIdentityById`): Identities hydrated for missing correlated accounts or reviewer display names are pruned using the same logic before being cached.
