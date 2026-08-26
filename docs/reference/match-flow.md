# Match flow reference

How Identity Fusion NG processes managed accounts through Map, Define, and Match — from aggregation through reviewer decision and correlation.

For configuration, see the [configuration guides](../use-guides/configuration/index.md). For log phase mapping, see [Config to account-list phases](config-to-phases.md).

---

## Flow overview

| Step | Actor         | Action                                                         | Output                                     |
| ---- | ------------- | -------------------------------------------------------------- | ------------------------------------------ |
| 1    | **Connector** | Account aggregation (manual or scheduled)                      | Reads accounts from configured sources     |
| 2    | **Connector** | Merges source account data into Fusion accounts                | Consolidated accounts per person           |
| 3    | **Connector** | Compares each Fusion account to identities in scope            | Similarity scores per identity + attribute |
| 4    | **Connector** | If similarity threshold met and automatic merge does not apply | Creates review form                        |
| 5    | **ISC**       | Sends email notification to reviewers                          | Reviewers notified                         |
| 6    | **Reviewer**  | Reviews form: link to existing identity or create new          | Decision recorded                          |
| 7    | **Connector** | On next aggregation, applies reviewer decision                 | Account correlated or new identity created |
| 8    | **Connector** | Updates account history                                        | Audit trail maintained                     |

![Match flow — aggregation through reviewer decision](../assets/images/match-flow.png)

---

## Aggregation and merging

When an account aggregation operation runs on the Fusion source:

1. If **Account aggregation mode** is **Aggregate before processing** for any source, trigger aggregation on those sources first.
2. Wait for source aggregations to complete (poll task status every 30 seconds, up to the per-source **Aggregation wait timeout (minutes)**).
3. Fetch accounts from each configured source (apply **Account filter** if set).
4. For each person/identity in scope:
    - Fetch correlated accounts from configured sources.
    - Merge account data per **Attribute Mapping Settings** (see [Mapping attributes](../use-guides/configuration/mapping-attributes.md)).
    - Generate attributes per **Attribute Definition Settings**.
    - Result: consolidated Fusion account.

---

## Similarity matching

For each Fusion account (new or updated):

1. Fetch all identities in scope (per **Identity Scope Query** when enabled).
2. For each identity, calculate similarity:
    - For each configured **Fusion attribute match**:
        - Fetch attribute value from identity and Fusion account.
        - Apply **Skip match if missing** (default: skip when either value is empty).
        - Calculate similarity using the configured algorithm.
    - Compute **combined match score**: weighted mean of evaluated rules (weights = each rule's minimum similarity; 0 → weight 1).
    - Every evaluated **mandatory** rule must meet its minimum or the candidate is rejected.
    - If combined score ≥ **manual review match score** and mandatory rules pass → potential match.
3. Sort identities by similarity score (highest first).

Before full similarity scoring, **algorithm-aware candidate blocking** pre-filters identities only when a mandatory
rule has a recall-safe predicate: Binary uses exact values and LIG3 uses its proven length bound. Algorithms such as
Jaro-Winkler do not use generic trigram intersection, so a configuration with no safe blocker scores the full baseline
(`getCandidates` returns `undefined`). After scoring the whole candidate pool, Match retains the globally highest
**top-K identity matches** using review-form order; it does not stop at the first K passing identities. If a managed
account has no value for any indexed mandatory attribute, the candidate set is empty and no identity comparisons run
(`mandatoryMissingBlockCount`). See [Observability — candidate blocking counters](observability.md#candidate-blocking-counters-accountlist-process).

Rule and threshold configuration: [Matching identities](../use-guides/configuration/matching-identities.md) · [Tuning matching algorithms](../use-guides/configuration/tuning-matching-algorithms.md).

---

## Decision point

| Condition                                                                                  | Action                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------ |
| **Enable automatic merge** = Yes, and **combined score** ≥ **Automatic merge match score** | Skip review form; merge and apply    |
| Else                                                                                       | Create review form; notify reviewers |

---

## Manual review

When a review form is created:

1. ISC creates a form instance with proxy account attributes, candidate identities with scores, and attributes from **List of Fusion account attributes to include in form**.
2. ISC sends email to per-source reviewer entitlements and/or global reviewers (**Owners are global reviewers?**).
3. First reviewer to complete the form decides: **Link to existing identity** or **Create new identity**.
4. Form submission is recorded; other pending forms for the same case close automatically.

Form configuration: [Review forms and reviewers](../use-guides/configuration/review-forms-and-reviewers.md) · Reviewer assignment: [Managing reviewers](../use-guides/configuration/managing-reviewers.md).

---

## Apply decision

On the next aggregation:

1. Connector processes pending form submissions.
2. **Link to existing identity** — correlates Fusion account to selected identity; updates attributes.
3. **Create new identity** — leaves Fusion account uncorrelated; ISC identity profile creates new identity when Fusion is authoritative.
4. Updates account history with decision and timestamp.

Correlation behavior: [Managing correlation](../use-guides/configuration/managing-correlation.md).

---

## Related guides

| Topic                      | Guide                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Match rules and thresholds | [Matching identities](../use-guides/configuration/matching-identities.md)               |
| Review form settings       | [Review forms and reviewers](../use-guides/configuration/review-forms-and-reviewers.md) |
| Tuning worked examples     | [Match tuning cookbooks](../use-guides/configuration/match-tuning-cookbooks.md)         |
| Non-persistent validation  | [Analyze changes with dry-run](../use-guides/operation/analyze-with-dry-run.md)         |
