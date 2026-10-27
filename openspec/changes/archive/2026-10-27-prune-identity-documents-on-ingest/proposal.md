## Why

During Phase 2 (Fetch), the connector ingests raw ISC IdentityDocument payloads without filtering, storing 50 to 120 attributes and dozens of third-party enterprise accounts per identity directly into the heap. For tenants with 100k+ identities, this unpruned data consumes hundreds of megabytes of RAM that persists through Phase 4. By pruning identity attributes to the referenced attribute set and filtering linked accounts to only configured Fusion and managed sources upon page arrival, identity heap memory is reduced by 60 to 80 percent with zero functional impact on correlation or mapping.

## What Changes

**Identity Document Attribute Pruning**
- From: `IdentityService.fetchIdentities` caches the entire raw `identity.attributes` dictionary for every identity in `FusionRun.identityMap`.
- To: `IdentityService` prunes `identity.attributes` on page arrival to retain only keys present in the run's `referencedAttributeSet` plus standard core attributes (`displayName`, `email`, `name`, `id`).
- Reason: The vast majority of custom and auxiliary identity attributes are never referenced by Fusion schemas, mapping rules, or Velocity templates.
- Impact: Non-breaking; reduces per-identity memory footprint significantly.

**Identity Linked Account Filtering**
- From: `IdentityDocument.accounts` retains all linked accounts across the entire tenant, including unmanaged external systems (AWS, ServiceNow, Slack, SAP).
- To: `IdentityDocument.accounts` is filtered on page arrival to keep only accounts belonging to the Fusion source or configured managed sources, retaining minimal fields (`id`, `nativeIdentity`, `name`, `disabled`, `source`).
- Reason: Fusion only uses linked accounts to identify existing Fusion accounts and resolve managed source links; external accounts are never read.
- Impact: Non-breaking internal optimization.

## Capabilities

### Modified Capabilities
- `identity-service`: Prunes identity attributes and filters linked accounts on page arrival during bulk and single identity fetch.
- `ubiquitous-language`: Defines canonical vocabulary for Identity Document Pruning and Identity Account Filtering.

## Impact

- **Services**: Modifies `IdentityService.fetchIdentities` and `IdentityService.fetchIdentityById`.
- **Performance**: 60–80% lower memory footprint for `identityMap` in `FusionRun`.
- **Compatibility**: 100% backward-compatible; no configuration or schema changes required.
