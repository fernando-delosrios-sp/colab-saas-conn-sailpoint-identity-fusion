# Review forms and reviewers

Configure **Attribute Matching Settings → Review Settings** — form attributes, expiration, candidate limits, aggregation reports, and localization-related review fields.

**Configuration reference:** [Attribute Matching Settings — Review](../../configuration/matching.md)

For reviewer assignment and access profiles, see [Managing reviewers](managing-reviewers.md). For runtime behavior after a match is found, see [Match flow reference](../../reference/match-flow.md).

!!! note "Didactic guide"
    This page explains **how and when** to configure review settings. For field keys, types, defaults, and constraints, see the linked **Configuration reference**.

---

## Review settings

| Field | Purpose | Recommended value |
| --- | --- | --- |
| **List of Fusion account attributes to include in form** | Attributes shown to reviewer | `name`, `email`, `department`, `manager`, `hireDate`, `phone` |
| **Manual review expiration days** | Form expiration | 7 (default); adjust based on SLA |
| **Maximum candidates per review form** | Limit of potential matches shown on form | 3 (default); valid range 1–15 |
| **Owners are global reviewers?** | Add Fusion source owner and governance group to all review forms | Yes for pilots |
| **Send report to owner on aggregation?** | Email report after each aggregation | Yes (useful for monitoring) |

!!! note
    When the candidate limit is exceeded, only the highest-scoring potential matches are included.

For localization (**Default Language**, **Identity Language Attribute**, form locale behavior), see [Managing reviewers — Localization and reviewer experience](managing-reviewers.md#localization-and-reviewer-experience).

### Aggregation report contents

When **Send report to owner on aggregation?** is enabled, reports include:

- High-level summary (date, total analyzed accounts, potential matches)
- Processing statistics (managed/fusion/review metrics, processing time, memory usage)
- Potential match details with candidate identity score breakdowns
- Failed matching entries (for example, form creation constraints/errors)
- Warning block when more than one Fusion account is found for the same identity
- Compact aggregation issues summary with warning/error counts and short sampled messages

To preview report content without persisting changes, see [Analyze changes with dry-run](../operation/analyze-with-dry-run.md).

---

## Choosing form attributes

Include attributes that help reviewers decide if identities are matches:

| Attribute | Why include | Example |
| --- | --- | --- |
| **name** | Primary identifier | John Smith vs J. Smith |
| **email** | Usually unique | `john.smith@company.com` vs `jsmith@company.com` |
| **department** | Context for verification | Engineering vs IT |
| **manager** | Organizational context | Same manager → likely same person |
| **hireDate** | Temporal context | Hired same day → suspicious |
| **phone** | Contact verification | Same phone → likely match |
| **employeeId** | Business key | Same ID → investigate if different |

![Match review form - Example](../../assets/images/match-review-form.png)

---

## Tuning review workload

| Concern | Resolve in |
| --- | --- |
| Match thresholds and algorithms | [Tuning matching algorithms](tuning-matching-algorithms.md) · [Match tuning cookbooks](match-tuning-cookbooks.md) |
| Reviewer assignment and SLAs | [Managing reviewers — Workload and SLA tuning](managing-reviewers.md#workload-and-sla-tuning) |
| Validate before production | [Analyze changes with dry-run](../operation/analyze-with-dry-run.md) |

!!! tip "Ambiguous reviews"
    For identical name/email with conflicting DOB or policy-sensitive fields, see [Real-world matching examples (anonymized)](tuning-matching-algorithms.md#real-world-matching-examples-anonymized).

---

## Related guides

| Topic | Guide |
| --- | --- |
| Reviewer assignment | [Managing reviewers](managing-reviewers.md) |
| Match rules and scoring | [Matching identities](matching-identities.md) |
| Runtime flow (form creation → decision) | [Match flow reference](../../reference/match-flow.md) |
| Correlation after link decisions | [Managing correlation](managing-correlation.md) |
