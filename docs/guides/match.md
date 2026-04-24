# Match

This comprehensive guide explains how to use Identity Fusion NG's **Match** capability to **detect and resolve potential matching identities**. This use case **requires one or more sources** to be configured. **Identities are optional but highly recommended** because they provide the baseline to compare mapped and defined accounts against.

---

## When to use this use case

Use Identity Fusion for Match when you face these challenges:

| Challenge                          | Traditional approach                                            | Identity Fusion solution                                            |
| ---------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Inconsistent data**              | Exact correlation fails when name is "John Smith" vs "J. Smith" | Similarity-based matching with tunable algorithms and thresholds    |
| **Multiple authoritative sources** | Must pick one source as authoritative, losing data from others  | Merge data from multiple sources; compare merged profiles           |
| **Manual duplicate resolution**    | Time-consuming manual searches and merges in ISC UI             | Automated detection with optional manual review workflow            |
| **No baseline comparison**         | New accounts always create new identities                       | Compare against existing identity baseline before creating new ones |
| **Audit trail**                    | Manual notes and spreadsheets                                   | Built-in history tracking and review forms with approval workflow   |

---

## Prerequisites and requirements

### Required

| Requirement                                | Configuration                                       | Notes                                                                                                                                                                                                                                     |
| ------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One or more sources**                    | **Source Settings → Authoritative account sources** | At least one source; typically 2+ for Match value                                                                                                                                                                                         |
| **Attribute Matching Settings (Matching)** | **Fusion attribute matches**, algorithms, scores    | Defines similarity detection rules                                                                                                                                                                                                        |
| **Attribute Matching Settings (Review)**   | Form attributes, expiration, reviewers              | Configures manual review workflow                                                                                                                                                                                                         |
| **Authoritative source**                   | ISC source marked as **Authoritative**              | In most cases Fusion must be authoritative so it can determine which incoming managed accounts create a new identity and which correlate to an existing one. Barring edge cases, assume the source is authoritative when Match is needed. |

### Highly recommended

| Recommendation             | Configuration                                       | Benefit                                                                           |
| -------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Identities as baseline** | **Include identities in the scope?** = Yes          | Provides existing identities to compare against; without this, no baseline exists |
| **Identity Scope Query**   | Filter like `attributes.cloudLifecycleState:active` | Limits comparison to relevant identities (e.g. active employees only)             |

### Optional but useful

| Option                                  | Configuration                                                          | Use case                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Access profiles for reviewers**       | Create access profile per source with reviewer entitlement             | Assign reviewers per source for targeted notifications                        |
| **Fusion report access profile**        | Access profile with "Fusion report" entitlement                        | Allow specific users to view potential match reports                          |
| **Automatic assignment (exact scores)** | **Attribute Matching Settings → Automatically assign on exact match?** | Assign without manual review when every rule scores 100 and none were skipped |

**Screenshot placeholder:** High-level Match flow diagram.

![Match flow - Overview](../assets/images/match-flow.png)

<!-- PLACEHOLDER: Diagram or screenshot of Match flow. Save as docs/assets/images/match-flow.png -->

---

## Scope and baseline

- **Sources scope** — Managed accounts coming from the **Authoritative account sources** you configure. Each managed account is processed and either becomes a Fusion account or triggers a Fusion review form; the form can result in creating a new Fusion account or linking the managed account to an existing Fusion account as part of an identity.
- **Identity scope** — Identities selected by **Include identities in the scope?** and **Identity Scope Query**. Identity scope and sources scope are complementary and can overlap.
- **Baseline** — Identities within the identity scope form the **baseline** to which incoming managed accounts are compared during the Match process. Already created Fusion accounts also complement the baseline, so new managed accounts can be compared against both existing identities and existing Fusion accounts.

---

## Step 1: Configure source and baseline settings

### Identity baseline configuration (recommended)

Configure **Source Settings → Scope** to define the baseline of identities to compare against:

| Field                                | Value                                        | Purpose                                  | Example                                              |
| ------------------------------------ | -------------------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| **Include identities in the scope?** | Yes                                          | Provides baseline of existing identities | Compare new accounts to existing employee identities |
| **Identity Scope Query**             | `*`                                          | Use all identities as baseline           | All identities in ISC                                |
| **Identity Scope Query**             | `attributes.cloudLifecycleState:active`      | Only active identities                   | Exclude terminated employees from comparisons        |
| **Identity Scope Query**             | `source.name:"Workday" OR source.name:"ADP"` | Identities from specific sources         | Only HR-sourced identities                           |

**Without a baseline:** If **Include identities in the scope?** is No or Identity Scope Query returns zero identities, there is **no baseline** to compare accounts against. Match cannot detect existing identities—only merge new accounts from configured sources.

**Screenshot placeholder:** Source Settings showing identity scope for baseline.

![Match source settings - Baseline](../assets/images/match-source-settings.png)

<!-- PLACEHOLDER: Screenshot of Source Settings with sources and identity scope for Match. Save as docs/assets/images/match-source-settings.png -->

### Sources configuration

Configure **Source Settings → Sources** to specify which sources contribute account data for merging and comparison:

| Configuration           | Typical setup                                                           | Example                                   |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| **Multiple sources**    | 2–5 authoritative sources                                               | Workday (HR), Active Directory, Okta, SAP |
| **Per-source settings** | Source name (exact match), force aggregation (optional), account filter | See table below                           |

**Per-source configuration:**

| Field                                    | Value                               | When to use                 | Notes                                                    |
| ---------------------------------------- | ----------------------------------- | --------------------------- | -------------------------------------------------------- |
| **Source name**                          | Exact ISC source name               | Always (required)           | Case-sensitive; verify in Admin → Connections → Sources  |
| **Force aggregation before processing?** | No                                  | Default; faster             | Ensures current data but significantly increases runtime |
| **Force aggregation before processing?** | Yes                                 | Real-time accuracy critical | Each Fusion run triggers fresh source aggregation        |
| **Account filter**                       | Empty                               | Default; all accounts       | Leave empty initially                                    |
| **Account filter**                       | `attributes.accountType:"employee"` | Subset of accounts          | Filter by account attribute                              |
| **Aggregation batch size**               | Empty                               | Process all accounts        | Default for production                                   |
| **Aggregation batch size**               | 1000                                | Phased rollout or testing   | Process first 1000 accounts only                         |

**Source ordering matters:** When using "First found" merge strategy (see [Map](map.md)), the **order** of sources determines precedence. First source in the list has highest priority.

### Processing control configuration

Configure **Source Settings → Processing Control** for account lifecycle:

| Field                                                        | Recommended for Match | Rationale                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maximum history messages**                                 | 10 (default)          | Balance between audit trail and storage                                                                                                                                                                                                                       |
| **Delete accounts with no managed accounts left?**           | Yes                   | Auto-cleanup when person leaves organization and all source accounts are removed                                                                                                                                                                              |
| **Correlate missing source accounts on aggregation?**        | Yes                   | Automatically correlate new or previously missing source accounts. When this is **disabled**, a new managed account will **not** be correlated to an existing identity during aggregation unless you also configure an enforced correlation role (see below). |
| **Force Normal-type attribute refresh on each aggregation?** | No                    | Located at **Advanced Settings → Developer Settings**. Applies only to Normal-type attributes; Unique attributes are only computed on account creation or activation. Expensive if attributes change frequently.                                              |

> **Important:** When merging a new managed account with an existing identity, managed account correlation will only occur if **Correlate missing source accounts on aggregation?** is enabled **or** you have configured an **enforced correlation role** that drives that correlation. Otherwise, the connector will not correlate the new managed account automatically.

---

## Step 2: Configure Attribute Matching Settings for matching

Attribute Matching Settings control how potential matches are detected and reviewed.

### Matching configuration

Configure **Attribute Matching Settings → Matching Settings** to define match detection rules:

| Field                                    | Purpose                                                  | Recommended value                                  |
| ---------------------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| **Minimum combined match score [0-100]** | Global floor for the weighted combined match score       | 80 (start); tune with false positive/negative rate |
| **Automatically assign on exact match?** | Skip review when every real rule is 100 and none skipped | No initially; enable after tuning                  |
| **Fusion attribute matches**             | List of identity attributes to compare                   | At least 2 attributes (e.g. name + email)          |

**Screenshot placeholder:** Attribute Matching Settings - Matching section.

![Fusion matching settings - Configuration](../assets/images/match-fusion-matching.png)

<!-- PLACEHOLDER: Screenshot of Attribute Matching Settings > Matching. Save as docs/assets/images/match-fusion-matching.png -->

### Per-attribute match configuration

For each attribute you want to use in match detection, add a **Fusion attribute match**:

| Field                          | Purpose                                                        | Options / Example                                                                                                                               |
| ------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Attribute**                  | Identity attribute name                                        | `name`, `email`, `displayName`, `firstname`, `lastname`                                                                                         |
| **Matching algorithm**         | Similarity calculation method                                  | See [Matching algorithms](matching-algorithms.md) for details                                                                                   |
| **Minimum similarity [0-100]** | Threshold for this rule; also its weight in the combined score | 75–85 (name); 90–100 (email). Higher values are stricter and count more in the blend.                                                           |
| **Mandatory match?**           | Must meet this rule’s minimum for a potential match            | Yes for critical identifiers; passing mandatories still contribute weighted score like other rules.                                             |
| **Skip match if missing**      | Skip when either value is missing                              | Default: Yes. Skipped rules do not affect the combined score. Automatic assignment on exact match requires no skipped rules and all scores 100. |

> **Example edge cases:** When two feeds disagree in subtle ways (for example transposed dates of birth, married-name changes, nicknames vs legal names, phone formatting only, or missing contact on one side), tuning is easier if you compare **fictional** side-by-side rows and recommended algorithms first. See **Real-world matching examples (anonymized)** in [Effective use of matching algorithms](matching-algorithms.md#real-world-matching-examples-anonymized).

**Algorithm selection guide:**

| Attribute type                     | Recommended algorithm | Typical score threshold | Notes                                                  |
| ---------------------------------- | --------------------- | ----------------------- | ------------------------------------------------------ |
| **Full name / display name**       | Enhanced Name Matcher | 75–85                   | Handles order, titles, cultural variations             |
| **First / last name**              | Enhanced Name Matcher | 80–90                   | More strict for individual name components             |
| **Email**                          | Jaro-Winkler          | 90–95                   | Should be high; emails are usually exact or very close |
| **Employee ID / username**         | Jaro-Winkler          | 95–100                  | Nearly exact match required                            |
| **Address / job title**            | Dice                  | 70–80                   | Longer text; more tolerance for variation              |
| **Phone number**                   | Jaro-Winkler          | 85–95                   | After normalization                                    |
| **Names with spelling variations** | Double Metaphone      | 75–85                   | Phonetic; handles "John"/"Jon", "Smith"/"Smyth"        |

**Common matching strategies:**

```
Strategy 1: Name + Email (balanced)
- Attribute: name, Algorithm: Enhanced Name Matcher, Score: 80
- Attribute: email, Algorithm: Jaro-Winkler, Score: 90
→ Both must score above threshold; good balance of flexibility and accuracy

Strategy 2: Strict email match
- Attribute: email, Algorithm: Jaro-Winkler, Score: 98, Mandatory: Yes
→ Email must nearly match; prevents false positives

Strategy 3: Multiple name components
- Attribute: firstname, Algorithm: Enhanced Name Matcher, Score: 85
- Attribute: lastname, Algorithm: Enhanced Name Matcher, Score: 90
- Attribute: email, Algorithm: Jaro-Winkler, Score: 80
→ All three contribute similarities and weights to the combined match score

Strategy 4: Phonetic name matching
- Attribute: name, Algorithm: Double Metaphone, Score: 80
→ Catches spelling variations ("Catherine"/"Katherine")
```

### Combined match score (weighted)

Matching always uses one **combined match score**: a weighted mean of per-rule similarity scores. Each rule’s **minimum similarity** (`fusionScore`) is also its **weight** in the blend (values ≤ 0 use weight 1). The **minimum combined match score** is the global threshold: a **potential match** requires combined ≥ that value **and** every evaluated **mandatory** rule to pass its own minimum.

**Interaction with `Skip match if missing`:**

- With **Skip match if missing = Yes** (default), a missing-value rule is skipped: it does not enter the combined score.
- With **Skip match if missing = No**, that rule is always evaluated and contributes to the combined score.
- **Mandatory** rules that are evaluated must pass their minimum or the candidate is rejected.

**Example:**

```
- Name similarity: 85, minimum 80 → weight 80
- Email similarity: 90, minimum 90 → weight 90
- Combined: (85×80 + 90×90) / (80+90) ≈ 87.6
- Minimum combined match score: 80
→ Potential match if all mandatory rules pass (87.6 ≥ 80)
```

### Automatic assignment (exact scores)

| Field                                    | Value | Effect                                                                     |
| ---------------------------------------- | ----- | -------------------------------------------------------------------------- |
| **Automatically assign on exact match?** | No    | All potential matches go to manual review                                  |
| **Automatically assign on exact match?** | Yes   | Exact matches are assigned without review; borderline cases still reviewed |

**When to enable automatic assignment:**

- You have tuned thresholds and are confident in the algorithm
- False positive rate is very low
- You want to reduce manual review burden for obvious matches

**When to keep disabled:**

- Initial setup / testing
- High-risk merges (e.g. financial systems)
- You want human approval for all merges

---

## Step 3: Configure Attribute Matching Settings for review

Configure **Attribute Matching Settings → Review Settings** for the manual review workflow:

| Field                                              | Purpose                                     | Recommended value                                             |
| -------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| **List of identity attributes to include in form** | Attributes shown to reviewer                | `name`, `email`, `department`, `manager`, `hireDate`, `phone` |
| **Manual review expiration days**                  | Form expiration                             | 7 (default); adjust based on SLA                              |
| **Owner is global reviewer?**                      | Add Fusion source owner to all review forms | Yes (ensures at least one reviewer)                           |
| **Send report to owner on aggregation?**           | Email report after each aggregation         | Yes (useful for monitoring)                                   |

> **Note:** The maximum number of candidate identities shown on a single review form is controlled by **Max match candidates per review form** in **Advanced Settings → Developer Settings** (default for new sources comes from `fusionMaxCandidatesForForm` in `connector-spec.json` → `sourceConfigInitialValues`; max 15). Only the highest-scoring potential matches are included if the limit is exceeded.

### What the aggregation report includes

When **Send report to owner on aggregation?** is enabled, reports include:

- High-level summary (date, total analyzed accounts, potential matches)
- Processing statistics (managed/fusion/review metrics, processing time, memory usage)
- Potential match details with candidate identity score breakdowns
- Failed matching entries (for example, form creation constraints/errors)
- Warning block when more than one Fusion account is found for the same identity, including guidance to review configuration and consider a unique account-name attribute
- Compact aggregation issues summary with warning/error counts and short sampled messages

To avoid oversized reports, warning/error details are intentionally summarized (not full log dumps).

### Non-persistent analysis with `custom:dryrun`

When you want report-like visibility during aggregation analysis without persisting changes, run the connector command `custom:dryrun`.

`custom:dryrun`:

- Executes fetch + matching analysis flow only (no account-list persistence/writeback phase).
- Streams final ISC account rows with an additional `attributes.matching` object.
- Includes matching and non-matching visibility in `matching.status` and `matching.matches`.
- Sends a final `custom:dryrun:summary` payload with totals and diagnostics (warnings/errors and sampled messages).

Use this command while tuning matching thresholds, validating source precedence, or reviewing correlation context before enabling/adjusting production automation.

**Choosing form attributes:**

Include attributes that help reviewers decide if identities are matches:

| Attribute      | Why include              | Example                                                   |
| -------------- | ------------------------ | --------------------------------------------------------- |
| **name**       | Primary identifier       | John Smith vs J. Smith                                    |
| **email**      | Usually unique           | john.smith@company.com vs jsmith@company.com              |
| **department** | Context for verification | Engineering vs IT                                         |
| **manager**    | Organizational context   | Same manager → likely same person                         |
| **hireDate**   | Temporal context         | Hired same day → suspicious; years apart → unlikely match |
| **phone**      | Contact verification     | Same phone → likely match                                 |
| **employeeId** | Business key             | Same ID → definitely match; different → investigate       |

**Screenshot placeholder:** Manual review form example.

![Match review form - Example](../assets/images/match-review-form.png)

<!-- PLACEHOLDER: Screenshot of manual review form for potential matches. Save as docs/assets/images/match-review-form.png -->

**Screenshot placeholder:** Email notification to reviewer.

![Email to reviewer - Notification](../assets/images/match-email-reviewer.png)

<!-- PLACEHOLDER: Screenshot of email sent to reviewer. Save as docs/assets/images/match-email-reviewer.png -->

---

## Step 4: Set up access profiles for reviewers

### Create reviewer access profiles

For each source, create an access profile that grants reviewer permissions. The connector automatically creates a dedicated reviewer entitlement for each managed source that can be assigned to your users.

While the connector supports establishing the current source owner as a **global reviewer** for all managed sources (via "Owner is global reviewer?"), it is recommended to use the dedicated per-source reviewer entitlements for granular control.

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

**Note:** The Fusion source automatically creates entitlements for each source reviewer and the Fusion report. Run **Entitlement Aggregation** to populate these entitlements.

---

## Enforced correlation role

An **enforced correlation role** is an automatically assigned ISC role that operates on Fusion identities to ensure that managed accounts are correlated to their corresponding Fusion identities.

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
    - If **Correlate missing source accounts on aggregation?** is disabled, configuring an enforced correlation role is the supported way to still ensure that new managed accounts are correlated to their Fusion identities during or after aggregation.

---

## End-to-end Match flow

### Flow overview

| Step | Actor         | Action                                                              | Output                                     |
| ---- | ------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| 1    | **Connector** | Account aggregation runs (manual or scheduled)                      | Reads accounts from configured sources     |
| 2    | **Connector** | Merges source account data into Fusion accounts                     | Consolidated accounts per person           |
| 3    | **Connector** | Compares each Fusion account to identities in scope                 | Similarity scores per identity + attribute |
| 4    | **Connector** | If similarity threshold met and automatic assignment does not apply | Creates review form                        |
| 5    | **ISC**       | Sends email notification to reviewers                               | Reviewers notified                         |
| 6    | **Reviewer**  | Reviews form, chooses: link to existing identity or create new      | Decision recorded                          |
| 7    | **Connector** | On next aggregation, applies reviewer decision                      | Account correlated or new identity created |
| 8    | **Connector** | Updates account history                                             | Audit trail maintained                     |

**Video placeholder:** End-to-end matching walkthrough.

<!-- PLACEHOLDER: Video walking through matching: aggregation, match, form, resolution. Save as docs/assets/videos/match-flow.mp4 -->

### Detailed step-by-step

**Step 1–2: Aggregation and merging**

When account aggregation runs on the Fusion source:

1. If **Force aggregation before processing?** is enabled for any source, trigger aggregation on those sources first
2. Wait for source aggregations to complete (poll task status every 30 seconds, up to the per-source **Aggregation wait timeout (minutes)**)
3. Fetch accounts from each configured source (apply **Account filter** if set)
4. For each person/identity in scope:
    - Fetch correlated accounts from configured sources
    - Merge account data per **Attribute Mapping Settings** (see [Map](map.md))
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
    - If combined score ≥ **minimum combined match score** and mandatory rules pass → potential match (non-mandatory rules may be below their minimum but still contribute their raw similarity to the blend)
3. Sort identities by similarity score (highest first)

**Step 4: Decision point**

For each potential match:

| Condition                                                                                                                                             | Action                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Automatically assign on exact match?** = Yes, **every** real rule was evaluated (none skipped), and **all** attribute similarity scores are **100** | Skip review form; assign and apply (same as an authorized decision) |
| Else                                                                                                                                                  | Create review form; notify reviewers                                |

**Step 5–6: Manual review**

If review form created:

1. ISC creates form instance with:
    - Proxy account attributes
    - List of potential matching identities with similarity scores
    - Attributes configured in **List of identity attributes to include in form**
2. ISC sends email to:
    - Reviewers assigned via `<Source Name> reviewer` access profiles
    - Global reviewer (if **Owner is global reviewer?** = Yes)
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

| Phase                              | Action                                                                        | Goal                                           |
| ---------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| **1. Baseline**                    | Set conservative thresholds (e.g. name: 90, email: 95)                        | Low false positive rate; may miss some matches |
| **2. Test run**                    | Run aggregation with small **Aggregation batch size** (e.g. 100–500 accounts) | Evaluate match quality                         |
| **3. Review results**              | Check review forms: Are matches obvious? Many false positives?                | Calibrate                                      |
| **4. Adjust**                      | Lower thresholds if missing matches; raise if too many false positives        | Fine-tune                                      |
| **5. Full rollout**                | Remove **Aggregation batch size** limit; run on all accounts                  | Production                                     |
| **6. Enable automatic assignment** | Once confident, enable **Automatically assign on exact match?**               | Reduce manual burden                           |

### Monitoring and metrics

Track these metrics to assess Match effectiveness:

| Metric                        | How to track                                             | Target                                             |
| ----------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| **False positive rate**       | Manual review: % of "Create new" decisions               | <10%                                               |
| **False negative rate**       | Audits: matches that passed through                      | <5%                                                |
| **Review response time**      | Time from form creation to decision                      | <2 days (adjust **Manual review expiration days**) |
| **Automatic assignment rate** | % of matches assigned automatically vs manually reviewed | >60% after tuning                                  |

### Common issues and fixes

| Issue                        | Symptom                                     | Fix                                                                                      |
| ---------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **No matches found**         | Zero review forms despite expecting matches | Lower **Similarity score** thresholds; check **Identity Scope Query** returns identities |
| **Too many false positives** | Many obvious non-duplicates flagged         | Raise **Similarity score** thresholds; use **Mandatory match?** for critical attributes  |
| **Reviewer overload**        | Hundreds of review forms                    | Enable **Automatically assign on exact match?**; raise thresholds                        |
| **Forms expiring**           | Forms timing out before review              | Increase **Manual review expiration days**; notify reviewers                             |
| **Incorrect algorithm**      | Matches don't make sense                    | Switch algorithm (see [Matching algorithms](matching-algorithms.md))                     |

**Interpreting ambiguous reviews:** If reviewers repeatedly see “obvious same person” rows that still look risky (for example identical name and email but **different normalized date of birth**, or **policy-sensitive** fields that disagree between sources), compare your thresholds to the walkthroughs in [Real-world matching examples (anonymized)](matching-algorithms.md#real-world-matching-examples-anonymized)—especially **Transposed date of birth** and **Legal sex or gender marker difference**—then adjust Map/Define normalization, mandatory rules, or review attributes accordingly.

---

## Summary

| Component                                  | Purpose                                      | Key configuration                                                  |
| ------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------ |
| **Source Settings (Scope)**                | Define identity baseline                     | Include identities = Yes; Identity Scope Query                     |
| **Source Settings (Sources)**              | Sources contributing account data            | Source names (2+); Force aggregation (optional)                    |
| **Attribute Mapping**                      | Merge source attributes into Fusion accounts | Merge strategies (first/list/concatenate)                          |
| **Attribute Matching Settings (Matching)** | Duplicate detection rules                    | Fusion attribute matches; algorithms; scores; automatic assignment |
| **Attribute Matching Settings (Review)**   | Manual review workflow                       | Form attributes; expiration days; global reviewer                  |
| **Access Profiles**                        | Reviewer permissions                         | Per-source reviewer access profiles; Fusion report                 |

**Match requires:**

1. One or more sources (2+ recommended)
2. Identity baseline (highly recommended)
3. Matching configuration (algorithms + thresholds)
4. Review configuration (form attributes + reviewers)
5. Fusion source marked as Authoritative in ISC

**Next steps:**

- For algorithm selection and tuning, see [Effective use of matching algorithms](matching-algorithms.md).
- For attribute merging strategies, see [Effective use of Map](map.md).
- For ISC setup (connection, schema, identity profile), see the [repository README](../home.md#quick-start).
