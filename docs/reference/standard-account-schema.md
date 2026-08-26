# Standard account schema attributes

Every Identity Fusion NG account exposes the following built-in attributes. These are always present regardless of Attribute Mapping or Attribute Definition configuration.

| Attribute            | Type                 | Multi | Description                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **id**               | string               | No    | Unique account identifier (native identity)                                                                                                                                                                                                                                                          |
| **name**             | string               | No    | Account display name                                                                                                                                                                                                                                                                                 |
| **history**          | string               | Yes   | Dated log entries tracking account lifecycle events                                                                                                                                                                                                                                                  |
| **statuses**         | string (entitlement) | Yes   | Current status labels (e.g. `baseline`, `uncorrelated`, `orphan`, `activeReviews`). **Note:** Status entitlements are static and **not** requestable.                                                                                                                                                |
| **actions**          | string (entitlement) | Yes   | Assigned actions (e.g. `correlated`, `reviewer:<sourceId>`). **Note:** All Action entitlements are requestable. The `report` entitlement can be requested to generate a report of the potential aggregated results without actually aggregating the source.                                          |
| **accounts**         | string               | Yes   | Managed account keys (`sourceId::nativeIdentity`) of all contributing managed source accounts                                                                                                                                                                                                        |
| **missing-accounts** | string               | Yes   | Managed account keys (`sourceId::nativeIdentity`) of managed source accounts not yet correlated                                                                                                                                                                                                      |
| **reviews**          | string               | Yes   | URLs to pending fusion review forms                                                                                                                                                                                                                                                                  |
| **sources**          | string               | No    | Comma-separated list of managed source names currently contributing to this account                                                                                                                                                                                                                  |
| **mainAccount**      | string               | No    | Managed account ID evaluated first when present. If populated with a valid managed account ID, that managed account is evaluated first for mapping and definition context.                                                                                                                           |
| **originSource**     | string               | No    | Name of the source that originally created this account. Set once at creation and never modified. Equals the managed account source name when the account originates from a source account, or `Identities` when it originates from an identity. Useful for auditing and tracing account provenance. |
| **originAccount**    | string               | No    | Identity ID or managed account key (`sourceId::nativeIdentity`) that originally created this Fusion account. Set once at creation and never modified. Pairs with **`$account`** in Velocity for the origin snapshot object.      |

!!! note "Dynamic attributes"
    In addition to these standard attributes, the discovered schema includes any attributes defined via **Attribute Mapping** and **Attribute Definition** settings.

!!! tip "Schema hygiene"
    Do not include attributes you don't need in your schema, and do not remove internal attributes.

!!! tip "Status entitlements in search"
    You can use status entitlements in search to find identities in different situations, such as those included in a pending Fusion review, your Fusion reviewers, identities with uncorrelated managed accounts, baseline-only identities, NonMatched identities, identities with manual assignments, etc.

!!! tip "Baseline account names"
    Account name definition is ignored for baseline Fusion accounts to ensure the Fusion account is automatically correlated with the identity that originated it.

