# Effective Use of Matching Algorithms

Identity Fusion NG uses **similarity scoring** to detect potential matching identities. This comprehensive guide helps you choose, configure, and tune the **matching algorithms** used in **Attribute Matching Settings → Matching Settings** for optimal matching results.

---

## Overview: Matching in Identity Fusion

Matching algorithms calculate **similarity scores** (0–100) between attribute values from different identities. These scores determine whether two identities are potential matches.

| Component                      | Purpose                            | Configuration location                                                              |
| ------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------- |
| **Fusion attribute matches**   | Define which attributes to compare | Attribute Matching Settings → Matching Settings                                                 |
| **Matching algorithm**         | How to calculate similarity        | Per attribute (Enhanced Name Matcher, Jaro-Winkler, Dice, Double Metaphone, Custom) |
| **Minimum similarity (per rule)** | Threshold for that rule; also its weight in the combined score | Per attribute (0–100)                                                    |
| **Minimum combined match score**  | Global floor for the weighted combined score                  | Matching Settings (0–100)                                                 |
| **Mandatory match**               | Rule must pass its minimum for a potential match              | Per attribute (Yes/No)                                                    |

**Screenshot placeholder:** Fusion attribute matches configuration.

![Fusion attribute matches - Configuration interface](../assets/images/matching-algorithms-config.png)

<!-- PLACEHOLDER: Screenshot of Attribute Matching Settings > Fusion attribute matches. Save as docs/assets/images/matching-algorithms-config.png -->

---

## Algorithm selection guide

### Algorithm comparison matrix

| Algorithm                 | Best for                                          | Strengths                                                              | Weaknesses                                                       | Computational cost |
| ------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------ |
| **Enhanced Name Matcher** | Person names (full, first, last)                  | Handles order variations, titles, suffixes, cultural naming, nicknames | May be overly permissive for non-name fields                     | Medium             |
| **Jaro-Winkler**          | Short strings, codes, emails, usernames           | Emphasizes prefix matching; good for typos at start; fast              | Less effective for long text; suffix typos score lower           | Low                |
| **Dice**                  | Longer text (addresses, job titles, descriptions) | Robust for substring matching; handles reordering well                 | Can miss phonetic variations; requires adequate text length      | Medium             |
| **Double Metaphone**      | Names with spelling variations, phonetic matching | Catches "Catherine"/"Katherine", "John"/"Jon", "Smith"/"Smyth"         | May generate false positives for short names; language-dependent | Low                |
| **LIG3**                  | Compound identifiers, names with missing parts    | Excellent with international accents and compound gap handling         | Heavily punishes transpositions (e.g. inverted dates/names)      | High               |
| **Custom**                | Domain-specific requirements                      | Your own logic via SaaS customizer                                     | Requires development and testing                                 | Variable           |

### Decision tree: Which algorithm to use?

```
What type of attribute are you comparing?

├─ Person name (full, first, last)
│  ├─ Standard spellings expected → Enhanced Name Matcher
│  └─ Phonetic variations expected → Double Metaphone or Enhanced Name Matcher
│
├─ Email address
│  ├─ Domain matters → Jaro-Winkler (emphasizes prefix before @)
│  └─ Typo tolerance → Jaro-Winkler
│
├─ Username / employee ID / short code
│  └─ High precision needed → Jaro-Winkler (high threshold: 95–100)
│
├─ Address / job title / longer text
│  └─ Substring/phrase matching → Dice
│
├─ Phone number
│  └─ After normalization → Jaro-Winkler
│
└─ Custom business logic
   └─ Custom (from SaaS customizer)
```

---

## Algorithm deep dive

### Enhanced Name Matcher

**Purpose:** Specialized algorithm for person names with cultural awareness and variation handling.

**How it works:**

- Tokenizes names into components (first, middle, last, titles, suffixes)
- Normalizes order (handles "Smith, John" vs "John Smith")
- Recognizes titles (Dr., Mr., Mrs., Prof.) and suffixes (Jr., Sr., III)
- Handles cultural naming patterns (e.g., Asian name order, Hispanic compound surnames)
- Matches nicknames (e.g., "William" matches "Bill", "Robert" matches "Bob")

**Recommended thresholds:**

| Use case                         | Threshold | Rationale                                          |
| -------------------------------- | --------- | -------------------------------------------------- |
| Full name (e.g. "John A. Smith") | 75–85     | Allows middle initial variation, title differences |
| First name only                  | 80–90     | Less context; require closer match                 |
| Last name only                   | 85–92     | Critical identifier; be stricter                   |
| Display name (formatted)         | 75–85     | May include titles, formatting differences         |

**Examples:**

| String 1        | String 2       | Score | Match? (threshold 80) |
| --------------- | -------------- | ----- | --------------------- |
| John Smith      | John Smith     | 100   | Yes                   |
| John Smith      | J. Smith       | 85    | Yes                   |
| John Smith      | Smith, John    | 95    | Yes                   |
| Dr. John Smith  | John Smith Jr. | 88    | Yes                   |
| John Smith      | Jane Smith     | 50    | No                    |
| John A. Smith   | John B. Smith  | 92    | Yes                   |
| William Johnson | Bill Johnson   | 90    | Yes (nickname match)  |

**When to use:**

- Comparing `name`, `displayName`, `firstname`, `lastname` attributes
- You expect name variations (order, titles, middle initials)
- Cultural diversity in names

**When NOT to use:**

- Non-name fields (email, address, etc.) → use other algorithms
- You need exact or near-exact matches → use Jaro-Winkler with high threshold

### Jaro-Winkler

**Purpose:** General-purpose string similarity with emphasis on prefix matching.

**How it works:**

- Calculates Jaro distance (transpositions and character matches)
- Applies prefix weighting (first 4 characters heavily weighted)
- Results in score 0–100 (higher = more similar)

**Recommended thresholds:**

| Use case                       | Threshold | Rationale                                           |
| ------------------------------ | --------- | --------------------------------------------------- |
| Email address                  | 90–95     | Should be nearly exact; prefix (before @) important |
| Username                       | 92–98     | Critical identifier; little tolerance for variation |
| Employee ID / badge number     | 95–100    | Must be nearly exact                                |
| Phone number (normalized)      | 85–92     | Some tolerance for formatting                       |
| Short text fields (5–15 chars) | 85–90     | Suitable for short strings                          |

**Prefix weighting example:**

| String 1               | String 2               | Score | Note                                        |
| ---------------------- | ---------------------- | ----- | ------------------------------------------- |
| john.smith@company.com | john.smyth@company.com | 95    | High due to strong prefix match             |
| john.smith@company.com | jane.smith@company.com | 82    | Lower due to prefix mismatch (john vs jane) |
| smithj@company.com     | smithjo@company.com    | 97    | Very close; prefix nearly identical         |

**When to use:**

- Email addresses (prefix before @ is critical)
- Usernames, employee IDs (should be nearly exact)
- Short text with potential typos
- When beginning of string is more important than end

**When NOT to use:**

- Long text (addresses, descriptions) → use Dice
- Phonetic matching needed → use Double Metaphone
- Name variations (order, titles) → use Enhanced Name Matcher

### Dice (Sørensen-Dice coefficient)

**Purpose:** Bigram-based similarity for longer text strings.

**How it works:**

- Breaks each string into bigrams (2-character sequences)
    - Example: "hello" → ["he", "el", "ll", "lo"]
- Calculates: `2 * (shared bigrams) / (total bigrams in both strings)`
- Converts to 0–100 scale

**Recommended thresholds:**

| Use case                       | Threshold | Rationale                            |
| ------------------------------ | --------- | ------------------------------------ |
| Address (street, city, full)   | 70–80     | Allows reordering, abbreviations     |
| Job title                      | 72–82     | Tolerates slight wording differences |
| Department name                | 75–85     | Moderate strictness                  |
| Longer text fields (>20 chars) | 70–80     | Good for substring/phrase matching   |

**Examples:**

| String 1                 | String 2            | Score | Match? (threshold 75) |
| ------------------------ | ------------------- | ----- | --------------------- |
| 123 Main Street          | 123 Main St         | 88    | Yes                   |
| Senior Software Engineer | Software Engineer   | 78    | Yes                   |
| Engineering Department   | Engineering Dept    | 85    | Yes                   |
| 123 Main Street Apt 4B   | 123 Main St Unit 4B | 82    | Yes                   |
| New York                 | Los Angeles         | 42    | No                    |

**When to use:**

- Addresses (street, city, full address)
- Job titles
- Department names
- Any text field >15–20 characters
- When substring/phrase matching is important

**When NOT to use:**

- Names (cultural variations) → use Enhanced Name Matcher
- Short strings (<10 chars) → use Jaro-Winkler
- Phonetic matching → use Double Metaphone

### Double Metaphone

**Purpose:** Phonetic algorithm that generates pronunciation codes for strings.

**How it works:**

- Generates one or two phonetic codes for each string
- Codes represent pronunciation (not spelling)
- Compares codes for similarity
- Language rules: English-centric (handles some European languages)

**Recommended thresholds:**

| Use case              | Threshold | Rationale                           |
| --------------------- | --------- | ----------------------------------- |
| First name (phonetic) | 75–85     | Allow phonetic variations           |
| Last name (phonetic)  | 80–88     | More critical; be slightly stricter |
| Full name (phonetic)  | 75–85     | Combined phonetic matching          |

**Examples:**

| String 1  | String 2  | Phonetic match?     | Score (approx) |
| --------- | --------- | ------------------- | -------------- |
| Catherine | Katherine | Yes (both → "K0RN") | 90             |
| John      | Jon       | Yes (both → "JN")   | 95             |
| Smith     | Smyth     | Yes (both → "SM0")  | 92             |
| Stephen   | Steven    | Yes (both → "STFN") | 88             |
| Philip    | Phillip   | Yes (both → "FLP")  | 90             |
| Garcia    | Garsia    | Yes                 | 85             |
| McDonald  | MacDonald | Yes                 | 88             |

**When to use:**

- Names with known spelling variations
- International names with multiple spellings
- When pronunciation matters more than spelling
- Complementary to Enhanced Name Matcher for difficult cases

**When NOT to use:**

- Email addresses, IDs (spelling is exact)
- Non-name fields
- Very short strings (<4 characters) → less reliable
- Non-English names (algorithm is English-centric)

### LIG3

**Purpose:** Advanced hybrid algorithm combining token handling with Levenshtein-style penalties.

**How it works:**

- Evaluates character variations and normalizes accents (e.g., highly accurate for "José" vs "Jose").
- Considers gaps and missing elements conservatively across compound identifiers.
- Positional weighting prevents over-penalizing missing middle names.

**Recommended thresholds:**

| Use case                         | Threshold | Rationale                                          |
| -------------------------------- | --------- | -------------------------------------------------- |
| Compound identifier / Full name  | 70–80     | Allows for missing words/tokens                    |
| Short identifier                 | 85–95     | Be stricter with short strings                     |

**Examples:**

| String 1        | String 2       | Score | Match? (threshold 75) |
| --------------- | -------------- | ----- | --------------------- |
| José Garcia     | Jose Garcia    | 100   | Yes                   |
| John Robert Doe | John Doe       | 64    | No                    |
| 05-10-1990      | 10-05-1990     | 46    | No                    |
| Christopher     | Christoper     | 74    | No (borderline typo)  |

**When to use:**

- Full names or compound identifiers where structural layout matters.
- You have international characters that need to be evaluated gracefully.

**When NOT to use:**

- You expect transpositions (e.g. swapped DOBs, or swapped first/last names). LIG3 heavily penalizes misordered data.
- Short substrings or pure typographical error matching—Jaro-Winkler handles typos better.

### Custom (from SaaS customizer)

**Purpose:** Domain-specific matching logic implemented in a [SailPoint SaaS Connectivity Customizer](https://developer.sailpoint.com/docs/connectivity/saas-connectivity/customizers).

**When to use:**

- None of the built-in algorithms fit your needs
- You have proprietary matching logic (e.g., industry-specific identifiers)
- You need to call external APIs for matching (e.g., third-party identity resolution service)
- Complex business rules (e.g., "match if first 3 chars + last 2 chars identical")

**Implementation:**

- Develop custom algorithm in a [Connectivity Customizer](https://developer.sailpoint.com/docs/connectivity/saas-connectivity/customizers)
- Return similarity score 0–100
- Configure as "Custom" in Fusion attribute match

**Examples:**

- Parse and compare structured employee IDs (e.g., "EMP-2024-001234")
- Call external identity verification service
- Apply industry-specific matching rules (healthcare NPI, financial institution codes)

---

## Configuring attribute matches

### Configuration fields

For each **Fusion attribute match**, configure:

| Field                        | Purpose                            | Options / Notes                                                                                                                      |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Attribute**                | Identity attribute name to compare | Must exist on identities in scope; examples: `name`, `email`, `firstname`, `lastname`, `displayName`                                 |
| **Matching algorithm**       | Algorithm to calculate similarity  | Enhanced Name Matcher, Jaro-Winkler, Dice, Double Metaphone, Custom                                                                  |
| **Minimum similarity [0-100]** | Threshold and blend weight for this rule | Higher values are stricter and count more in the **combined match score**                                                               |
| **Mandatory match?**           | Must pass this rule for a potential match | Passing mandatories contribute to the weighted combined score like other rules                                                         |

### Single attribute vs multi-attribute matching

| Strategy                        | Configuration                                                                 | Use when                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Single attribute**            | One Fusion attribute match (e.g., name only)                                  | Simple matching; one strong identifier                                       |
| **Multi-attribute (combined)** | Several attribute matches + **minimum combined match score** | Weighted blend of similarities; tune global floor and per-rule minima/weights |
| **Multi-attribute (strict)**   | Several mandatories with high minima                         | All critical attributes must pass; combined score must still meet global floor  |
| **Hybrid**                      | Some mandatory, some optional                                                 | Critical attribute (email) must match; others (name, phone) support decision |

**Example configurations:**

```
Configuration 1: Name-only matching (simple)
- Attribute: name
- Algorithm: Enhanced Name Matcher
- Score: 85
→ Only name used; must score ≥85

Configuration 2: Name + email (balanced)
- Attribute: name, Algorithm: Enhanced Name Matcher, Score: 80
- Attribute: email, Algorithm: Jaro-Winkler, Score: 90
- Minimum combined score tuned with both rules contributing weighted similarity
→ Both contribute to combined score; mandatory rules must pass

Configuration 3: Strict email + supporting name
- Attribute: email, Algorithm: Jaro-Winkler, Score: 95, Mandatory: Yes
- Attribute: name, Algorithm: Enhanced Name Matcher, Score: 75, Mandatory: No
→ Email must match; name optional but helps

Configuration 4: Comprehensive combined score
- Attribute: firstname, Algorithm: Enhanced Name Matcher, Minimum similarity: 80
- Attribute: lastname, Algorithm: Enhanced Name Matcher, Minimum similarity: 80
- Attribute: email, Algorithm: Jaro-Winkler, Minimum similarity: 90
- Minimum combined match score: 80
→ Weighted combined score must be ≥80; evaluated mandatory rules must pass
```

---

## Combined match score

Matching always uses a **weighted combined score**: for each evaluated (non-skipped) rule, multiply its similarity by its **minimum similarity** (weight; 0 → treated as 1), sum, and divide by the sum of weights. That value must be ≥ **minimum combined match score**. Evaluated **mandatory** rules must also meet their own minimums. Non-mandatory rules can be below their minimum while still contributing their raw similarity to the blend.

**Example:** three rules with minimums (weights) 80, 90, 75 — similarities 85, 90, 70:

```
Combined = (85×80 + 90×90 + 70×75) / (80+90+75) ≈ 82.5
```

With **minimum combined match score** 80 → potential match if all mandatory rules pass.

**Tuning weights:** Raise a rule’s **minimum similarity** to make that attribute stricter **and** give it more influence on the combined score.

### Tuning tips

| Goal                                      | Approach                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Stricter on one attribute                 | Raise its minimum (stronger weight + harder to pass if mandatory)       |
| Softer global bar                         | Lower **minimum combined match score**                                   |
| Stricter overall                          | Raise **minimum combined match score** or add mandatory rules            |

---

## Tuning thresholds

### Initial thresholds (starting points)

| Attribute type | Algorithm             | Starting threshold | Adjust if...                                           |
| -------------- | --------------------- | ------------------ | ------------------------------------------------------ |
| Full name      | Enhanced Name Matcher | 80                 | Too many false positives → 85; missing matches → 75 |
| First name     | Enhanced Name Matcher | 85                 | Too strict → 80; too loose → 90                        |
| Last name      | Enhanced Name Matcher | 88                 | Missing matches → 85; false positives → 92             |
| Email          | Jaro-Winkler          | 92                 | Very strict domain → 95; relaxed → 88                  |
| Username       | Jaro-Winkler          | 95                 | Nearly exact needed → 98                               |
| Phone          | Jaro-Winkler          | 88                 | After normalization                                    |
| Address        | Dice                  | 75                 | Strict → 80; relaxed → 70                              |
| Job title      | Dice                  | 78                 | Strict → 82; relaxed → 73                              |

### Tuning workflow

| Phase                    | Action                                   | Goal                                  | Metrics                                   |
| ------------------------ | ---------------------------------------- | ------------------------------------- | ----------------------------------------- |
| **1. Baseline**          | Use starting thresholds from table above | Conservative; low false positive rate | Review 10–20 initial matches manually     |
| **2. Test with sample**  | Run on 100–500 accounts (recommended via `custom:report`) | Assess match quality                  | False positive rate, false negative rate  |
| **3. Analyze results**   | Review all generated forms               | Identify patterns                     | Are false positives due to one attribute? |
| **4. Adjust thresholds** | Increase (stricter) or decrease (looser) | Balance precision vs recall           | Target: <10% false positive rate          |
| **5. Retest**            | Run on same or different sample          | Validate improvements                 | Compare metrics to phase 2                |
| **6. Production**        | Remove sample limits                     | Full deployment                       | Monitor ongoing                           |

### Balancing precision and recall

| Scenario                 | Symptom                               | Adjustment                                                                                      |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **High false positives** | Many forms for obvious non-duplicates | Raise thresholds; add mandatory matches for critical attributes                                 |
| **High false negatives** | Missing obvious matches            | Lower thresholds; add more attributes; try different algorithms                                 |
| **Borderline cases**     | Many ambiguous matches                | Enable **Automatically correlate if identical?** for obvious ones; manual review for borderline |

**Screenshot placeholder:** Review form showing per-attribute similarity scores.

![Similarity scores on review form - Detail view](../assets/images/matching-algorithms-scores-form.png)

<!-- PLACEHOLDER: Screenshot of review form showing per-attribute similarity scores. Save as docs/assets/images/matching-algorithms-scores-form.png -->

---

## Auto-correlation

### When to use

**Automatically correlate if identical?** = Yes

**Effect:** Identities that meet similarity criteria and are "effectively identical" are auto-correlated without manual review.

| Enable when...                         | Keep disabled when...                   |
| -------------------------------------- | --------------------------------------- |
| Thresholds are well-tuned              | Initial setup / testing                 |
| False positive rate is <5%             | High-risk merges (finance, healthcare)  |
| Review burden is high (>50 forms/week) | You want manual approval for all merges |
| Obvious matches are common          | Data quality is poor                    |

**When auto-correlation runs:** When **Automatically correlate if identical?** is enabled, the connector skips the review form when **every** rule was evaluated (**none** skipped for missing values) and **all** attribute similarity scores are **100**.

---

## Common matching patterns

### Pattern 1: Conservative (high confidence only)

**Goal:** Only flag very obvious matches; minimize false positives.

```
- Attribute: email, Algorithm: Jaro-Winkler, Score: 95, Mandatory: Yes
- Attribute: name, Algorithm: Enhanced Name Matcher, Score: 88
→ Email must nearly match; name must also be very close
```

**Use case:** High-risk environments (financial, healthcare); initial rollout.

### Pattern 2: Balanced (moderate confidence)

**Goal:** Balance between catching matches and avoiding false positives.

```
- Attribute: name, Algorithm: Enhanced Name Matcher, Minimum similarity: 80
- Attribute: email, Algorithm: Jaro-Winkler, Minimum similarity: 85
- Minimum combined match score: e.g. 80
→ Weighted combined score must meet global floor; mandatories must pass
```

**Use case:** General corporate environments; standard data quality.

### Pattern 3: Aggressive (catch more matches)

**Goal:** Flag potential matches even with lower confidence; accept some false positives.

```
- Attribute: firstname, Algorithm: Enhanced Name Matcher, Minimum similarity: 75
- Attribute: lastname, Algorithm: Enhanced Name Matcher, Minimum similarity: 78
- Attribute: email, Algorithm: Jaro-Winkler, Minimum similarity: 70
- Minimum combined match score: 75
→ Relaxed per-rule minima; combined score must still reach global floor
```

**Use case:** Poor data quality; many known matches; strong review team.

### Pattern 4: Phonetic (spelling variations)

**Goal:** Catch names with different spellings but same pronunciation.

```
- Attribute: name, Algorithm: Double Metaphone, Score: 80
- Attribute: email, Algorithm: Jaro-Winkler, Score: 85, Mandatory: Yes
→ Phonetic name match + email confirmation
```

**Use case:** International names; known spelling variations; diverse workforce.

### Pattern 5: Hybrid (critical + supporting)

**Goal:** One critical mandatory attribute plus supporting optional attributes.

```
- Attribute: employeeId, Algorithm: Jaro-Winkler, Score: 98, Mandatory: Yes
- Attribute: name, Algorithm: Enhanced Name Matcher, Score: 75, Mandatory: No
- Attribute: email, Algorithm: Jaro-Winkler, Score: 80, Mandatory: No
→ Employee ID must match; name and email provide additional confidence
```

**Use case:** Strong business key exists; other attributes support verification.

---

## Data Preprocessing and Edge Cases

### The Normalizer Tool
Before relying entirely on matching algorithms, consider enabling the **Normalize special characters?** transformation during the *Define* phase. Normalization transliterates international accents and strips erratic punctuation (like apostrophes in "O'Conner" or hyphens).
- **Why it matters:** Algorithms like `Jaro-Winkler` and `Dice` are strictly mechanically based on characters. "Renée" vs "Renee" scores poorly under Dice (50%) but scores 100% when normalized. `LIG3` penalizes punctuation as unmapped insertions (dropping scores to ~64%), which the normalizer effortlessly resolves.
- **Exception**: The `Enhanced Name Matcher` natively handles accents and unicode transliteration, so it is less reliant on upstream normalization.

### Dates
Dates are notoriously poor candidates for pure string-matching algorithms due to format variance (e.g. `10/05/1990` vs `1990-10-05` vs `Oct 5th 1990`).
- String matching models (like `LIG3` or `Dice`) treat dates entirely as structural tokens which often drop similarity bounds below 50% if the standard is mixed.
- **Best Practice:** Do not match raw dates using these algorithms. Standardize the date formats (either into epoch arrays or ISO standard strings) upstream using Velocity templates or the Map engine. 

### Long Addresses
- When addresses use standardized structural variations (e.g. `1234 Elm Street Suite 500` vs `1234 Elm St Ste 500`), **Jaro-Winkler** is the most robust (90%), followed tightly by **LIG3** (82%).
- When addresses get structurally re-ordered (e.g. `Apt 12 400 Broad St` vs `400 Broad St Apt 12`), prefix-based algorithms like `Jaro-Winkler` and `LIG3` break down rapidly. In this specific format, **Dice** becomes the optimal choice due to its non-linear N-gram tokenizing (76% consistency).

---

## Troubleshooting matching issues

| Issue                        | Possible cause                           | Solution                                                                       |
| ---------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| **No matches found**         | Thresholds too high                      | Lower by 5–10 points; check if attributes exist on identities                  |
| **Too many false positives** | Thresholds too low; wrong algorithm      | Raise thresholds; add mandatory match for critical attribute; switch algorithm |
| **Name matches fail**        | Title/order differences; wrong algorithm | Use Enhanced Name Matcher (not Jaro-Winkler) for names                         |
| **Email matches fail**       | Case sensitivity; domain differences     | Normalize email to lowercase; check domain importance                          |
| **Inconsistent results**     | Missing or null attribute values         | Verify attributes exist and are populated on all identities                    |
| **Algorithm seems wrong**    | Mismatched algorithm for attribute type  | Review algorithm selection guide above                                         |

---

## Summary and decision guide

### Quick algorithm selection

| Attribute               | Recommended algorithm | Threshold range |
| ----------------------- | --------------------- | --------------- |
| Full name, display name | Enhanced Name Matcher | 75–85           |
| First name, last name   | Enhanced Name Matcher | 80–92           |
| Missing middle names    | LIG3                  | 60-70           |
| International names     | Enhanced Name Matcher / LIG3 | 80-92 |
| Email                   | Jaro-Winkler          | 90–95           |
| Username, employee ID   | Jaro-Winkler          | 95–100          |
| Phone (normalized)      | Jaro-Winkler          | 85–92           |
| Address                 | Dice                  | 70–80           |
| Transposed identifiers  | Dice                  | 85-95           |
| Job title, department   | Dice                  | 72–85           |
| Name (phonetic)         | Double Metaphone      | 75–85           |

### Key principles

1. **Start conservative** — High thresholds initially; lower as you gain confidence
2. **Use appropriate algorithms** — Names (Enhanced Name Matcher), short text (Jaro-Winkler), long text (Dice), phonetic (Double Metaphone)
3. **Test with samples** — Don't run on full dataset until thresholds are tuned
4. **Monitor and adjust** — Track false positive/negative rates; iterate
5. **Balance precision and recall** — Lower thresholds catch more matches but increase false positives
6. **Consider auto-correlation** — Enable after tuning to reduce manual review burden

**Next steps:**

- For full Match setup, see [Identity Fusion for Match](match.md).
- For attribute merging and mapping, see [Map](map.md).
