# Matching identities

Configure Identity Fusion NG **Match** rules — similarity detection, combined scoring, and automatic merge thresholds.

**Configuration reference:** [Attribute Matching Settings](../../configuration/matching.md)

**Prerequisites:** [Configuring sources and scope](configuring-sources-and-scope.md) (managed sources, identity scope, correlation mode) · [Source types](source-types.md) · Review workflow: [Review forms and reviewers](review-forms-and-reviewers.md) · [Managing reviewers](managing-reviewers.md)

!!! note "Didactic guide"
    This page explains **how and when** to configure Match settings. For field keys, types, defaults, and constraints, see the linked **Configuration reference**.

---

## When to use Match

| Challenge | Identity Fusion solution |
| --- | --- |
| **Inconsistent data** ("John Smith" vs "J. Smith") | Similarity-based matching with tunable algorithms |
| **Multiple authoritative sources** | Merge profiles from several sources; compare merged result |
| **Manual duplicate resolution** | Automated detection with optional manual review |
| **No baseline comparison** | Compare against existing identities before creating new ones |

![Match flow - Overview](../../assets/images/match-flow.png)

Runtime behavior: [Match flow reference](../../reference/match-flow.md).

---

## Prerequisites

| Requirement | Where to configure |
| --- | --- |
| **One or more managed sources** | [Configuring sources and scope](configuring-sources-and-scope.md) |
| **Fusion source authoritative** (typical Match deployments) | ISC source **Authoritative** flag — see [umbrella mode](configuring-sources-and-scope.md#deployment-modes-umbrella-vs-side-car) |
| **Identity baseline** (when needed) | [Do you need identities in scope?](configuring-sources-and-scope.md#do-you-need-identities-in-scope) |
| **Correlation after merge decisions** | [Managing correlation](managing-correlation.md) |
| **Reviewers and review forms** | [Managing reviewers](managing-reviewers.md) · [Review forms and reviewers](review-forms-and-reviewers.md) |

---

## Matching settings

Configure **Attribute Matching Settings → Matching Settings**:

| Field | Purpose | Recommended value |
| --- | --- | --- |
| **Manual review match score [0-100]** | Global floor for weighted combined score | 80 (start); tune with false positive/negative rate |
| **Enable automatic merge** | Skip review when combined score meets automatic merge threshold | No initially; enable after tuning |
| **Fusion attribute matches** | Identity attributes to compare | At least 2 (e.g. name + email) |

![Fusion matching settings - Configuration](../../assets/images/match-fusion-matching.png)

### Per-attribute match rules

For each **Fusion attribute match**:

| Field | Purpose |
| --- | --- |
| **Attribute** | Identity attribute name (`name`, `email`, `displayName`, …) |
| **Matching algorithm** | Similarity method — see [Tuning matching algorithms](tuning-matching-algorithms.md) |
| **Minimum similarity [0-100]** | Rule threshold; also its weight in the combined score |
| **Mandatory match?** | Rule must pass its minimum for a potential match |
| **Skip match if missing** | Default Yes — skip rule when either value is empty |
| **Skip match if threshold not met** | Default No — exclude below-threshold non-mandatory rules from blend when enabled |

!!! tip "Edge cases"
    For transposed dates of birth, nicknames vs legal names, and similar ambiguous rows, see [Real-world matching examples (anonymized)](tuning-matching-algorithms.md#real-world-matching-examples-anonymized).

Algorithm selection, strategy examples, and threshold tuning: [Tuning matching algorithms](tuning-matching-algorithms.md) · [Match tuning cookbooks](match-tuning-cookbooks.md).

---

## Combined match score

Matching uses one **combined match score**: weighted mean of per-rule similarity scores. Each rule's **minimum similarity** is also its **weight** (values ≤ 0 use weight 1). A **potential match** requires:

- Combined score ≥ **manual review match score**, and
- Every evaluated **mandatory** rule passes its minimum.

**Skip match if missing:** skipped rules do not enter the combined score (default). With **Skip match if missing = No**, the rule is always evaluated.

**Skip match if threshold not met:** when enabled, non-mandatory rules below their minimum are excluded from the blend. Mandatory rules always ignore this toggle.

Test threshold changes with [Analyze changes with dry-run](../operation/analyze-with-dry-run.md) before production.

**Example:**

```
- Name similarity: 85, minimum 80 → weight 80
- Email similarity: 90, minimum 90 → weight 90
- Combined: (85×80 + 90×90) / (80+90) ≈ 87.6
- Manual review match score: 80
→ Potential match if all mandatory rules pass
```

---

## Automatic merge

| **Enable automatic merge** | Effect |
| --- | --- |
| No | All potential matches go to manual review |
| Yes | Scores ≥ automatic merge threshold merge without review; borderline cases still reviewed |

Enable after tuning when false-positive rate is acceptable. Keep disabled during initial setup or high-risk merges.

---

## Related guides

| Topic | Guide |
| --- | --- |
| Sources, scope, baseline | [Configuring sources and scope](configuring-sources-and-scope.md) |
| Algorithms and thresholds | [Tuning matching algorithms](tuning-matching-algorithms.md) |
| Worked deployment examples | [Match tuning cookbooks](match-tuning-cookbooks.md) |
| Review form settings | [Review forms and reviewers](review-forms-and-reviewers.md) |
| End-to-end runtime flow | [Match flow reference](../../reference/match-flow.md) |
