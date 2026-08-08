# Match tuning cookbooks

Worked configuration patterns for common Match deployments. Each scenario lists the goal, representative settings, and a dry-run validation step.

**Configuration reference:** [Attribute Matching Settings](../../configuration/matching.md) · [Source Settings](../../configuration/source.md)

For algorithm and threshold detail, see [Tuning matching algorithms](tuning-matching-algorithms.md).

---

## Cookbook 1: HR + AD deduplication (umbrella mode)

**Goal:** Fusion is authoritative. Workday (HR) and Active Directory accounts merge into one Fusion profile; similarity Match deduplicates new AD rows against HR-backed identities.

### Cookbook 1 — deployment settings

| Setting | Value |
| --- | --- |
| Fusion source **Authoritative** in ISC | **Yes** ([umbrella mode](../../glossary.md#deployment-and-integration)) |
| Workday source type | **Authoritative accounts** |
| AD source type | **Authoritative accounts** |
| **Include identities in the scope?** | **Yes** — baseline from HR identities |
| **Identity Scope Query** | e.g. `attributes.cloudLifecycleState:active` |

### Cookbook 1 — Match settings

| Setting | Suggested starting point |
| --- | --- |
| **Fusion attribute matches** | `email` (Binary, mandatory), `firstname` + `lastname` (Enhanced Name Matcher) |
| **Manual review match score** | 70–85 |
| **Enable automatic merge** | On for exact email; threshold 100 |
| **Correlation mode** | `correlate` on AD source |

### Cookbook 1 — dry-run validation

1. Enable dry-run on account-list with `saveFile: true` (see [Analyze changes with dry-run](../operation/analyze-with-dry-run.md)).
2. Confirm HTML report shows identity matches for AD rows that overlap HR emails.
3. Grep logs for `PHASE 4 Process` and `uncorrelated-sweep` — Match discovery lines should appear for partial name matches.

**See also:** [Configuring sources and scope](configuring-sources-and-scope.md) · [Matching identities](matching-identities.md)

---

## Cookbook 2: Username pool (Records / side-car)

**Goal:** Generate unique usernames from a Records source without creating Fusion accounts or ISC identities for non-matched rows. Fusion runs in [side-car mode](../../glossary.md#deployment-and-integration) (non-authoritative).

### Cookbook 2 — deployment settings

| Setting | Value |
| --- | --- |
| Fusion source **Authoritative** | **No** |
| Records source type | **Records** |
| **Include record accounts in Match** | **Off** (bulk unique registration path) |
| Unique definition | e.g. `#set($i=$firstname.substring(0,1))$i$lastname` with `$counter` fallback |

### Cookbook 2 — Define settings

| Setting | Notes |
| --- | --- |
| **Unique Attribute Definitions** | Username expression with collision disambiguation |
| **Maximum attempts** | 10+ for busy name spaces |
| **Use incremental counter?** | Optional for sequential IDs |

### Cookbook 2 — dry-run validation

1. Run dry-run aggregation with Records source populated.
2. Verify `record-unique-registration` step in logs (`PHASE 4 Process`).
3. Confirm no new Fusion account rows for non-matched Records entries; unique values registered in connector state.

**See also:** [Source types — Records](source-types.md) · [Defining attributes](defining-attributes.md)

---

## Cookbook 3: Contractor orphan cleanup

**Goal:** Supplemental contractor directory (Orphan source) improves Match against existing employees but never creates identities from contractor rows.

### Cookbook 3 — deployment settings

| Setting | Value |
| --- | --- |
| Fusion source **Authoritative** | **No** ([side-car mode](../../glossary.md#deployment-and-integration)) |
| Contractor source type | **Orphan accounts** |
| **Disable non-matching accounts** | **On** — disable stale contractor accounts on managed source |
| Employee sources | **Authoritative** on separate Fusion or authoritative ISC sources |

### Cookbook 3 — Match settings

| Setting | Notes |
| --- | --- |
| **Fusion attribute matches** | `email`, `employeeId` as mandatory Binary rules where available |
| **Manual review match score** | Higher threshold (80+) — contractors should match strongly or drop |
| Reviewers | Per-source reviewer entitlements on employee sources only |

### Cookbook 3 — dry-run validation

1. Dry-run with contractor accounts that match and do not match employees.
2. Confirm matched contractors layer onto existing Fusion identities; non-matched rows absent from output.
3. Grep for `await-disable-ops` when **Disable non-matching accounts** triggers disable actions.

**See also:** [Source types — Orphan](source-types.md) · [Troubleshooting](../validation-and-troubleshooting/troubleshooting.md)

---

## Related references

- [Getting started — Choose your path](../../getting-started/index.md#choose-your-path)
- [Config to account-list phases](../../reference/config-to-phases.md)
- [Analyze changes with dry-run](../operation/analyze-with-dry-run.md)

