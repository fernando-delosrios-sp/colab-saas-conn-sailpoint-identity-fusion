# Managing reviewers

This guide covers reviewer assignment, access profiles, and workload patterns for Identity Fusion NG manual Match review — who can decide on potential duplicates and how to scale review across sources.

**Configuration reference:** [Attribute Matching Settings — Review](../../configuration/matching.md)

For form fields, expiration, automatic merge, and the end-to-end Match flow, see [Review forms and reviewers](review-forms-and-reviewers.md).

!!! note "Didactic guide"
    This page explains **how and when** to assign and govern reviewers. For field keys, types, defaults, and constraints, see the linked **Configuration reference**.

## Reviewer model

Identity Fusion NG creates **per-source reviewer entitlements** during entitlement aggregation. Assign those entitlements through ISC access profiles so the right people receive review forms for each managed source.

| Mechanism | Scope | Configuration |
| --- | --- | --- |
| **Per-source reviewer entitlement** | One managed source | `<Source Name> reviewer` entitlement on the Fusion source |
| **Global reviewer** | All managed sources | **Owners are global reviewers?** in Attribute Matching Settings → Review |
| **Fusion report** | Read-only match visibility | `Fusion report` entitlement (no review permission) |

## Create reviewer access profiles

For each managed source that can generate review forms:

1. Run **Entitlement Aggregation** on the Fusion source so reviewer entitlements exist.
2. Go to **Admin → Access Profiles → New Access Profile**.
3. Name: `<Source Name> Reviewer` (for example `Workday Reviewer`).
4. Source: your Identity Fusion NG source.
5. Add entitlement: `<Source Name> reviewer`.
6. Assign the access profile to users or groups who should review matches for that source.

| Access profile | Entitlement | Typical assignment |
| --- | --- | --- |
| **Workday Reviewer** | Workday reviewer | HR or source owners |
| **Active Directory Reviewer** | Active Directory reviewer | Directory / IAM team |
| **Global Reviewer (optional)** | Multiple reviewer entitlements | Identity governance lead team |

!!! tip

    Prefer per-source reviewer entitlements for granular control. Use **Owners are global reviewers?** as a safety net so at least the Fusion source owner receives every form — not as the only assignment model in large deployments.

## Global vs per-source reviewers

**Owners are global reviewers?** (Review Settings) adds the Fusion source owner to every review form regardless of which managed source triggered the match.

| Approach | Pros | Cons |
| --- | --- | --- |
| **Per-source profiles only** | Clear ownership; smaller form queues per team | Requires entitlement aggregation after each new source |
| **Global reviewer enabled** | Ensures coverage when source-specific assignment is incomplete | Owner may receive high volume across all sources |
| **Hybrid** | Source teams handle day-to-day; owner escalates | Requires documenting who owns which source |

Forms notify every assigned reviewer; the **first completed submission** wins — other pending forms for the same case close automatically.

## Fusion report access profile

Create a separate profile for stakeholders who need match visibility without review authority:

| Access profile | Entitlement | Purpose |
| --- | --- | --- |
| **Fusion Report** | Fusion report | Auditors, governance leads — view potential matches without deciding |

Enable **Send report to owner on aggregation?** in Review Settings to email aggregation summaries to configured report recipients.

## Localization and reviewer experience

When **Enable localized user communications?** is on:

- Emails and aggregation reports can use reviewer identity language when **Identity Language Attribute** is set.
- **Fusion review forms** use **Default Language** only (shared form definitions are not per-reviewer).

Set **Default Language** to the locale most reviewers expect on form labels and help text.

## Workload and SLA tuning

| Setting | Purpose | Starting point |
| --- | --- | --- |
| **Manual review expiration days** | Auto-close stale forms | 7 days; increase if SLAs are longer |
| **Maximum candidates per review form** | Cap identities shown per form | 3 (range 1–15) |
| **Enable automatic merge** + threshold | Reduce manual volume after tuning | Off initially; enable when false-positive rate is acceptable |

Monitor review metrics:

| Metric | Target signal |
| --- | --- |
| **False positive rate** | High "create new" decisions → raise thresholds |
| **Reviewer overload** | Form backlog → enable automatic merge or add reviewers |
| **Form expiration rate** | Many timeouts → increase expiration days or notify reviewers |

See [Review forms and reviewers — Tuning and optimization](review-forms-and-reviewers.md#tuning-and-optimization) for the full tuning workflow.

## Enforced correlation role (reviewer context)

Reviewers who choose **Link to existing identity** expect managed accounts to correlate on the next aggregation. That requires **Correlate missing accounts on aggregation** or an **enforced correlation role** — not **Do not correlate** alone.

See [Managing correlation](managing-correlation.md) for correlation mode details.

## Dry-run before production review load

Use dry-run mode (`std:account:list` with `{ dryRun: { enabled: true } }`) to preview match volume and report content without creating forms or persisting correlation. Helpful when validating reviewer assignment before enabling Match in production.

See [Dry-run analysis](../operation/dry-run-analysis.md).

## Related guides

| Topic | Guide |
| --- | --- |
| Form attributes, flow, automatic merge | [Review forms and reviewers](review-forms-and-reviewers.md) |
| Match rules and thresholds | [Matching identities](matching-identities.md) |
| Correlation after link decisions | [Managing correlation](managing-correlation.md) |
| First aggregation setup | [Use guides overview](../index.md#first-aggregation-checklist) |
