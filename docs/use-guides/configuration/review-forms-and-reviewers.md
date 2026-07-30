# Review forms and reviewers

This guide covers manual review workflow configuration for Identity Fusion NG Match — review forms, expiration, reviewers, and access profiles.

## Step 3: Configure Attribute Matching Settings for review

Configure **Attribute Matching Settings → Review Settings** for the manual review workflow:

| Field                                                    | Purpose                                     | Recommended value                                             |
| -------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| **List of Fusion account attributes to include in form** | Attributes shown to reviewer                | `name`, `email`, `department`, `manager`, `hireDate`, `phone` |
| **Manual review expiration days**                        | Form expiration                             | 7 (default); adjust based on SLA                              |
| **Maximum candidates per review form**                   | Limit of potential matches shown on form    | 3 (default); valid range 1–15                                 |
| **Owners are global reviewers?**                         | Add Fusion source owner to all review forms | Yes (ensures at least one reviewer)                           |
| **Send report to owner on aggregation?**                 | Email report after each aggregation         | Yes (useful for monitoring)                                   |

!!! note

    The **Maximum candidates per review form** setting lives in **Attribute Matching Settings → Review Settings**. Only the highest-scoring potential matches are included if the limit is exceeded.

### Localization (i18n)

The connector supports fully localized user communications. When **Enable localized user communications?** is toggled on:

- All emails, reports, and Fusion review forms are translated to the recipient's preferred language.
- Provide the **Identity Language Attribute** to instruct the connector on which identity attribute contains the user's language (e.g., `en`, `fr`).
- You can specify a **Default Language** to be used when the recipient's language cannot be determined or the attribute is missing.

### What the aggregation report includes

When **Send report to owner on aggregation?** is enabled, reports include:

- High-level summary (date, total analyzed accounts, potential matches)
- Processing statistics (managed/fusion/review metrics, processing time, memory usage)
- Potential match details with candidate identity score breakdowns
- Failed matching entries (for example, form creation constraints/errors)
- Warning block when more than one Fusion account is found for the same identity, including guidance to review configuration and consider a unique account-name attribute
- Compact aggregation issues summary with warning/error counts and short sampled messages

To avoid oversized reports, warning/error details are intentionally summarized (not full log dumps).

### Non-persistent analysis with dry-run mode

To run report-like analysis without persisting changes, invoke `std:account:list` with the dry-run mode enabled: `{ dryRun: { enabled: true } }`. You can optionally add `saveFile: true` to write the summary and HTML report to disk, or `sendEmail` to deliver the report via email.

Dry-run mode:

- Executes the full Map, Define, and Match pipeline without persistence.
- Sends a terminal summary with totals and diagnostics (rowsSent, identities/managed-accounts found, issue summary, timing) via `res.send`.
- When `saveFile` is enabled, writes an HTML report to `./reports/` before the terminal summary (durable-first ordering).
- When `sendEmail` is set, delivers the report email using the same template as the aggregation report, titled **Identity Fusion Dry Run Report**, before the terminal summary.

Use dry-run mode while tuning matching thresholds, validating source precedence, or reviewing correlation context before enabling/adjusting production automation. See [Dry-run mode](../../operations/dry-run.md) for input options, suppressed side effects, and invocation examples.

**Choosing form attributes:**

Include attributes that help reviewers decide if identities are matches:

| Attribute      | Why include              | Example                                                   |
| -------------- | ------------------------ | --------------------------------------------------------- |
| **name**       | Primary identifier       | John Smith vs J. Smith                                    |
| **email**      | Usually unique           | `john.smith@company.com` vs `jsmith@company.com`          |
| **department** | Context for verification | Engineering vs IT                                         |
| **manager**    | Organizational context   | Same manager → likely same person                         |
| **hireDate**   | Temporal context         | Hired same day → suspicious; years apart → unlikely match |
| **phone**      | Contact verification     | Same phone → likely match                                 |
| **employeeId** | Business key             | Same ID → definitely match; different → investigate       |

**Screenshot placeholder:** Manual review form example.

![Match review form - Example](../../assets/images/match-review-form.png)

<!-- PLACEHOLDER: Screenshot of manual review form for potential matches. Save as docs/assets/images/match-review-form.png -->

**Screenshot placeholder:** Email notification to reviewer.

![Email to reviewer - Notification](../../assets/images/match-email-reviewer.png)

<!-- PLACEHOLDER: Screenshot of email sent to reviewer. Save as docs/assets/images/match-email-reviewer.png -->

---

## Step 4: Set up access profiles for reviewers

### Create reviewer access profiles

For each source, create an access profile that grants reviewer permissions. The connector automatically creates a dedicated reviewer entitlement for each managed source that can be assigned to your users.

While the connector supports establishing the current source owner as a **global reviewer** for all managed sources (via "Owners are global reviewers?"), it is recommended to use the dedicated per-source reviewer entitlements for granular control.

| Access profile                 | Entitlement                                        | Assignment                         |
| ------------------------------ | -------------------------------------------------- | ---------------------------------- |
| **Workday Reviewer**           | Workday reviewer (from Fusion source entitlements) | Assign to HR team members          |
| **Active Directory Reviewer**  | Active Directory reviewer                          | Assign to IT team members          |
| **Global Reviewer (optional)** | Multiple reviewer entitlements                     | Assign to identity governance team |

**Creating a reviewer access profile:**

1. Go to **Admin → Access Profiles → New Access Profile**
2. Name: `<Source Name> Reviewer` (e.g. "Workday Reviewer")
3. Source: Identity Fusion NG (your Fusion source)
4. Add entitlement: `<Source Name> reviewer` (appears after entitlement aggregation)
5. Save and assign to appropriate users/groups

### Create Fusion report access profile

Create an access profile for viewing match reports:

| Access profile    | Entitlement   | Assignment                         | Purpose                                                   |
| ----------------- | ------------- | ---------------------------------- | --------------------------------------------------------- |
| **Fusion Report** | Fusion report | Identity governance team, auditors | View list of potential matches without review permissions |

!!! note

    The Fusion source automatically creates entitlements for each source reviewer and the Fusion report. Run **Entitlement Aggregation** to populate these entitlements.

---

## Enforced correlation role

An **enforced correlation role** is an automatically mergeed ISC role that operates on Fusion identities to ensure that managed accounts are correlated to their corresponding Fusion identities.

- **What it does**
    - Assigns a **correlated action entitlement** to those Fusion identities that currently have either:
        - the **action correlated entitlement**, **or**
        - the **status uncorrelated entitlement**.
    - This means the **assignment criteria intentionally include the same entitlement the role assigns**, and the two conditions (already correlated vs. still uncorrelated) are mutually exclusive.
- **Why the criteria look “always true”**
    - Because the role targets Fusion identities that are either correlated or uncorrelated, its criteria are effectively always true for any Fusion identity in scope. This is **by design**:
        - Uncorrelated accounts get the correlated action entitlement so that they are brought into correlation.
        - Already correlated accounts keep the correlated action entitlement so their state remains consistent.
- **How this relates to aggregation correlation**
    - If **Correlation mode** is set to **Do not correlate**, configuring an enforced correlation role is the supported way to still ensure that new managed accounts are correlated to their Fusion identities during or after aggregation.

---

## End-to-end Match flow

### Flow overview

| Step | Actor         | Action                                                              | Output                                     |
| ---- | ------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| 1    | **Connector** | Account aggregation operations (manual or scheduled)                      | Reads accounts from configured sources     |
| 2    | **Connector** | Merges source account data into Fusion accounts                     | Consolidated accounts per person           |
| 3    | **Connector** | Compares each Fusion account to identities in scope                 | Similarity scores per identity + attribute |
| 4    | **Connector** | If similarity threshold met and automatic merge does not apply | Creates review form                        |
| 5    | **ISC**       | Sends email notification to reviewers                               | Reviewers notified                         |
| 6    | **Reviewer**  | Reviews form, chooses: merge with existing identity or create new      | Decision recorded                          |
| 7    | **Connector** | On next aggregation, applies reviewer decision                      | Account correlated or new identity created |
| 8    | **Connector** | Updates account history                                             | Audit trail maintained                     |

**Video placeholder:** End-to-end matching walkthrough.

<!-- PLACEHOLDER: Video walking through matching: aggregation, match, form, resolution. Save as docs/assets/videos/match-flow.mp4 -->

### Detailed step-by-step

**Step 1–2: Aggregation and merging**

When an account aggregation operation runs on the Fusion source:

1. If **Account aggregation mode** is set to **Aggregate before processing** for any source, trigger aggregation on those sources first
2. Wait for source aggregations to complete (poll task status every 30 seconds, up to the per-source **Aggregation wait timeout (minutes)**)
3. Fetch accounts from each configured source (apply **Account filter** if set)
4. For each person/identity in scope:
    - Fetch correlated accounts from configured sources
    - Merge account data per **Attribute Mapping Settings** (see [Map](mapping-attributes.md))
    - Generate attributes per **Attribute Definition Settings**
    - Result: consolidated Fusion account

**Step 3: Similarity matching**

For each Fusion account (new or updated):

1. Fetch all identities in scope (per **Identity Scope Query**)
2. For each identity, calculate similarity:
    - For each configured **Fusion attribute match**:
        - Fetch attribute value from identity
        - Fetch attribute value from Fusion account
        - Apply **Skip match if missing** for that rule:
            - Enabled (default): skip this rule if either value is `null`, `undefined`, or empty after trim.
            - Disabled: compare values even when one/both are missing, and include the result.
        - Calculate similarity score using specified algorithm
    - Compute **combined match score**: weighted mean of each evaluated rule’s similarity, weights = that rule’s minimum similarity (`fusionScore`; 0 → weight 1)
    - Every evaluated **mandatory** rule must meet its minimum or the candidate is not a match
    - If combined score ≥ **manual review match score** and mandatory rules pass → potential match (non-mandatory rules may be below their minimum but still contribute their raw similarity to the blend)
3. Sort identities by similarity score (highest first)

**Step 4: Decision point**

For each potential match:

| Condition                                                                                            | Action                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Enable automatic merge** = Yes, and **combined score** ≥ **Automatic merge match score** | Skip review form; merge and apply (same as an authorized decision) |
| Else                                                                                                 | Create review form; notify reviewers                                |

**Step 5–6: Manual review**

If review form created:

1. ISC creates form instance with:
    - Proxy account attributes
    - List of potential matching identities with similarity scores
    - Attributes configured in **List of Fusion account attributes to include in form**
2. ISC sends email to:
    - Reviewers assigned via `<Source Name> reviewer` access profiles
    - Global reviewer (if **Owners are global reviewers?** = Yes)
3. First reviewer to complete form makes decision:
    - **Link to existing identity**: Select an identity from the list
    - **Create new identity**: Choose "Create new" option
4. Form submission recorded; other reviewers' forms auto-closed

**Step 7–8: Apply decision**

On next aggregation:

1. Connector processes pending form submissions
2. For "Link to existing identity":
    - Correlates Fusion account to selected identity
    - Updates account attributes from identity
3. For "Create new identity":
    - Leaves Fusion account uncorrelated
    - ISC identity profile creates new identity (since Fusion is authoritative)
4. Updates account history with decision and timestamp

---

## Tuning and optimization

### Initial tuning workflow

| Phase                              | Action                                                                                           | Goal                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **1. Baseline**                    | Set conservative thresholds (e.g. name: 90, email: 95)                                           | Low false positive rate; may miss some matches |
| **2. Test run**                    | Run aggregation with small **Aggregation batch size** (e.g. 100–500 accounts)                    | Evaluate match quality                         |
| **3. Review results**              | Check review forms: Are matches obvious? Many false positives?                                   | Calibrate                                      |
| **4. Adjust**                      | Lower thresholds if missing matches; raise if too many false positives                           | Fine-tune                                      |
| **5. Full rollout**                | Remove **Aggregation batch size** limit; run on all accounts                                     | Production                                     |
| **6. Enable automatic merge** | Once confident, set an automatic merge threshold and toggle **Enable automatic merge** | Reduce manual burden                           |

### Monitoring and metrics

Track these metrics to assess Match effectiveness:

| Metric                        | How to track                                             | Target                                             |
| ----------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| **False positive rate**       | Manual review: % of "Create new" decisions               | <10%                                               |
| **False negative rate**       | Audits: matches that passed through                      | <5%                                                |
| **Review response time**      | Time from form creation to decision                      | <2 days (adjust **Manual review expiration days**) |
| **Automatic merge rate** | % of matches assigned automatically vs manually reviewed | >60% after tuning                                  |

### Common issues and fixes

| Issue                        | Symptom                                     | Fix                                                                                      |
| ---------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **No matches found**         | Zero review forms despite expecting matches | Lower **Similarity score** thresholds; check **Identity Scope Query** returns identities |
| **Too many false positives** | Many obvious non-duplicates flagged         | Raise **Similarity score** thresholds; use **Mandatory match?** for critical attributes  |
| **Reviewer overload**        | Hundreds of review forms                    | Enable **Enable automatic merge** and configure an appropriate assignment threshold |
| **Forms expiring**           | Forms timing out before review              | Increase **Manual review expiration days**; notify reviewers                             |
| **Incorrect algorithm**      | Matches don't make sense                    | Switch algorithm (see [Matching algorithms](tuning-matching-algorithms.md))                     |

!!! tip "Interpreting ambiguous reviews"

    If reviewers repeatedly see “obvious same person” rows that still look risky (for example identical name and email but **different normalized date of birth**, or **policy-sensitive** fields that disagree between sources), compare your thresholds to the walkthroughs in [Real-world matching examples (anonymized)](tuning-matching-algorithms.md#real-world-matching-examples-anonymized)—especially **Transposed date of birth** and **Legal sex or gender marker difference**—then adjust Map/Define normalization, mandatory rules, or review attributes accordingly.

---

## Summary

| Component                                  | Purpose                                      | Key configuration                                                  |
| ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| **Source Settings (Scope)**                | Define identity baseline                     | Include identities = Yes; Identity Scope Query                     |
| **Source Settings (Sources)**              | Sources contributing account data            | Source names (2+); account aggregation mode (optional)             |
| **Attribute Mapping**                      | Merge source attributes into Fusion accounts | Merge strategies (first/list/concatenate)                          |
| **Attribute Matching Settings (Matching)** | Duplicate detection rules                    | Fusion attribute matches; algorithms; scores; automatic merge |
| **Attribute Matching Settings (Review)**   | Manual review workflow                       | Form attributes; expiration days; max candidates; global reviewer  |
| **Access Profiles**                        | Reviewer permissions                         | Per-source reviewer access profiles; Fusion report                 |

**Match requires:**

1. One or more sources (2+ recommended)
2. Identity baseline (highly recommended)
3. Matching configuration (algorithms + thresholds)
4. Review configuration (form attributes + reviewers)
5. Fusion source marked as Authoritative in ISC

**Next steps:**

- For algorithm selection and tuning, see [Effective use of matching algorithms](tuning-matching-algorithms.md).
- For attribute merging strategies, see [Effective use of Map](mapping-attributes.md).
- For ISC setup (connection, schema, identity profile), see [First aggregation](../../getting-started/first-aggregation.md).


