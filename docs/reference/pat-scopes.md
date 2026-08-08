# ISC PAT scopes

Identity Fusion NG calls a fixed set of Identity Security Cloud APIs. Grant your connector Personal Access Token (PAT) the scopes below. Scopes are grouped into a **minimal set** (full connector feature set) and **conditional** scopes that apply only when specific settings are enabled.

## Minimal PAT scope set

Use these twelve scopes for a deployment that uses Map, Define, Match, review forms, email notifications, reverse correlation, and aggregation control:

```
idn:accounts:manage
idn:accounts-state:manage
sp:search:read
idn:sources:manage
idn:source-schema:manage
sp:forms:manage
sp:workflow:manage
sp:workflow-execute:external
idn:workgroup:read
idn:task-management:read
idn:identity-profile:manage
idn:identity-profile-attribute:manage
```

## Scope-by-scope rationale

| Scope | API calls covered |
| --- | --- |
| `idn:accounts:manage` | List fusion and managed accounts; correlate managed accounts to identities; account create/update provisioning |
| `idn:accounts-state:manage` | Disable managed accounts (orphan non-match path and delayed-aggregation side effects) via `POST /accounts/{id}/disable` |
| `sp:search:read` | Identity lookups: scope query, fetch by ID/name, aggregation event search |
| `idn:sources:manage` | List/get/update sources; correlation config; load-accounts aggregation |
| `idn:source-schema:manage` | Read Fusion and managed source schemas; add reverse-correlation schema attributes |
| `sp:forms:manage` | Form definitions and instances for Match manual review |
| `sp:workflow:manage` | Email sender and delayed-aggregation workflows |
| `sp:workflow-execute:external` | Deliver emails via `testWorkflow` on a disabled workflow |
| `idn:workgroup:read` | Resolve Fusion source management workgroup members as global reviewers |
| `idn:task-management:read` | Poll aggregation task completion when `aggregationMode: before` |
| `idn:identity-profile:manage` | Add attribute transforms for reverse correlation |
| `idn:identity-profile-attribute:manage` | Create or enable searchable identity attributes for reverse correlation |

## Conditional scopes

These scopes appear in both the minimal set and the conditional table because they are required only when specific features are enabled. Omit them for deployments that do not use those features.

| Scope | Required when… |
| --- | --- |
| `idn:accounts-state:manage` | **Disable non-matching accounts** on an Orphan source, or `aggregationMode: delayed` side effects |
| `idn:task-management:read` | `aggregationMode: before` is set on any managed source |
| `sp:forms:manage` | Match step is enabled (manual review workflow) |
| `sp:workflow:manage` | Match email notifications or delayed aggregation are enabled |
| `sp:workflow-execute:external` | Match email notifications or delayed aggregation are enabled |
| `idn:workgroup:read` | Fusion source has a management workgroup assigned, or **Owners are global reviewers?** resolves workgroup members |
| `idn:identity-profile:manage` | `correlationMode: reverse` is set on any managed source |
| `idn:identity-profile-attribute:manage` | `correlationMode: reverse` is set on any managed source |

## Core minimum (Map and Define only)

For a minimal Map/Define side-car deployment with no Match, no email, no reverse correlation, no aggregation control, and no orphan disable:

```
idn:accounts:manage
sp:search:read
idn:sources:manage
idn:source-schema:manage
```

## Deployment pattern → scopes

```mermaid
flowchart TD
    BASE[Core minimum<br/>accounts + search + sources + schema]
    BASE --> AUTH[Authoritative Match]
    AUTH --> FORMS[+ forms + workflow scopes]
    FORMS --> EMAIL[+ workflow-execute:external]
    BASE --> DELAY[+ accounts-state:manage]
    BASE --> BEFORE[+ task-management:read]
    BASE --> REV[+ identity-profile scopes]
    BASE --> WG[+ workgroup:read]
```

## PAT scope recommender

Derive minimal and conditional scopes from an exported Fusion source configuration JSON:

```bash
npm run pat-scopes:recommend -- path/to/source-config.json
```

The script inspects managed sources (`aggregationMode`, `correlationMode`, `disableNonMatchingAccounts`), Match rules, review/report settings, and global reviewer flags. It prints:

- **Core minimum** — Map/Define side-car deployments (`idn:accounts:manage`, `sp:search:read`, `idn:sources:manage`, `idn:source-schema:manage`)
- **Full minimal + conditional** — Match, delayed aggregation, reverse correlation, orphan disable, and workflow features as applicable

Export the source config from ISC (Admin → Connections → Sources → your Fusion source → Export) or use a sanitized copy from scenario recordings.

## Caveats

1. **`GET /v2025/form-definitions`** — No explicit scope in the OpenAPI spec; `sp:forms:manage` is included conservatively because other form operations require it.
2. **`PATCH /v2025/form-instances/{id}`** — Any authenticated token can call this endpoint; no additional scope beyond a valid PAT.
3. **`sp:workflow-execute:external`** — Exact scope string for `POST /v2025/workflows/{id}/test`. Do not substitute `sp:workflow:manage`.
4. **Reverse correlation scopes** — Only exercised when `correlationMode: reverse` is configured on at least one managed source.
5. **Entitlement list operation** — Does not call ISC APIs; no additional PAT scope beyond source/account reads already listed above.

## Related configuration

- [Connection Settings](../configuration/connection.md) — PAT ID and secret fields
- [Configuring sources and scope](../use-guides/configuration/configuring-sources-and-scope.md) — aggregation mode and correlation mode
- [Entitlement list](../operations/entitlement-list.md) — status and action entitlements the connector exposes
- [Tune API performance](../use-guides/operation/tune-api-performance.md) — resilience settings


