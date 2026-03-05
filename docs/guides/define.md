# Define: Attribute Definition

The **Define** step controls how attributes are generated using Apache Velocity expressions, unique identifiers, UUIDs, or counters. This happens after Attribute Mapping (if sources are configured) and before Match scoring (for normal attributes).

---

## When to use Attribute Definition

| Goal                        | Use Attribute Definition                      | Example                                        |
| --------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Generate unique usernames   | Yes (Unique type)                             | `jsmith`, `jsmith1`, `jsmith2`                 |
| Assign stable UUIDs         | Yes (UUID type)                               | `a3f2e8b4-7c2d-4f9e-8a1b-3c5d6e7f8g9h`         |
| Sequential employee numbers | Yes (Counter type)                            | 1000, 1001, 1002...                            |
| Computed attributes         | Yes (Normal type with expression)             | Full name from first + last; formatted dates   |
| Normalize/format values     | Yes (Normal type with expression + utilities) | Parse address, format phone, proper case names |

---

## Global settings

| Field                                             | Purpose                                     | Recommended value                                                                  |
| ------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Maximum attempts for unique Define generation** | Cap on retries for generating unique values | 100 (default); increase for large datasets with high collision risk (e.g. 200–500) |

**Why this matters:** For **Unique** type attributes, if the generated value already exists, the connector appends a counter and retries. This setting prevents infinite loops if the expression always produces the same value.

---

## Per-attribute definition configuration

For each attribute you want to generate, add an **Attribute Definition**:

| Field                             | Type                | Purpose                                  | Options / Example                                                     |
| --------------------------------- | ------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| **Attribute Name**                | String (required)   | Name of generated attribute              | `username`, `uuid`, `employeeNumber`, `fullName`, `formattedHireDate` |
| **Apache Velocity expression**    | String (optional)   | Template to compute value                | `#set($i=$firstname.substring(0,1))$i$lastname`                       |
| **Case selection**                | Dropdown (required) | Text case transformation                 | Do not change, Lower case, Upper case, Capitalize                     |
| **Attribute Type**                | Dropdown (required) | Generation behavior                      | **Normal**, **Unique**, **UUID**, **Counter-based**                   |
| **Counter start value**           | Integer             | Starting number (Counter type)           | 1, 1000, 50000                                                        |
| **Minimum counter digits**        | Integer             | Zero-padding (Counter/Unique types)      | 3 → `001`, `002`; 5 → `00001`                                         |
| **Maximum length**                | Integer (optional)  | Truncate to this length                  | 20; counter preserved at end for Unique/Counter                       |
| **Normalize special characters?** | Boolean             | Remove special chars/quotes              | Yes for usernames/IDs                                                 |
| **Remove spaces?**                | Boolean             | Remove all whitespace                    | Yes for usernames/IDs                                                 |
| **Refresh on each aggregation?**  | Boolean             | Recalculate every run (Normal type only) | Yes if dynamic; No if stable                                          |

**Screenshot placeholder:** Attribute Definition with examples.
![Attribute definition example](../assets/images/attribute-management-definition.png)

---

## Attribute types explained

### Normal type

**Behavior:** Standard computed attribute; recalculated based on **Refresh on each aggregation?** setting.

| Refresh setting | Behavior                       | Use case                                                            |
| --------------- | ------------------------------ | ------------------------------------------------------------------- |
| Yes             | Recalculated every aggregation | Dynamic values that should update (full name, age, formatted dates) |
| No              | Calculated once; persisted     | Stable values (initial assignment, one-time calculations)           |

**Examples:**

```velocity
# Full name (refresh: Yes)
$firstname $lastname

# Formatted hire date (refresh: No, unless hireDate changes)
$Datefns.format($hireDate, 'MMMM dd, yyyy')

# Years of service (refresh: Yes, dynamic)
$Math.floor($Datefns.differenceInDays($Datefns.now(), $hireDate) / 365)
```

### Unique type

**Behavior:** Must be unique across all Fusion accounts; connector adds disambiguation counter on collision. Unique attributes are only computed when a Fusion account is **first created** or when an existing account is **activated** (an internal mechanism to reset unique attributes). They are not refreshed by **Force attribute refresh on each aggregation** (that setting applies only to Normal-type attributes).

**How it works:**

1. Generate value from expression
2. Check if value exists on any account
3. If unique → use value
4. If collision → append counter (starting at 1), check again
5. Repeat up to **Maximum attempts**

**Counter format:** `{base value}{counter}` (e.g. `jsmith1`, `jsmith2`)
**Zero-padding:** Use **Minimum counter digits** to pad counter (e.g. digits=3 → `jsmith001`)

**Examples:**

```
Expression: #set($i=$firstname.substring(0,1))$i$lastname
Case: Lower case
Normalize: Yes
Spaces: Yes

Firstname="John", Lastname="Smith"
→ Generate: "jsmith"
→ Check: Already exists
→ Append counter: "jsmith1"
→ Check: Unique
→ Result: "jsmith1"
```

### UUID type

**Behavior:** Generates immutable universally unique identifier (v4 UUID).

**No expression needed:** UUID is auto-generated; any expression is ignored.

**Characteristics:**

- Globally unique (extremely low collision probability)
- Immutable (never changes once generated)
- Format: 36 characters (8-4-4-4-12 hex digits)
- Example: `a3f2e8b4-7c2d-4f9e-8a1b-3c5d6e7f8a9b`

**Use cases:**

- **Native identity** in ISC (stable reference that never changes)
- **Account name** when you need immutable identifier
- Cross-system correlation (UUID as common key)

### Counter-based type

**Behavior:** Sequential incrementing number; each account gets next number in sequence.

**How it works:**

1. Check highest existing counter value
2. Next account gets: max + 1
3. Counter state persisted across aggregations

**Fields:**

- **Counter start value:** First number in sequence (e.g. 1, 1000, 50000)
- **Minimum counter digits:** Zero-padding (e.g. 5 → `00001`, `00002`)

**Expression support:** Counter type supports Velocity expression with special `$counter` variable:

```velocity
# Employee number with prefix
EMP-$counter

Counter start: 1000, Digits: 5
→ EMP-01000, EMP-01001, EMP-01002
```

---

## Apache Velocity context

The **Apache Velocity expression** field provides a powerful templating language with access to utilities and data.

### Available data

| Source                        | What you can access                                                                                                                       | Example                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Mapped account attributes** | All attributes from Attribute Mapping                                                                                                     | `$jobTitle`, `$department`, `$email`               |
| **Source account attributes** | Direct source attributes (if no mapping)                                                                                                  | `$firstname`, `$lastname`, `$hireDate`             |
| **Identity attributes**       | When Include identities = Yes                                                                                                             | `$identity.firstname`, `$identity.employeeNumber`  |
| **$accounts**                 | Managed account snapshots available to templates. Ordered by configured source order, then account insertion order, then unknown sources. | `$accounts[0]._source`, `$accounts[0].IIQDisabled` |
| **$sources**                  | Managed account snapshots grouped by source name                                                                                          | `$sources.get("Workday")`                          |
| **$previous**                 | Previous generated account state                                                                                                          | `$previous.username`                               |
| **$originSource**             | Source that originally created the Fusion account (when available)                                                                        | `Identities`, `Workday`                            |
| **Special variables**         | `$counter` (Counter type only)                                                                                                            | `$counter` in expression for Counter type          |

### Available utilities

#### $Math (JavaScript Math object)

Standard mathematical operations (`$Math.round(x)`, `$Math.floor(x)`, `$Math.ceil(x)`, `$Math.max(a, b)`, `$Math.min(a, b)`, `$Math.abs(x)`).

#### $Datefns (date-fns library)

Advanced date formatting and manipulation (`$Datefns.format(date, format)`, `$Datefns.addDays(date, n)`, `$Datefns.differenceInDays(date1, date2)`, etc.).

#### $AddressParse (address parsing)

Parse and normalize US addresses (`$AddressParse.getCityState(city)`, `$AddressParse.parse(address)`).

#### $Normalize (data normalization)

Standardize common data formats (`$Normalize.phone(number)`, `$Normalize.date(date)`, `$Normalize.name(name)`).

---

## Order of operations

Understanding the sequence helps design correct configurations:

| Step | Phase                 | Action                                                | Example                                                                                |
| ---- | --------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1    | **Attribute Mapping** | Merge per mapping rules (MAP)                         | Map `[title, jobTitle]` → `jobTitle`, merge: first found → "Engineer"                  |
| 2    | **Normal Define**     | Generate non-unique attributes from mapped data       | Generate `fullName` from `$firstname $lastname` → "John Smith"                         |
| 3    | **Match / Scoring**   | Compare normal attributes against existing identities | Normal attributes feed into Match scoring                                              |
| 4    | **Unique Define**     | Generate unique attributes with collision detection   | Generate `username` from `$firstname.$lastname` → "jsmith" (or "jsmith1" on collision) |

**Key insights:**

- Normal attribute definitions run **before** Match matching. Their output is available to the scoring engine and to unique definitions.
- Unique attribute definitions run **after** all Match matching has completed (as a global pass over every account). They can reference normal attribute values but not the other way around.
- Attribute Definition expressions can reference attributes created by Attribute Mapping. Ensure mapped attributes exist before referencing in expressions.

---

## nativeIdentity and account name immutability

The `nativeIdentity` (account identifier) and account `name` (display attribute) are **set at creation time and never changed afterwards**, even if an attribute definition would otherwise overwrite them.

- If you define a **unique attribute** that maps to the same schema attribute as the fusion identity attribute, it will only be generated once (at account creation). Subsequent aggregations and enable/disable cycles will not change it for identity-linked accounts.
- Use a **UUID** unique attribute as native identity when you need a truly immutable, stable reference.

### Unique attribute reset on enable/disable

Use regular unique attribute schemas to define attributes you may want to change, like usernames or email aliases. Disabling and then re-enabling a Fusion account triggers a **unique attribute reset**:

- **Disable**: preserves all existing unique attribute values.
- **Enable**: resets and regenerates all unique attribute values, ensuring collision-free values after the account has been inactive.

---

## Preventing Fusion account creation (empty nativeIdentity skip pattern)

One can purposely generate an **empty** `nativeIdentity` in conjunction with the **"Skip accounts with a missing identifier"** processing option to prevent specific managed accounts or identities from generating Fusion accounts.

1. Define an attribute definition (normal or unique) that maps to the fusion identity attribute.
2. Design the expression so it evaluates to an empty string for accounts you want to exclude.
3. Enable **"Skip accounts with a missing identifier"** in Processing Control settings.

```velocity
## Example: only generate identity for accounts with an email
#if($email && $email != "")
  $email
#end
```
