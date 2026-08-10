# Troubleshooting Identity Fusion NG

Use this page to **match a symptom to the right guide**. Detailed workflows live in topic guides and technical reference — not here.

For log phase mapping during diagnosis, see [Config to account-list phases](../../reference/config-to-phases.md).

---

## Before you start

| Step | Action | Goal |
| --- | --- | --- |
| 1. **Identify symptom** | What fails? When? How often? | Clear problem statement |
| 2. **Gather context** | Logs, configuration, recent changes | Evidence |
| 3. **Route** | Use the [symptom index](#symptom-index) below | Find the canonical guide |
| 4. **Apply fix** | Follow that guide; change one thing at a time | Resolve issue |
| 5. **Verify** | Test end-to-end | Confirm fixed |

| Category | What to collect | Where |
| --- | --- | --- |
| **Configuration** | Source settings, mappings, Match settings | ISC connector configuration |
| **Logs** | Connector logs, aggregation history, external logs | ISC Application Logs; [Monitor aggregation progress](../operation/monitor-aggregation-progress.md) |
| **Environment** | Tenant, connector version, recent changes | Change records, deployment notes |

---

## Symptom index

| Symptom | Likely cause | Resolve in |
| --- | --- | --- |
| Test connection fails | Wrong PAT, URL, or network | [Connection and authentication](#category-1-connection-and-authentication) |
| 401 Unauthorized | Invalid PAT credentials | [Connection and authentication](#category-1-connection-and-authentication) · [ISC PAT scopes](../../reference/pat-scopes.md) |
| 403 Forbidden | PAT missing scopes | [ISC PAT scopes](../../reference/pat-scopes.md) · [Connection Settings](../../configuration/connection.md) |
| Aggregation hangs or times out | Timeout too low; rate limits; slow sources | [Tune API performance](../operation/tune-api-performance.md) · [Monitor aggregation progress](../operation/monitor-aggregation-progress.md) |
| No accounts or fewer than expected | Source name mismatch; filters; scope | [Configuring sources and scope](../configuration/configuring-sources-and-scope.md) |
| Accounts disabled after aggregation | By design until provisioning enables them | [Category 2 — Aggregation](#category-2-aggregation-issues) below |
| Unique Define fails or loops | Expression lacks variability; max attempts too low | [Defining attributes](../configuration/defining-attributes.md) |
| Wrong or missing schema attributes | Config not saved; source name mismatch | [Mapping attributes](../configuration/mapping-attributes.md) · [Defining attributes](../configuration/defining-attributes.md) |
| Velocity expression errors | Null values; syntax errors | [Defining attributes](../configuration/defining-attributes.md) · [Velocity context](../../reference/velocity-context.md) |
| No potential matches (expected some) | Thresholds too high; no baseline | [Matching identities](../configuration/matching-identities.md) · [Tuning matching algorithms](../configuration/tuning-matching-algorithms.md) |
| Too many false positives | Thresholds too low; wrong algorithm | [Tuning matching algorithms](../configuration/tuning-matching-algorithms.md) · [Analyze changes with dry-run](../operation/analyze-with-dry-run.md) |
| Reviewers not receiving forms | Access profiles; global reviewers; expiration | [Managing reviewers](../configuration/managing-reviewers.md) |
| Proxy connection fails | URL, firewall, server down | [Run the connector via proxy](../operation/run-via-proxy.md) · [Proxy deployment](../../reference/proxy-mode.md) |
| Proxy 401 | Password mismatch | [Run the connector via proxy](../operation/run-via-proxy.md) |
| Empty or invalid proxy response | Wrong response format; server error | [Proxy deployment](../../reference/proxy-mode.md) |
| Aggregation very slow | Low concurrency; no batching; large dataset | [Tune API performance](../operation/tune-api-performance.md) |
| High memory usage (proxy) | Large in-memory result sets | [Proxy deployment](../../reference/proxy-mode.md) |
| Cannot interpret logs | Unfamiliar log prefixes | [Monitor aggregation progress](../operation/monitor-aggregation-progress.md) · [Observability](../../reference/observability.md) |
| Stuck processing flag | Prior run did not finish cleanly | [Reset Fusion state](../operation/reset-fusion-state.md) |
| Need to rebuild accounts or clear forms | Major config change; bad state | [Reset Fusion state](../operation/reset-fusion-state.md) |

---

## Category 1: Connection and authentication {#category-1-connection-and-authentication}

No dedicated operation guide — check configuration first.

![Test connection - Interface](../../assets/images/troubleshooting-test-connection.png)

| Symptom | Check | Fix |
| --- | --- | --- |
| **Test connection fails** | API URL format (`https://<tenant>.api.identitynow.com`); PAT ID and secret | Update [Connection Settings](../../configuration/connection.md); regenerate PAT |
| **401 Unauthorized** | PAT revoked or wrong secret | Regenerate PAT; update connector config |
| **403 Forbidden** | Missing scopes | Grant scopes in [ISC PAT scopes](../../reference/pat-scopes.md) |

```bash
curl -X GET "https://[tenant].api.identitynow.com/v3/sources" \
  -H "Authorization: Bearer $(echo -n [clientId]:[clientSecret] | base64)"
# 401 → invalid PAT · 403 → missing scopes · timeout → network/firewall
```

---

## Category 2: Aggregation issues {#category-2-aggregation-issues}

| Symptom | Resolve in |
| --- | --- |
| Hangs, timeouts, HTTP 429 | [Tune API performance](../operation/tune-api-performance.md) |
| Zero or missing accounts | [Configuring sources and scope](../configuration/configuring-sources-and-scope.md) |
| Log phase gaps or stalls | [Monitor aggregation progress](../operation/monitor-aggregation-progress.md) |

**Accounts disabled after first aggregation:** Expected when Fusion is authoritative. New Fusion accounts start disabled until the identity profile provisioning plan **enables** them. Configure lifecycle provisioning in ISC, or enable accounts manually for testing.

---

## Category 3: Attribute and schema issues {#category-3-attribute-and-schema-issues}

| Symptom | Resolve in |
| --- | --- |
| Unique generation loops or collisions | [Defining attributes](../configuration/defining-attributes.md) |
| Schema discovery mismatch | Re-save config; re-run Discover Schema; verify source attribute names in [Mapping attributes](../configuration/mapping-attributes.md) |
| Velocity null or syntax errors | [Defining attributes](../configuration/defining-attributes.md) · [Velocity context](../../reference/velocity-context.md) |

---

## Category 4: Matching issues {#category-4-matching-issues}

| Symptom | Resolve in |
| --- | --- |
| No matches found | [Matching identities](../configuration/matching-identities.md) — baseline and thresholds |
| Too many false positives | [Tuning matching algorithms](../configuration/tuning-matching-algorithms.md) |
| Reviewers not notified | [Managing reviewers](../configuration/managing-reviewers.md) |
| Validate before production changes | [Analyze changes with dry-run](../operation/analyze-with-dry-run.md) |

---

## Category 5: Proxy mode {#category-5-proxy-mode-issues}

See [Run the connector via proxy](../operation/run-via-proxy.md) and [Proxy deployment](../../reference/proxy-mode.md) for setup, password alignment, response format (NDJSON or JSON array), and deployment troubleshooting.

---

## Category 6: Performance {#category-6-performance-issues}

See [Tune API performance](../operation/tune-api-performance.md) for queue settings, RPS, batching, and timeout tuning.

---

## Category 7: Logs and debugging {#category-7-logs-and-debugging}

See [Monitor aggregation progress](../operation/monitor-aggregation-progress.md) for external logging setup and log grep targets. Full segment reference: [Observability and log format](../../reference/observability.md).

![External logging - Configuration](../../assets/images/troubleshooting-external-logging.png)

Use **Debug** external logging level temporarily during investigation; return to **Info** for production.

---

## Category 8: Reset and recovery {#category-8-reset-and-recovery}

See [Reset Fusion state](../operation/reset-fusion-state.md) for **Reset accounts?**, **Reset forms?**, stuck processing flags, and rebuild workflows.

---

## Getting more help

| Resource | Purpose |
| --- | --- |
| [Getting started — Choose your path](../../getting-started/index.md#choose-your-path) | Route to the right configuration or operation guide |
| [Operation guides overview](../operation/index.md) | Goal-based operation navigation |
| [ISC PAT scopes](../../reference/pat-scopes.md) | Required API permissions |
| [SailPoint ISC documentation](https://documentation.sailpoint.com/saas/) | Platform-level issues |

When opening a support case, include: symptom, configuration (secrets redacted), log excerpts with timestamps, connector version, and steps already tried.
