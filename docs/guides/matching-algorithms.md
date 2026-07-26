matching-algorithms.md [710L]
# Effective Use of Matching Algorithms
Identity Fusion NG uses **similarity scoring** to detect potential matching identities. This comprehensive guide helps you choose, configure, and tune the **matching algorithms** used in **Attribute Matching Settings → Matching Settings** for optimal matching results.
---
## Overview: Matching in Identity Fusion
Matching algorithms calculate **similarity scores** (0–100) between attribute values from different identities. These scores determine whether two identities are potential matches.
... [lean-ctx: omitted 1 lines]
| --------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
... [lean-ctx: omitted 1 lines]
| **Matching algorithm**            | How to calculate similarity                                    | Per attribute (Enhanced Name Matcher, Jaro-Winkler, Dice, Double Metaphone, Custom) |
... [lean-ctx: omitted 4 lines]
![Fusion attribute matches - Configuration interface](../assets/images/matching-algorithms-config.png)
<!-- PLACEHOLDER: Screenshot of Attribute Matching Settings > Fusion attribute matches. Save as docs/assets/images/matching-algorithms-config.png -->
... [lean-ctx: omitted 1 lines]
## Algorithm selection guide
### Algorithm comparison matrix
| Algorithm                 | Best for                                          | Strengths                                                              | Weaknesses                                                       | Computational cost |
... [lean-ctx: omitted 3 lines]
| **Dice**                  | Longer text (addresses, job titles, descriptions) | Robust for substring matching; handles reordering well                 | Can miss phonetic variations; requires adequate text length      | Medium             |
| **Double Metaphone**      | Names with spelling variations, phonetic matching | Catches "Catherine"/"Katherine", "John"/"Jon", "Smith"/"Smyth"         | May generate false positives for short names; language-dependent | Low                |
| **LIG3**                  | Compound identifiers, names with missing parts    | Excellent with international accents and compound gap handling         | Heavily punishes transpositions (e.g. inverted dates/names)      | High               |
| **Binary (Exact Match)**  | Stable identifiers (employee ID, email, UUID)      | Trivial threshold configuration (any value below 100 is a non-match) | Case- and whitespace-sensitive; no tolerance for variation        | Lowest             |
... [lean-ctx: omitted 1 lines]
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
│  ├─ Strict equality required → Binary (Exact Match)
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
... [lean-ctx: omitted 1 lines]
## Algorithm deep dive
### Enhanced Name Matcher
**Purpose:** Specialized algorithm for person names with cultural awareness and variation handling.
... [lean-ctx: omitted 1 lines]
- Tokenizes names into components (first, middle, last, titles, suffixes)
... [lean-ctx: omitted 1 lines]
- Recognizes titles (Dr., Mr., Mrs., Prof.) and suffixes (Jr., Sr., III)
- Handles cultural naming patterns (e.g., Asian name order, Hispanic compound surnames)
... [lean-ctx: omitted 3 lines]
| -------------------------------- | --------- | -------------------------------------------------- |
| Full name (e.g. "John A. Smith") | 75–85     | Allows middle initial variation, title differences |
... [lean-ctx: omitted 1 lines]
| Last name only                   | 85–92     | Critical identifier; be stricter                   |
| Display name (formatted)         | 75–85     | May include titles, formatting differences         |
... [lean-ctx: omitted 2 lines]
| --------------- | -------------- | ----- | --------------------- |
... [lean-ctx: omitted 8 lines]
- Comparing `name`, `displayName`, `firstname`, `lastname` attributes
... [lean-ctx: omitted 4 lines]
- You need exact or near-exact matches → use Jaro-Winkler with high threshold
### Jaro-Winkler
**Purpose:** General-purpose string similarity with emphasis on prefix matching.
... [lean-ctx: omitted 1 lines]
- Calculates Jaro distance (transpositions and character matches)
- Applies prefix weighting (first 4 characters heavily weighted)
... [lean-ctx: omitted 3 lines]
| ------------------------------ | --------- | --------------------------------------------------- |
... [lean-ctx: omitted 1 lines]
| Username                       | 92–98     | Critical identifier; little tolerance for variation |
... [lean-ctx: omitted 1 lines]
| Phone number (normalized)      | 85–92     | Some tolerance for formatting                       |
... [lean-ctx: omitted 3 lines]
| ---------------------- | ---------------------- | ----- | ------------------------------------------- |
| `john.smith@company.com` | `john.smyth@company.com` | 95    | High due to strong prefix match             |
| `john.smith@company.com` | `jane.smith@company.com` | 82    | Lower due to prefix mismatch (john vs jane) |
| `smithj@company.com`     | `smithjo@company.com`    | 97    | Very close; prefix nearly identical         |
... [lean-ctx: omitted 9 lines]
### Dice (Sørensen-Dice coefficient)
**Purpose:** Bigram-based similarity for longer text strings.
... [lean-ctx: omitted 1 lines]
- Breaks each string into bigrams (2-character sequences)
... [lean-ctx: omitted 1 lines]
- Calculates: `2 * (shared bigrams) / (total bigrams in both strings)`
... [lean-ctx: omitted 3 lines]
| ------------------------------ | --------- | ------------------------------------ |
| Address (street, city, full)   | 70–80     | Allows reordering, abbreviations     |
... [lean-ctx: omitted 1 lines]
| Department name                | 75–85     | Moderate strictness                  |
... [lean-ctx: omitted 3 lines]
| ------------------------ | ------------------- | ----- | --------------------- |
... [lean-ctx: omitted 1 lines]
| Senior Software Engineer | Software Engineer   | 78    | Yes                   |
| Engineering Department   | Engineering Dept    | 85    | Yes                   |
... [lean-ctx: omitted 7 lines]
- When substring/phrase matching is important
... [lean-ctx: omitted 1 lines]
- Names (cultural variations) → use Enhanced Name Matcher
... [lean-ctx: omitted 1 lines]
- Phonetic matching → use Double Metaphone
### Double Metaphone
**Purpose:** Phonetic algorithm that generates pronunciation codes for strings.
... [lean-ctx: omitted 2 lines]
- Codes represent pronunciation (not spelling)
... [lean-ctx: omitted 1 lines]
- Language rules: English-centric (handles some European languages)
... [lean-ctx: omitted 2 lines]
| --------------------- | --------- | ----------------------------------- |
... [lean-ctx: omitted 1 lines]
| Last name (phonetic)  | 80–88     | More critical; be slightly stricter |
... [lean-ctx: omitted 3 lines]
| --------- | --------- | ------------------- | -------------- |
| Catherine | Katherine | Yes (both → "K0RN") | 90             |
... [lean-ctx: omitted 5 lines]
| McDonald  | MacDonald | Yes                 | 88             |
... [lean-ctx: omitted 2 lines]
- International names with multiple spellings
... [lean-ctx: omitted 1 lines]
- Complementary to Enhanced Name Matcher for difficult cases
... [lean-ctx: omitted 3 lines]
- Very short strings (<4 characters) → less reliable
- Non-English names (algorithm is English-centric)
### Binary (Exact Match)
**Purpose:** Strict exact-match scoring for stable identifiers where any deviation (case, spacing, characters) must be treated as a non-match. Returns a score of 100 when the two values are identical strings and 0 otherwise.
... [lean-ctx: omitted 2 lines]
- Case-sensitive and whitespace-sensitive: `"abc123"`, `"ABC123"`, and `" abc123 "` all score 0 against each other.
... [lean-ctx: omitted 3 lines]
|---------------------------|-----------|------------------------------------------------------------|
| Employee ID / UUID / email | 100       | Anything less than an exact match should be a non-match    |
| Identifier after Define-level normalization | 100 | Pre-normalize in **Define**, then require exact equality  |
... [lean-ctx: omitted 8 lines]
- Stable identifiers where the source-of-truth values are already canonical (employee IDs, UUIDs, pre-normalized emails).
- You want to eliminate any tolerance to formatting differences and avoid threshold tuning.
... [lean-ctx: omitted 1 lines]
- Human-entered data that may contain formatting variations (use **Jaro-Winkler** or **Enhanced Name Matcher** instead).
- You need forgiving matching — normalize values in **Define** (e.g. lowercase, trim) before applying `Binary`.
### LIG3
**Purpose:** Advanced hybrid algorithm combining token handling with Levenshtein-style penalties.
... [lean-ctx: omitted 1 lines]
- Evaluates character variations and normalizes accents (e.g., highly accurate for "José" vs "Jose").
- Considers gaps and missing elements conservatively across compound identifiers.
- Positional weighting prevents over-penalizing missing middle names.
... [lean-ctx: omitted 7 lines]
| --------------- | ----------- | ----- | --------------------- |
... [lean-ctx: omitted 3 lines]
| Christopher     | Christoper  | 74    | No (borderline typo)  |
... [lean-ctx: omitted 2 lines]
- You have international characters that need to be evaluated gracefully.
... [lean-ctx: omitted 1 lines]
- You expect transpositions (e.g. swapped DOBs, or swapped first/last names). LIG3 heavily penalizes misordered data.
- Short substrings or pure typographical error matching—Jaro-Winkler handles typos better.
### Custom (from SaaS customizer)
**Purpose:** Domain-specific matching logic implemented in a [SailPoint SaaS Connectivity Customizer](https://developer.sailpoint.com/docs/connectivity/saas-connectivity/customizers).
... [lean-ctx: omitted 2 lines]
- You have proprietary matching logic (e.g., industry-specific identifiers)
- You need to call external APIs for matching (e.g., third-party identity resolution service)
... [lean-ctx: omitted 2 lines]
- Develop custom algorithm in a [Connectivity Customizer](https://developer.sailpoint.com/docs/connectivity/saas-connectivity/customizers)
... [lean-ctx: omitted 3 lines]
- Parse and compare structured employee IDs (e.g., "EMP-2024-001234")
... [lean-ctx: omitted 1 lines]
- Apply industry-specific matching rules (healthcare NPI, financial institution codes)
... [lean-ctx: omitted 1 lines]
## Configuring attribute matches
### Configuration fields
For each **Fusion attribute match**, configure:
... [lean-ctx: omitted 2 lines]
| **Attribute**                  | Identity attribute name to compare        | Must exist on identities in scope; examples: `name`, `email`, `firstname`, `lastname`, `displayName` |
| **Matching algorithm**         | Algorithm to calculate similarity         | Enhanced Name Matcher, Jaro-Winkler, Dice, Double Metaphone, Binary (Exact Match), Custom            |
... [lean-ctx: omitted 1 lines]
| **Mandatory match?**           | Must pass this rule for a potential match | Passing mandatories contribute to the weighted combined score like other rules                       |
### Single attribute vs multi-attribute matching
| Strategy                       | Configuration                                                | Use when                                                                       |
... [lean-ctx: omitted 6 lines]
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
... [lean-ctx: omitted 1 lines]
## Combined match score
Matching always uses a **weighted combined score**: for each evaluated (non-skipped) rule, multiply its similarity by its **minimum similarity** (weight; 0 → treated as 1), sum, and divide by the sum of weights. That value must be ≥ **minimum combined match score**. Evaluated **mandatory** rules must also meet their own minimums. Non-mandatory rules can be below their minimum while still contributing their raw similarity to the blend.
... [lean-ctx: omitted 1 lines]
```
Combined = (85×80 + 90×90 + 70×75) / (80+90+75) ≈ 82.5
```
... [lean-ctx: omitted 2 lines]
### Tuning tips
| Goal                      | Approach                                                          |
| ------------------------- | ----------------------------------------------------------------- |
| Stricter on one attribute | Raise its minimum (stronger weight + harder to pass if mandatory) |
... [lean-ctx: omitted 1 lines]
| Stricter overall          | Raise **minimum combined match score** or add mandatory rules     |
... [lean-ctx: omitted 1 lines]
## Tuning thresholds
### Initial thresholds (starting points)
| Attribute type | Algorithm             | Starting threshold | Adjust if...                                        |
| -------------- | --------------------- | ------------------ | --------------------------------------------------- |
... [lean-ctx: omitted 4 lines]
| Username       | Jaro-Winkler          | 95                 | Nearly exact needed → 98                            |
| Phone          | Jaro-Winkler          | 88                 | After normalization                                 |
... [lean-ctx: omitted 2 lines]
### Tuning workflow
| Phase                    | Action                                                    | Goal                                  | Metrics                                   |
... [lean-ctx: omitted 1 lines]
| **1. Baseline**          | Use starting thresholds from table above                  | Conservative; low false positive rate | Review 10–20 initial matches manually     |
| **2. Test with sample**  | Run on 100–500 accounts (recommended via [dry-run mode](../operations/dry-run.md)) | Assess match quality                  | False positive rate, false negative rate  |
... [lean-ctx: omitted 1 lines]
| **4. Adjust thresholds** | Increase (stricter) or decrease (looser)                  | Balance precision vs recall           | Target: <10% false positive rate          |
... [lean-ctx: omitted 2 lines]
### Balancing precision and recall
| Scenario                 | Symptom                               | Adjustment                                                                                     |
... [lean-ctx: omitted 1 lines]
| **High false positives** | Many forms for obvious non-duplicates | Raise thresholds; add mandatory matches for critical attributes                                |
| **High false negatives** | Missing obvious matches               | Lower thresholds; add more attributes; try different algorithms                                |
| **Borderline cases**     | Many ambiguous matches                | Toggle **Enable automatic merge** for obvious ones; manual review for borderline |
... [lean-ctx: omitted 2 lines]
<!-- PLACEHOLDER: Screenshot of review form showing per-attribute similarity scores. Save as docs/assets/images/matching-algorithms-scores-form.png -->
... [lean-ctx: omitted 1 lines]
## Automatic merge
### When to use
**Enable automatic merge** = Yes
**Effect:** Candidates whose combined score meets or exceeds the **Automatic merge match score** threshold are assigned to that identity without manual review.
... [lean-ctx: omitted 1 lines]
| -------------------------------------- | --------------------------------------- |
... [lean-ctx: omitted 1 lines]
| False positive rate is <5%             | High-risk merges (finance, healthcare)  |
... [lean-ctx: omitted 2 lines]
**When it runs:** When **Enable automatic merge** is enabled, the connector skips the review form when the candidate's combined score meets or exceeds the **Automatic merge match score**.
... [lean-ctx: omitted 1 lines]
## Common matching patterns
### Pattern 1: Conservative (high confidence only)
**Goal:** Only flag very obvious matches; minimize false positives.
```
- Attribute: email, Algorithm: Jaro-Winkler, Score: 95, Mandatory: Yes
- Attribute: name, Algorithm: Enhanced Name Matcher, Score: 88
→ Email must nearly match; name must also be very close
```
... [lean-ctx: omitted 1 lines]
### Pattern 2: Balanced (moderate confidence)
**Goal:** Balance between catching matches and avoiding false positives.
```
- Attribute: name, Algorithm: Enhanced Name Matcher, Minimum similarity: 80
- Attribute: email, Algorithm: Jaro-Winkler, Minimum similarity: 85
- Minimum combined match score: e.g. 80
→ Weighted combined score must meet global floor; mandatories must pass
```
... [lean-ctx: omitted 1 lines]
### Pattern 3: Aggressive (catch more matches)
**Goal:** Flag potential matches even with lower confidence; accept some false positives.
```
- Attribute: firstname, Algorithm: Enhanced Name Matcher, Minimum similarity: 75
- Attribute: lastname, Algorithm: Enhanced Name Matcher, Minimum similarity: 78
- Attribute: email, Algorithm: Jaro-Winkler, Minimum similarity: 70
- Minimum combined match score: 75
→ Relaxed per-rule minima; combined score must still reach global floor
```
... [lean-ctx: omitted 1 lines]
### Pattern 4: Phonetic (spelling variations)
**Goal:** Catch names with different spellings but same pronunciation.
```
- Attribute: name, Algorithm: Double Metaphone, Score: 80
- Attribute: email, Algorithm: Jaro-Winkler, Score: 85, Mandatory: Yes
→ Phonetic name match + email confirmation
```
... [lean-ctx: omitted 1 lines]
### Pattern 5: Hybrid (critical + supporting)
**Goal:** One critical mandatory attribute plus supporting optional attributes.
```
- Attribute: employeeId, Algorithm: Jaro-Winkler, Score: 98, Mandatory: Yes
- Attribute: name, Algorithm: Enhanced Name Matcher, Score: 75, Mandatory: No
- Attribute: email, Algorithm: Jaro-Winkler, Score: 80, Mandatory: No
→ Employee ID must match; name and email provide additional confidence
```
... [lean-ctx: omitted 2 lines]
## Real-world matching examples (anonymized)
The rows below are **fictional** composites. **Source A** and **Source B** stand in for any two authoritative feeds from your own topology; do not treat the labels as product-specific. Use them to reason about algorithms, **Map**/**Define** normalization, and reviewer context.
### Transposed date of birth
- **Source A:** Daniel Kim, `1999-03-08`, M
... [lean-ctx: omitted 2 lines]
**What to do:** Normalize both sides to the same canonical form (for example ISO `YYYY-MM-DD` or a comparable epoch) in **Map** or **Define** before matching—or **exclude** raw DOB from string similarity rules. Pure string algorithms on date text often mis-score transpositions; see [Dates](#dates).
### Last name change (marriage or legal change)
- **Source A:** Olivia Nguyen, `1997-06-21`, F, `olivia.nguyen@example.com`
... [lean-ctx: omitted 2 lines]
**What to do:** **Enhanced Name Matcher** on full name or separate **firstname** / **lastname** rules with sensible minima; treat **email** as a strong corroborating rule (**Jaro-Winkler**, often mandatory). Reviewers should see email + DOB on the form.
### Preferred or nickname vs legal name
- **Source A:** Chris Johnson, `2000-09-15`, M
... [lean-ctx: omitted 1 lines]
**Why it is ambiguous:** **Enhanced Name Matcher** is intended to relate common nickname ↔ legal pairs when comparing person-name attributes.
**What to do:** Prefer **Enhanced Name Matcher** on `name` or `firstname`; add a second signal (DOB, email, employee ID) if automatic merge must stay conservative.
### Multipart or cultural last-name variation
- **Source A:** Maria De La Cruz, `1996-11-02`, F
... [lean-ctx: omitted 1 lines]
**Why it is ambiguous:** One source keeps a **compound** surname; another collapses or splits tokens differently.
**What to do:** **Enhanced Name Matcher** on full name; optional **LIG3** if you compare a single compound `lastname` field and need token-gap tolerance—tune thresholds and validate on your data. Ensure review attributes include the full name from both sides.
### Phone formatting differences
- **Source A:** James Miller, `1995-02-10`, M, `(402) 555-2222`
... [lean-ctx: omitted 2 lines]
**What to do:** Strip non-digits (and optionally normalize country code) in **Define**, then **Jaro-Winkler** on phone with thresholds in the **Phone number (normalized)** range described under [Jaro-Winkler](#jaro-winkler) above. Do not match raw formatted strings without normalization.
### Legal sex or gender marker difference
- **Source A:** Taylor Morgan, `1998-07-30`, M
... [lean-ctx: omitted 1 lines]
**Why it is ambiguous:** Other attributes match exactly, but a **policy-sensitive** field disagrees—may be data error, timing, or identity semantics.
**What to do:** Decide by **governance policy**: either omit this attribute from automated matching, use **Mandatory match?** only when sources are contractually aligned, or always send to **manual review** with clear form copy. Do not rely on similarity alone for high-stakes demographic fields.
### Partial data (missing attributes on one side)
- **Source A:** Aisha Khan, `2001-05-18`, F — (no email, no phone on record)
- **Source B:** Aisha Khan, `2001-05-18`, F — `aisha.khan@example.com`, `402-555-3333`
... [lean-ctx: omitted 1 lines]
**What to do:** Keep strong non-skipped rules (name + DOB) where populated; document reviewer expectations; consider **Skip match if missing** = No only for attributes you intentionally want to penalize when absent, understanding side effects on combined score and automatic merge.
### Weak signal on a non-critical attribute
- **Source A:** Daniel Carter, `daniel.carter@example.com`, Senior Engineer
... [lean-ctx: omitted 1 lines]
**Why it is ambiguous:** Name and email match strongly, but the job title is shortened in Source B. The job-title rule scores below its own minimum, so it is recorded as a **non-match** even though the other two rules are convincing.
**What to do:** Enable **Skip match if threshold not met** on the job-title rule. Because the rule is non-mandatory and below threshold, it is then excluded from the weighted combined score instead of dragging it down with a low similarity. The combined score rests on the strong name and email signals, reducing false negatives caused by the abbreviation. **Mandatory** rules are not affected by this toggle and should be used for attributes that must always meet their minimum.
### Typographical error
- **Source A:** Michael Anderson, `1994-12-05`, M
... [lean-ctx: omitted 2 lines]
**What to do:** **Jaro-Winkler** tolerates some end typos on short strings; **Enhanced Name Matcher** on full name often still scores well. If typos dominate, slightly lower last-name minimum similarity or add a phonetic rule (**Double Metaphone**) as a secondary signal, not the only gate.
### International character variation
- **Source A:** José Garcia, `1993-08-14`, M
... [lean-ctx: omitted 2 lines]
**What to do:** **Enhanced Name Matcher** handles accents; alternatively enable **Normalize special characters?** in **Define** before **Jaro-Winkler** / **Dice** on affected fields. **LIG3** can score accented vs ASCII highly when configured appropriately; validate on samples.
... [lean-ctx: omitted 1 lines]
## Data Preprocessing and Edge Cases
### The Normalizer Tool
Before relying entirely on matching algorithms, consider enabling the **Normalize special characters?** transformation during the _Define_ phase. Normalization transliterates international accents and strips erratic punctuation (like apostrophes in "O'Conner" or hyphens).
- **Why it matters:** Algorithms like `Jaro-Winkler` and `Dice` are strictly mechanically based on characters. "Renée" vs "Renee" scores poorly under Dice (50%) but scores 100% when normalized. `LIG3` penalizes punctuation as unmapped insertions (dropping scores to ~64%), which the normalizer effortlessly resolves.
... [lean-ctx: omitted 1 lines]
### Dates
Dates are notoriously poor candidates for pure string-matching algorithms due to format variance (e.g. `10/05/1990` vs `1990-10-05` vs `Oct 5th 1990`).
... [lean-ctx: omitted 1 lines]
- **Best Practice:** Do not match raw dates using these algorithms. Standardize the date formats (either into epoch arrays or ISO standard strings) upstream using Velocity templates or the Map engine.
### Long Addresses
- When addresses use standardized structural variations (e.g. `1234 Elm Street Suite 500` vs `1234 Elm St Ste 500`), **Jaro-Winkler** is the most robust (90%), followed tightly by **LIG3** (82%).
- When addresses get structurally re-ordered (e.g. `Apt 12 400 Broad St` vs `400 Broad St Apt 12`), prefix-based algorithms like `Jaro-Winkler` and `LIG3` break down rapidly. In this specific format, **Dice** becomes the optimal choice due to its non-linear N-gram tokenizing (76% consistency).
... [lean-ctx: omitted 1 lines]
## Troubleshooting matching issues
| Issue                        | Possible cause                           | Solution                                                                       |
... [lean-ctx: omitted 2 lines]
| **Too many false positives** | Thresholds too low; wrong algorithm      | Raise thresholds; add mandatory match for critical attribute; switch algorithm |
| **Name matches fail**        | Title/order differences; wrong algorithm | Use Enhanced Name Matcher (not Jaro-Winkler) for names                         |
| **Email matches fail**       | Case sensitivity; domain differences     | Normalize email to lowercase; check domain importance                          |
| **Inconsistent results**     | Missing or null attribute values         | Verify attributes exist and are populated on all identities                    |
... [lean-ctx: omitted 2 lines]
## Summary and decision guide
### Quick algorithm selection
| Attribute               | Recommended algorithm        | Threshold range |
| ----------------------- | ---------------------------- | --------------- |
... [lean-ctx: omitted 3 lines]
| International names     | Enhanced Name Matcher / LIG3 | 80-92           |
... [lean-ctx: omitted 1 lines]
| Username, employee ID   | Jaro-Winkler                 | 95–100          |
... [lean-ctx: omitted 2 lines]
| Transposed identifiers  | Dice                         | 85-95           |
... [lean-ctx: omitted 2 lines]
### Key principles
1. **Start conservative** — High thresholds initially; lower as you gain confidence
2. **Use appropriate algorithms** — Names (Enhanced Name Matcher), short text (Jaro-Winkler), long text (Dice), phonetic (Double Metaphone)
... [lean-ctx: omitted 2 lines]
5. **Balance precision and recall** — Lower thresholds catch more matches but increase false positives
6. **Consider automatic merge** — Enable after tuning to reduce manual review burden
... [lean-ctx: omitted 3 lines]

