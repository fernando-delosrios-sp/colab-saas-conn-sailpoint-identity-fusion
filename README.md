# Identity Fusion NG

Identity Fusion NG is an Identity Security Cloud (ISC) connector that addresses the complex challenge of identity and account data aggregation through a streamlined **map-define-match** process. This concept represents the high-level operation of the connector, which can execute all three steps or just one, but always in this logical sequence:

1. **Map (Attribute management / Consolidation)** — Strict correlation often fails when data is inconsistent. Creating, normalizing, and combining attributes from multiple sources is complex. The connector provides flexible merging strategies when multiple sources contribute to the same attribute (first found, list, concatenate, or source preference).
2. **Define (Unique identifiers / Generation)** — ISC has no built-in way to generate unique identifiers and handle value collision. The connector provides powerful attribute generation using Apache Velocity templates, unique ID generation with disambiguation counters, immutable UUID assignment, and computed attributes.
3. **Match (Deduplication / Correlation)** — The connector provides similarity-based duplicate detection comparing the resulting mapped and defined Fusion accounts against your identity baseline. It offers optional manual review workflows and configurable merging of account attributes.

You can use the **map**, **define**, and **match** capabilities independently or together. For **matching** (deduplication), the Identity Fusion NG source should be **authoritative** in most cases—so it can determine which incoming managed accounts create a new identity and which correlate to an existing one. For **mapping and defining only** (unique IDs, calculated or consolidated attributes), Fusion is rarely configured as authoritative; adding managed account sources is optional and depends on your attribute management requirements.

---

## Overview

| Topic                                                                                    | Description                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Migration from previous Identity Fusion](docs/guides/migration-from-previous-fusion.md) | Migrate from an earlier Identity Fusion version: add the old source as managed, align schemas, then migrate identities via a higher-priority profile and identity refresh. |
| [Map & Define](docs/guides/map.md)                                                       | Generate unique or combined attributes from identities, sources, or both. Fusion is rarely authoritative in this mode; managed sources are optional.                       |
| [Match](docs/guides/match.md)                                                            | Detect and resolve potential duplicate identities using one or more sources; identities optional but recommended as a baseline.                                            |
| ---                                                                                      | ---                                                                                                                                                                        |
| [Attribute Mapping](docs/guides/map.md)                                                  | Attribute mapping, merging from multiple sources.                                                                                                                          |
| [Attribute Definitions](docs/guides/define.md)                                           | Attribute definitions (Velocity, unique, UUID, counters).                                                                                                                  |
| [Advanced connection settings](docs/guides/advanced-connection-settings.md)              | Queue, retry, batching, rate limiting, and logging.                                                                                                                        |
| [Proxy mode](docs/guides/proxy-mode.md)                                                  | Run connector logic on an external server and connect ISC to it via proxy.                                                                                                 |
| [Troubleshooting](docs/guides/troubleshooting.md)                                        | Common issues, logs, and recovery steps.                                                                                                                                   |

---

## Configuration at a glance

Configuration is grouped into menus in the connector source in ISC. Each menu contains multiple sections with specific settings.

### Connection Settings

Authentication and connectivity to the ISC APIs.

![Connection Settings](docs/assets/images/config-connection-settings.png)

| Field                               | Description                                    | Required                         | Notes                                                                                 |
| ----------------------------------- | ---------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------- |
| **Identity Security Cloud API URL** | Base URL of your ISC tenant                    | Yes                              | Format: `https://<tenant>.api.identitynow.com`                                        |
| **Personal Access Token ID**        | Client ID from your PAT                        | Yes                              | Must have required API permissions for sources, identities, accounts, workflows/forms |
| **Personal Access Token secret**    | Client secret from your PAT                    | Yes                              | Keep secure; rotate as needed                                                         |
| **API request retries**             | Maximum retry attempts for failed API requests | No (shown when retry is enabled) | Default: 20; also configurable from Advanced Settings                                 |
| **Requests per second**             | Maximum API requests per second (throttling)   | No (shown when queue is enabled) | Default: 10; also configurable from Advanced Settings                                 |

> **Note:** **API request retries** and **Requests per second** also appear in **Advanced Settings → Advanced Connection Settings**. They control the same underlying settings; Connection Settings provides quick access, while Advanced Settings groups them with related queue and retry options.

> **Tip:** Create a dedicated identity for Identity Fusion and generate a PAT for your source configuration.

### Source Settings

Controls which identities and sources are in scope and how processing is managed.

#### Scope Section

![Source Settings - Scope](docs/assets/images/config-source-scope.png)

| Field                                | Description                                                                | Required                              | Notes                                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Include identities in the scope?** | Include identities in addition to managed accounts from configured sources | No                                    | Enable for identity-only Defines or to define the baseline for Match (sources scope = managed accounts from configured sources).                                                          |
| **Identity Scope Query**             | Search/filter query to limit which identities are evaluated                | Yes (when include identities enabled) | Uses [ISC search syntax](https://documentation.sailpoint.com/saas/help/search/building-query.html); examples: `*` (all), `attributes.cloudLifecycleState:active`, `source.name:"Workday"` |

> **Tip:** You may or may not include identities in your scope. When not included, only those managed accounts previously processed that turned into an identity will be considered as your baseline to compare new uncorrelated managed accounts. When included, all your existing identities in the scope will be part of that baseline from the beginning, as well as managed accounts that turn into identities over time. When including identities in the scope, the Fusion attribute definition context can also access the `$identity` object.

#### Sources Section

![Source Settings - Sources](docs/assets/images/config-source-sources.png)

| Field                                           | Description                                                 | Required | Notes                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------- | -------- | ------------------------------------------------------------------------ |
| **Authoritative account sources**               | List of sources whose accounts will be merged and evaluated | Yes      | Each source has sub-configuration (see below)                            |
| **Aggregation task result retries**             | Number of times to poll aggregation task status             | No       | Default: 5; applies to all sources with force aggregation enabled        |
| **Aggregation task result wait time (seconds)** | Wait time between aggregation task status checks            | No       | Default: 1 second; applies to all sources with force aggregation enabled |

**Per-source configuration:**

![Source Settings - Per-source configuration](docs/assets/images/config-source-single.png)

| Field                             | Description                                            | Required               | Notes                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source name**                   | Name of the authoritative account source               | Yes                    | Must match the source name in ISC exactly (case-sensitive)                                                                                                                                                 |
| **Enabled**                       | Include this source in processing                      | No                     | Defaults to enabled. Disabled sources are excluded from aggregation and fusion entirely.                                                                                                                   |
| **Source type**                   | How accounts from this source are processed            | Yes                    | Options: **Authoritative accounts** (default, creates new identities), **Records** (registers unique attributes but doesn't output ISC accounts), **Orphan accounts** (drops non-matching accounts).       |
| **Disable non-matching accounts** | Disable non-matching orphan accounts via background op | No (only for Orphan)   | When enabled, triggers an account disable operation for orphans lacking a match.                                                                                                                           |
| **Account filter**                | Filter query to limit which accounts are processed     | No                     | Uses ISC search/filter syntax; example: `attributes.department:"Engineering"`                                                                                                                              |
| **Aggregation batch size**        | Maximum accounts to aggregate per run                  | No                     | Leave empty for all accounts; useful for initial loading of datasets.                                                                                                                                      |
| **Account aggregation mode**      | When to trigger fresh aggregation for this source      | Yes                    | Options: **Do not aggregate** (none), **Aggregate before processing** (ensures current data but blocks processing), **Delayed aggregation** (triggers aggregation in background after returning accounts). |
| **Aggregation delay (minutes)**   | Wait time before delayed aggregation                   | Yes (for delayed mode) | Default: 5 minutes.                                                                                                                                                                                        |
| **Optimized aggregation**         | Only reprocess changed accounts during aggregation     | No                     | Enable for performance. Disable if using **reverse correlation** so all accounts are processed.                                                                                                            |
| **Correlation mode**              | How to handle missing source accounts                  | Yes                    | Options: **Correlate missing accounts on aggregation** (direct API patch), **Reverse correlation from managed source** (sets an attribute for ISC native correlation), **Do not correlate** (none).        |
| **Correlation attribute name**    | Attribute used for reverse correlation                 | Yes (for reverse mode) | Technical name for the dedicated Fusion attribute.                                                                                                                                                         |
| **Correlation display name**      | UI display name for the correlation attribute          | Yes (for reverse mode) | Human-readable name.                                                                                                                                                                                       |

> **Tip:** You can use the **Aggregate before processing** option to ensure a managed source has newer data than the last time Identity Fusion ran and/or synchronize aggregation schedules. If you don't need the absolute latest data blocking the aggregation response, consider **Delayed aggregation** to speed up the account list operation.

<details>
<summary><b>View Graphic: Source Types & Flow</b></summary>

```mermaid
flowchart TD
    A[Evaluate Managed Account] --> B{Source Type?}
    B -- Identities --> C[Match / Scoring]
    B -- Records --> D[Register Unique Attributes Only]
    B -- Orphans --> E[Check Match]
    E -- Match --> F[Link to Identity]
    E -- No Match --> G[Drop Account]
    G -.-> H([Optional: Disable Account])
    D --> I[Do Not Output as ISC Account]
    C --> J[Output as Fusion Account]
```

</details>

<details>
<summary><b>View Graphic: Aggregation Timing</b></summary>

```mermaid
sequenceDiagram
    participant ISC
    participant Fusion
    participant Source
    ISC->>Fusion: Start Account List
    Fusion->>Source: Aggregate 'before' sources
    Fusion->>Fusion: Run Match & Map/Define
    Fusion->>ISC: Return processed accounts
    Fusion->>Source: Wait N mins, aggregate 'delayed' sources
```

</details>

<details>
<summary><b>View Graphic: Correlation Modes</b></summary>

```mermaid
flowchart TD
    A[Missing Source Account Detected] --> B{Correlation Mode?}
    B -- Correlate on aggregation --> C[Direct API call to PATCH identity]
    B -- Reverse correlation --> D[Set Reverse Correlation Attribute on Fusion Account]
    B -- Do not correlate --> E[Skip Correlation]
    D --> F[ISC Native Correlation Uses Attribute to map account]
```

</details>

#### Processing Control Section

![Source Settings - Processing Control](docs/assets/images/config-source-processing.png)

| Field                                                    | Description                                                              | Required | Notes                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maximum history messages**                             | Maximum history entries retained per Fusion account                      | No       | Default: 10; older entries are discarded when limit exceeded                                                                                                                                 |
| **Delete accounts with no authoritative accounts left?** | Remove Fusion accounts when all contributing source accounts are removed | No       | Useful for automated cleanup when users leave                                                                                                                                                |
| **Force attribute refresh on each aggregation?**         | Force Normal-type attributes to refresh every run                        | No       | Applies only to Normal attributes; Unique attributes are only computed when a Fusion account is first created or when an existing account is activated. Can be expensive for large datasets. |
| **Skip accounts with missing unique ID?**                | Skip processing accounts without a fusion identity attribute value       | No       | Skipped accounts are logged for review; useful when some source accounts lack required identifier data                                                                                       |

> **Tip:** When testing or onboarding large amounts of managed accounts, it is best to disable all kinds of managed account correlation. Already processed uncorrelated managed accounts are part of their associated Fusion accounts internally, so it doesn't interfere in the normal connector operation. Correlation is a heavy process and must be carefully planned. It's often a good idea to have mixed correlation strategies depending on the implementation stage or managed source.

> **Tip:** Remember that managed accounts must be uncorrelated for them to be evaluated for matches. Correlated managed accounts are directly included in your baseline.

> **Tip:** When failing to generate an account ID (`nativeIdentity`), the aggregation fails unless the **Skip accounts with missing unique ID?** option is enabled. All your Fusion accounts must have a valid ID, but you can deliberately generate an empty one with the skip option to prevent including that account in the final results.

### Attribute Mapping Settings

Controls how source account attributes are mapped into the Fusion account and how values from multiple sources are merged.

![Attribute Mapping Settings](docs/assets/images/config-attribute-mapping.png)

#### Attribute Mapping Definitions Section

| Field                                             | Description                                                | Required | Notes                                                                                                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Default attribute merge from multiple sources** | Default method for combining values from different sources | Yes      | Options: **First found** (first value by source order), **Keep a list of values** (distinct values as array), **Concatenate different values** (distinct values as `[a] [b]` string) |
| **Attribute Mapping**                             | List of attribute mappings                                 | No       | Each mapping defines how source attributes feed a Fusion attribute                                                                                                                   |

**Per-attribute mapping configuration:**

![Attribute Mapping Settings - Per-attribute mapping configuration](docs/assets/images/config-attribute-mapping-single.png)

| Field                                                        | Description                                             | Required                | Notes                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| **New attribute**                                            | Name of the attribute on the Fusion account             | Yes                     | Will appear in the discovered schema                                           |
| **Existing attributes**                                      | List of source attribute names that feed this attribute | Yes                     | Names must match source account schema (case-sensitive)                        |
| **Default attribute merge from multiple sources** (override) | Override default merge for this specific mapping        | No                      | Same options as default, plus **Source name** (use value from specific source) |
| **Source name**                                              | Specific source to use for this attribute               | Yes (when merge=source) | Takes precedence when multiple sources have values                             |

> **Tip:** You can use mapping settings to predefine an attribute and redefine the same attribute using attribute definition. The mapped value is available to the definition expression.

> **Tip:** Concatenated attributes are displayed in alphabetical order and duplicate values are removed. They can sometimes be good candidates for matching.

> **Tip:** You can keep all values found for a given attribute and generate a multi-valued attribute. You can get a comma-separated list of them if the schema attribute in question is not multi-valued.

### Attribute Definition Settings

Controls how attributes are generated (Define step), including unique identifiers, UUIDs, counters, and Velocity-based computed attributes.

![Attribute Definition Settings](docs/assets/images/config-attribute-definition.png)

#### Attribute Definition Settings Section

| Field                                             | Description                                                | Required | Notes                                                        |
| ------------------------------------------------- | ---------------------------------------------------------- | -------- | ------------------------------------------------------------ |
| **Maximum attempts for unique Define generation** | Maximum attempts to generate unique value before giving up | No       | Default: 100; prevents infinite loops with unique/UUID types |
| **Attribute Definitions**                         | List of attribute generation rules                         | No       | Each definition specifies how an attribute is built          |

**Per-attribute definition configuration:**

![Attribute Definition Settings - Per-attribute definition](docs/assets/images/config-attribute-definition-single.png)

| Field                                 | Description                                         | Required                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Attribute Name**                    | Name of the account attribute to generate           | Yes                        | Will appear in the discovered schema                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Apache Velocity expression**        | Template expression to generate the attribute value | No                         | Context includes: mapped account attributes, `$accounts`, `$sources`, `$previous`, optional `$identity` and `$originSource`, plus `$Math`, `$Datefns` (format, parse, add/sub days/months/years, isBefore, isAfter, differenceInDays, etc.), `$AddressParse` (getCityState, getCityStateCode, parse), and `$Normalize` (date, phone, name, fullName, ssn, address). Example: `#set($initial = $firstname.substring(0, 1))$initial$lastname` |
| **Case selection**                    | Case transformation to apply                        | Yes                        | Options: **Do not change**, **Lower case**, **Upper case**, **Capitalize**                                                                                                                                                                                                                                                                                                                                                                  |
| **Attribute Type**                    | Type of attribute                                   | Yes                        | **Normal** (standard attribute), **Unique** (must be unique across accounts; counter added if collision), **UUID** (generates immutable UUID), **Counter-based** (increments with each use)                                                                                                                                                                                                                                                 |
| **Counter start value**               | Starting value for counter                          | Yes (counter type)         | Example: 1, 1000, etc.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Minimum counter digits ($counter)** | Minimum digits for counter (zero-padded)            | Yes (counter/unique types) | Example: 3 → `001`, `002`; for unique type, counter is appended on collision                                                                                                                                                                                                                                                                                                                                                                |
| **Maximum length**                    | Maximum length for generated value                  | No                         | Truncates to this length; for unique/counter types, counter is preserved at end                                                                                                                                                                                                                                                                                                                                                             |
| **Normalize special characters?**     | Remove special characters and quotes                | No                         | Useful for IDs and usernames                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Remove spaces?**                    | Remove all spaces from value                        | No                         | Useful for IDs and usernames                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Trim leading and trailing spaces?** | Remove leading/trailing whitespace from value       | No                         | Cleans up extra whitespace from source data                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Refresh on each aggregation?**      | Recalculate value every aggregation                 | No                         | Only available for **Normal** type; unique/UUID/counter preserve state                                                                                                                                                                                                                                                                                                                                                                      |

**Note:** When an account is **enabled**, all attributes (including unique) are force refreshed and recalculated (internal mechanism to reset unique attributes).

> **Tip:** If you want to change a unique attribute other than the account name or ID, you can disable the Fusion account and re-enable it. This is handy in situations where a surname change affects a username, etc.

> **Tip:** When dealing with multiple managed sources, generate your own Fusion account ID (`nativeIdentity`) and name, and ensure both are unique. Two Fusion accounts with the same name correlate to the same identity. In fact, any account evaluated for correlation is automatically correlated to an identity whose name (not username) matches. An identity name is defined by the name of the account that originated it. Only the last Fusion account returned from a list of Fusion accounts with the same ID is processed.

> **Tip:** Do not use a unique attribute or username that you may want to reset down the line as the Fusion account name. Use any other account attribute, and reserve your account name for an immutable unique attribute that is as human-friendly as possible.

> **Tip:** Use attribute normalizers (`$Normalize`) to align different formats across different sources.

> **Tip:** You can define extra attributes in your configuration and not include them in your schema. You can use them as ephemeral support attributes to create new ones. Remember that previously processed attributes are available to the next ones. All normal attributes are available to unique attributes, as these are the last ones to be processed. Don't use a unique attribute in your matching settings, as it won't be available on the managed account being processed at runtime.

> **Tip:** Remember that normal attributes are automatically refreshed when new data is found. You don't need to force global or individual attribute refresh unless there's a good reason, like troubleshooting, testing, or if the attribute definition is time-sensitive.

> **Note:** In Velocity context, managed account snapshots (`$accounts` and `$sources`) include `_source` (source name) and `IIQDisabled` (IdentityIQ-style disabled flag where `true` means disabled). `$accounts` is deterministic: sources follow configured order, accounts keep insertion order within each source, and non-configured sources are appended.

### Fusion Settings

Controls Match behavior, including similarity matching and manual review workflows.

#### Matching Settings Section

![Fusion Settings - Matching](docs/assets/images/config-fusion-matching.png)

| Field                                                       | Description                                                    | Required                         | Notes                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fusion attribute matches**                                | List of identity attributes to compare for duplicate detection | Yes                              | At least one attribute match required; each match specifies an attribute and algorithm                                                                                                   |
| **Use overall fusion similarity score for all attributes?** | Use single overall score instead of per-attribute thresholds   | No                               | When enabled, only the overall (average) threshold must be met; when disabled, every mandatory attribute must match, and if none are mandatory, all attributes are treated as mandatory. |
| **Similarity score [0-100]**                                | Minimum overall similarity score for auto-correlation          | Yes (when overall score enabled) | Typical range: 70-90; higher = stricter; only used when "Use overall fusion similarity score" is enabled                                                                                 |
| **Automatically correlate if identical?**                   | Auto-merge when attributes meet criteria without manual review | No                               | Use when you trust the algorithm and thresholds; skips manual review for high-confidence matches                                                                                         |

**Per-attribute match configuration:**

![Fusion Settings - Matching - Per attribute matching](docs/assets/images/config-fusion-matching-single.png)

| Field                        | Description                                                     | Required | Notes                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Attribute**                | Identity attribute name to compare                              | Yes      | Must exist on identities in scope                                                                                                                                                                                                                                                                                                                                                      |
| **Matching algorithm**       | Algorithm for similarity calculation                            | Yes      | **Enhanced Name Matcher** (person names, handles variations), **Jaro-Winkler** (short strings with typos, emphasizes beginning), **LIG3** (Levenshtein-based with intelligent gap penalties, excellent for international names and multi-word fields), **Dice** (longer text, bigram-based), **Double Metaphone** (phonetic, similar pronunciation), **Custom** (from SaaS customizer) |
| **Similarity score [0-100]** | Minimum similarity score for this attribute                     | No       | Required when not using overall score mode. A mandatory attribute must meet or exceed this threshold or the match fails. When overall score is enabled, only the overall threshold is required (per-attribute thresholds may not all be met). When no attribute is mandatory, all attributes are treated as mandatory.                                                                 |
| **Mandatory match?**         | Require this attribute to match before considering as duplicate | No       | When Yes: this attribute's score must be ≥ its threshold or the match fails. When No: attribute still has a threshold; when overall score is disabled and no attribute is mandatory, every attribute is effectively mandatory (all must meet thresholds).                                                                                                                              |

> **Tip:** Use Fusion reports to fine-tune your matching thresholds and algorithms.

> **Tip:** Remember that mandatory match configurations scoring below their threshold invalidate the match. Add them to the top of the list to avoid unnecessary overhead.

#### Review Settings Section

![Fusion Settings - Review](docs/assets/images/config-fusion-review.png)

| Field                                              | Description                                      | Required | Notes                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **List of identity attributes to include in form** | Attributes shown on manual review form           | No       | Helps reviewers make informed decisions; examples: name, email, department, hire date                                                                                                                                                                                                                                   |
| **Manual review expiration days**                  | Days before review form expires                  | Yes      | Default: 7; ensures timely resolution                                                                                                                                                                                                                                                                                   |
| **Owner is global reviewer?**                      | Add Fusion source owner as reviewer to all forms | No       | Ensures at least one global reviewer is always assigned alongside dedicated reviewer entitlements for managed sources. For migration scenarios, it is recommended **not** to enable this until after the initial validation run has succeeded, so that review workflows cannot interfere with the first migration pass. |
| **Send report to owner on aggregation?**           | Email report to owner after each aggregation     | No       | Includes potential duplicates and processing summary                                                                                                                                                                                                                                                                    |

### Advanced Settings

Fine-tuning for API behavior, resilience, debugging, and proxy mode.

#### Developer Settings Section

![Advanced Settings - Developer](docs/assets/images/config-advanced-developer.png)

| Field                         | Description                                                   | Required                                    | Notes                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reset accounts?**           | Force rebuild of all Fusion accounts from scratch on next run | No                                          | **Use with caution in production**; useful for testing config changes; disable after one run                                                                                                  |
| **Enable concurrency check?** | Prevent concurrent account aggregations via a processing lock | No                                          | Default: true. When enabled, a lock is set at the start of each aggregation. If a prior run left the lock stuck, it is auto-reset and an error asks you to retry. Disable only for debugging. |
| **Enable external logging?**  | Send connector logs to external endpoint                      | No                                          | For centralized monitoring and analysis                                                                                                                                                       |
| **External logging URL**      | Endpoint URL for external logs                                | No (required when external logging enabled) | HTTPS recommended                                                                                                                                                                             |
| **External logging level**    | Minimum log level to send externally                          | No (required when external logging enabled) | Options: **Error**, **Warn**, **Info**, **Debug**                                                                                                                                             |

> **Tip:** You can use the built-in remote log server from the project to send your logs to your computer and save them to a file. Just use `npm run remote-log-server` from the connector's Node project folder and use the generated URL as your remote log server.

#### Advanced Connection Settings Section

![Advanced Settings - Connection](docs/assets/images/config-advanced-connection.png)

| Field                              | Description                                                        | Required                         | Notes                                                                             |
| ---------------------------------- | ------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------- |
| **Provisioning timeout (seconds)** | Maximum wait time for provisioning operations                      | Yes                              | Default: 300; increase for large batches or slow APIs                             |
| **Enable queue?**                  | Enable queue management for API requests                           | No                               | Enables rate limiting and concurrency control                                     |
| **Maximum concurrent requests**    | Maximum simultaneous API requests                                  | No (required when queue enabled) | Default: 10; adjust based on API capacity and tenant limits                       |
| **Enable retry?**                  | Enable automatic retry for failed API requests                     | No                               | Recommended for production; handles transient failures                            |
| **Processing wait time (seconds)** | Interval between keep-alive signals during long-running operations | Yes                              | Default: 60; used for account list and account update to prevent timeouts         |
| **Retry delay (milliseconds)**     | Base delay between retry attempts                                  | Yes                              | Default: 1000; for HTTP 429, uses `Retry-After` header when present               |
| **Enable batching?**               | Group requests in queue for better throughput                      | No                               | Can improve efficiency for bulk operations                                        |
| **Batch size**                     | Requests per batch                                                 | Yes (when batching enabled)      | Default: 250; adjust based on operation type and payload size                     |
| **Enable priority processing?**    | Prioritize important requests in queue                             | No                               | Default: enabled when queue is enabled; ensures critical operations process first |

#### Proxy Settings Section

![Advanced Settings - Proxy](docs/assets/images/config-advanced-proxy.png)

| Field                  | Description                                  | Required                         | Notes                                                                                |
| ---------------------- | -------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| **Enable proxy mode?** | Delegate all processing to external endpoint | No                               | For running connector logic on your own infrastructure                               |
| **Proxy URL**          | URL of external proxy endpoint               | No (required when proxy enabled) | Must accept POST with command type, input, and config                                |
| **Proxy password**     | Secret for proxy authentication              | Yes (when proxy enabled)         | Set same value as `PROXY_PASSWORD` environment variable on proxy server; keep secure |

---

For detailed field-by-field guidance and usage patterns, see the [usage guides](docs/guides/) linked above.

---

## Quick start

1. **Add the connector to ISC** — Upload the Identity Fusion NG connector (e.g. via SailPoint CLI or your organization's process).
2. **Create a source** — In Admin → Connections → Sources, create a new source using the Identity Fusion NG connector. Mark it **Authoritative** when you need Match (so Fusion decides which incoming accounts create new identities vs. correlate to existing ones). For Map & Define only, Fusion is rarely authoritative.
3. **Configure connection** — Set Identity Security Cloud API URL and Personal Access Token (ID and secret). Use **Review and Test** to verify connectivity.
4. **Configure the connector** — Depending on your goal:
    - **Map & Define only:** Set [Source Settings](docs/guides/map.md) (identity scope and/or sources), [Attribute Mapping Settings](docs/guides/map.md) for the **Map** step, and [Attribute Definition Settings](docs/guides/define.md) for the **Define** step.
    - **Match:** Configure [sources and baseline](docs/guides/match.md), then [Fusion Settings](docs/guides/match.md) (matching and review) for the **Match** step.
5. **Discover schema** — Run **Discover Schema** so ISC has the combined account schema.
6. **Identity profile and aggregation** — Create an identity profile and provisioning plan as required by ISC, then run entitlement and account aggregation.

For step-by-step instructions and UI details, see the [Map](docs/guides/map.md), [Define](docs/guides/define.md), and [Match](docs/guides/match.md) guides.

---

## Standard account schema attributes

Every Identity Fusion NG account exposes the following built-in attributes. These are always present regardless of Attribute Mapping or Attribute Definition configuration.

| Attribute            | Type                 | Multi | Description                                                                                                                                                                                                                                                                                          |
| -------------------- | -------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **id**               | string               | No    | Unique account identifier (native identity)                                                                                                                                                                                                                                                          |
| **name**             | string               | No    | Account display name                                                                                                                                                                                                                                                                                 |
| **history**          | string               | Yes   | Dated log entries tracking account lifecycle events                                                                                                                                                                                                                                                  |
| **statuses**         | string (entitlement) | Yes   | Current status labels (e.g. `baseline`, `uncorrelated`, `orphan`, `activeReviews`). **Note:** Status entitlements are static and **not** requestable.                                                                                                                                                |
| **actions**          | string (entitlement) | Yes   | Assigned actions (e.g. `correlated`, `reviewer:<sourceId>`). **Note:** All Action entitlements are requestable. The `report` entitlement can be requested to generate a report of the potential aggregated results without actually aggregating the source.                                          |
| **accounts**         | string               | Yes   | IDs of all contributing managed source accounts                                                                                                                                                                                                                                                      |
| **missing-accounts** | string               | Yes   | IDs of managed source accounts not yet correlated                                                                                                                                                                                                                                                    |
| **reviews**          | string               | Yes   | URLs to pending fusion review forms                                                                                                                                                                                                                                                                  |
| **sources**          | string               | No    | Comma-separated list of managed source names currently contributing to this account                                                                                                                                                                                                                  |
| **originSource**     | string               | No    | Name of the source that originally created this account. Set once at creation and never modified. Equals the managed account source name when the account originates from a source account, or `Identities` when it originates from an identity. Useful for auditing and tracing account provenance. |

> **Note:** In addition to these standard attributes, the discovered schema includes any attributes defined via **Attribute Mapping** and **Attribute Definition** settings.

> **Tip:** Do not include attributes you don't need in your schema, and do not remove internal attributes.

> **Tip:** You can use status entitlements in search to find identities in different situations, such as those included in a pending Fusion review, your Fusion reviewers, identities with uncorrelated managed accounts, baseline-only identities, unmatched identities, identities with manual assignments, etc.

> **Tip:** Account name definition is ignored for baseline Fusion accounts to ensure the Fusion account is automatically correlated with the identity that originated it.

---

## Best practices and tips

- Order always matters. Sources are evaluated in the configured order, attribute mappings, attribute definitions, and matching settings. Everything.
- Account for your manager correlation when dealing with multiple managed sources. A Fusion account with managed accounts from two sources may have a manager on either source, both, or none. If you want to use source manager correlation, you must persist the original manager correlation value pair in your Fusion schema, but the manager will never change. It is best to use a correlation rule in combination with a transform to implement dynamic manager correlation.
- When no identity matching is needed, Identity Fusion can be set as a non-authoritative source to create unique and/or derived attributes. It's usual to have Fusion create unique identifiers associated with one or more authoritative sources. One can configure those sources and the desired attribute definition, and force managed source aggregation before processing, so identifiers are created right after managed sources are aggregated under the same schedule, all controlled by Fusion.

---

## Contributing

Contributions are welcome. Please open an issue or pull request in the repository. Do not forget to add or update tests and documentation as needed.

## License

Distributed under the MIT License. See [LICENSE.txt](LICENSE.txt) for more information.
