# Matching identities

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

| Option                            | Configuration                                                 | Use case                                                                                        |
| --------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Access profiles for reviewers** | Create access profile per source with reviewer entitlement    | Assign reviewers per source for targeted notifications                                          |
| **Fusion report access profile**  | Access profile with "Fusion report" entitlement               | Allow specific users to view potential match reports                                            |
| **Automatic merge**          | **Attribute Matching Settings → Enable automatic merge** | Assign without manual review when the combined score meets the automatic merge match score |

**Screenshot placeholder:** High-level Match flow diagram.

![Match flow - Overview](../../assets/images/match-flow.png)

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

![Match source settings - Baseline](../../assets/images/match-source-settings.png)

<!-- PLACEHOLDER: Screenshot of Source Settings with sources and identity scope for Match. Save as docs/assets/images/match-source-settings.png -->

### Sources configuration

Configure **Source Settings → Sources** to specify which sources contribute account data for merging and comparison:

| Configuration           | Typical setup                                                           | Example                                   |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| **Multiple sources**    | 2–5 authoritative sources                                               | Workday (HR), Active Directory, Okta, SAP |
| **Per-source settings** | Source name (exact match), aggregation mode, account filter | See table below                           |

**Per-source configuration:**

| Field                                    | Value                               | When to use                 | Notes                                                    |
| ---------------------------------------- | ----------------------------------- | --------------------------- | -------------------------------------------------------- |
| **Source name**                          | Exact ISC source name               | Always (required)           | Case-sensitive; verify in Admin → Connections → Sources  |
| **Account aggregation mode**             | **Do not aggregate**                | Default; faster             | Uses existing account data                               |
| **Account aggregation mode**             | **Aggregate before processing**     | Real-time accuracy critical | Each Fusion source aggregation operation triggers fresh source aggregation first  |
| **Account aggregation mode**             | **Delayed aggregation**             | Non-blocking refresh        | Refreshes source accounts after Fusion returns results   |
| **Account filter**                       | Empty                               | Default; all accounts       | Leave empty initially                                    |
| **Account filter**                       | `attributes.accountType:"employee"` | Subset of accounts          | Filter by account attribute                              |
| **Aggregation batch size**               | Empty                               | Process all accounts        | Default for production                                   |
| **Aggregation batch size**               | 1000                                | Phased rollout or testing   | Process first 1000 accounts only                         |

**Source ordering matters:** When using "First found" merge strategy (see [Map](mapping-attributes.md)), the **order** of sources determines precedence. First source in the list has highest priority.

### Processing control configuration

Configure **Source Settings → Processing Control** for account lifecycle:

| Field                                                 | Recommended for Match | Rationale                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Maximum history messages**                          | 10 (default)          | Balance between audit trail and storage                                                                                                                                                                                                                                                       |
| **Delete accounts with no managed accounts left?**    | Yes                   | Auto-cleanup when person leaves organization and all source accounts are removed                                                                                                                                                                                                              |
| **Correlation mode**                                  | **Correlate missing accounts on aggregation** | Automatically correlate new or previously missing source accounts during aggregation. Other options are **Reverse correlation from managed source** (sets a Fusion attribute for ISC native correlation) and **Do not correlate**.                                                         |
| **Force attribute refresh on next aggregation?**      | No                    | Located at **Advanced Settings → Developer Settings**. Applies only to Normal-type attributes; Unique attributes are only computed on account creation or activation. One-time refresh: the option is automatically turned off after the next run. Expensive if attributes change frequently. |

!!! warning "Important"

    When merging a new managed account with an existing identity, managed account correlation will only occur if **Correlation mode** is set to **Correlate missing accounts on aggregation** **or** you have configured an **enforced correlation role** that drives that correlation. Otherwise, the connector will not correlate the new managed account automatically.

---

## Step 2: Configure Attribute Matching Settings for matching

Attribute Matching Settings control how potential matches are detected and reviewed.

### Matching configuration

Configure **Attribute Matching Settings → Matching Settings** to define match detection rules:

| Field                                 | Purpose                                                                        | Recommended value                                  |
| ------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------- |
| **Manual review match score [0-100]** | Global floor for the weighted combined match score                             | 80 (start); tune with false positive/negative rate |
| **Enable automatic merge**       | Skip review when the combined score meets the automatic merge match score | No initially; enable after tuning                  |
| **Fusion attribute matches**          | List of identity attributes to compare                                         | At least 2 attributes (e.g. name + email)          |

**Screenshot placeholder:** Attribute Matching Settings - Matching section.

![Fusion matching settings - Configuration](../../assets/images/match-fusion-matching.png)

<!-- PLACEHOLDER: Screenshot of Attribute Matching Settings > Matching. Save as docs/assets/images/match-fusion-matching.png -->

### Per-attribute match configuration

For each attribute you want to use in match detection, add a **Fusion attribute match**:

| Field                               | Purpose                                                         | Options / Example                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Attribute**                       | Identity attribute name                                         | `name`, `email`, `displayName`, `firstname`, `lastname`                                                                                          |
| **Matching algorithm**              | Similarity calculation method                                   | See [Matching algorithms](tuning-matching-algorithms.md) for details                                                                                    |
| **Minimum similarity [0-100]**      | Threshold for this rule; also its weight in the combined score  | 75–85 (name); 90–100 (email). Higher values are stricter and count more in the blend.                                                            |
| **Mandatory match?**                | Must meet this rule’s minimum for a potential match             | Yes for critical identifiers; passing mandatories still contribute weighted score like other rules.                                              |
| **Skip match if missing**           | Skip when either value is missing                               | Default: Yes. Skipped rules do not affect the combined score.                                                                                    |
| **Skip match if threshold not met** | Skip the rule when its computed similarity is below its minimum | Default: No (off). When enabled, below-threshold non-mandatory rules are excluded from the combined score; mandatory rules are always evaluated. |

!!! tip "Example edge cases"

    When two feeds disagree in subtle ways (for example transposed dates of birth, married-name changes, nicknames vs legal names, phone formatting only, or missing contact on one side), tuning is easier if you compare **fictional** side-by-side rows and recommended algorithms first. See **Real-world matching examples (anonymized)** in [Effective use of matching algorithms](tuning-matching-algorithms.md#real-world-matching-examples-anonymized).

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

**Interaction with `Skip match if threshold not met`:**

- With **Skip match if threshold not met = No** (default), every evaluated rule contributes its weight and raw similarity to the combined score, even when the score is below the rule's own minimum. The rule simply fails to "pass" but still dilutes the blend.
- With **Skip match if threshold not met = Yes**, a non-mandatory rule whose similarity is below its `fusionScore` is excluded from the combined score (zero weight, zero raw score). The combined score is then computed only from the rules that passed their thresholds, which can raise the combined score compared with keeping weak rules in the blend.
- **Mandatory** rules always ignore this toggle: a below-threshold mandatory rule fails the candidate just as it would with the toggle disabled.
- Enabling this option can change the combined score and the manual review / automatic merge outcome. Test with [dry-run mode](../../operations/dry-run.md) before promoting to production.

**Example:**

```
- Name similarity: 85, minimum 80 → weight 80
- Email similarity: 90, minimum 90 → weight 90
- Combined: (85×80 + 90×90) / (80+90) ≈ 87.6
- Manual review match score: 80
→ Potential match if all mandatory rules pass (87.6 ≥ 80)
```

### Automatic merge (thresholds)

| Field                           | Value | Effect                                                                         |
| ------------------------------- | ----- | ------------------------------------------------------------------------------ |
| **Enable automatic merge** | No    | All potential matches go to manual review                                      |
| **Enable automatic merge** | Yes   | Threshold matches are merged without review; borderline cases still reviewed |

**When to enable automatic merge:**

- You have tuned thresholds and are confident in the algorithm
- False positive rate is very low
- You want to reduce manual review burden for obvious matches

**When to keep disabled:**

- Initial setup / testing
- High-risk merges (e.g. financial systems)
- You want human approval for all merges

---

