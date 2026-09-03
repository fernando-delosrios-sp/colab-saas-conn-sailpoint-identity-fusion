# Map: Attribute Mapping

The **Map** step controls how source account attributes are combined into the Fusion account schema when multiple sources contribute. Mapping source attributes into the Fusion schema happens first, before Attribute Definitions or Match scoring.

**Configuration reference:** [Attribute Mapping Settings](../../configuration/mapping.md)

!!! note "Didactic guide"
This page explains **how and when** to configure settings with examples. For field keys, types, defaults, and constraints, see the linked **Configuration reference**.

---

## When to use Attribute Mapping

| Scenario                            | Use Attribute Mapping? | Example                                                         |
| ----------------------------------- | ---------------------- | --------------------------------------------------------------- |
| Identity-only Define (no sources)   | No                     | Generate unique IDs from identity attributes                    |
| One source (no merging needed)      | Optional               | Map single source if you want to rename/consolidate attributes  |
| Multiple sources (merging required) | Yes                    | Merge `jobTitle` from Workday and `title` from Active Directory |
| Normalize from multiple names       | Yes                    | Map `[title, jobTitle, position]` → `jobTitle`                  |

---

## Default merge behavior

The **Default attribute merge from multiple sources** setting applies globally to mapped attributes (unless overridden per attribute) **and** to implicit Map candidates on refresh: **unmapped snapshot keys** (same-named attributes on this account’s live snapshots with no mapping row) together with names already present on the Fusion account. A **vanished snapshot key** — a persisted name that no live snapshot still carries — is deleted. Map does **not** walk the full Fusion schema. Control attributes, `id`, `name`, snapshot overlay fields, and **Unique attribute definition** names are never implicit candidates. **Normal attribute definition** names are ordinary implicit candidates: when a live snapshot carries the same name, Map merges it under the global default. Map never clears a **definition-owned name** of either kind — if the merge yields nothing, the value already on the Fusion account stays. To retain a value after its source stops publishing it, add an explicit mapping row or a Normal attribute definition for that name. New configurations default to **Main account**.

| Merge strategy                   | Behavior                                                         | Result format         | Use when                                            |
| -------------------------------- | ---------------------------------------------------------------- | --------------------- | --------------------------------------------------- |
| **Main account**                 | Uses `mainAccount` when found; otherwise uses the origin         | Single value (string) | Attributes should follow one representative account |
| **Origin account**               | Uses only the account that originally created the Fusion account | Single value (string) | Attributes must remain pinned to provenance         |
| **First found**                  | Uses first non-null value by source order                        | Single value (string) | One source is preferred/authoritative               |
| **Keep a list of values**        | Array of all distinct non-null values                            | Array of strings      | Need all values (roles, groups, entitlements)       |
| **Concatenate different values** | Distinct values in brackets, space-separated                     | Single string         | Human-readable combined view                        |

**Main account and Origin account do not fall back to other accounts.** If the selected snapshot does not contain a mapped value, the result is empty. Choose **First found** when missing values should fall through to configured source order.

**Origin** and **main** are pointers into the snapshot-key index. When the identity bag is present, **Identities** is a contributing snapshot indexed under the identity id, so `originAccount` or `mainAccount` may name either a managed account or that identity. Identity-origin is not a separate merge path.

| Pointer                                     | Snapshot used                             |
| ------------------------------------------- | ----------------------------------------- |
| `originAccount` = managed account key       | That managed snapshot                     |
| `originAccount` = identity id               | Identities snapshot                       |
| `mainAccount` found in the index            | That snapshot (managed or Identities)     |
| `mainAccount` missing or not found this run | Origin snapshot (Main account merge only) |

**Screenshot Placeholder:** Attribute Mapping with merge strategies.
![Attribute mapping and merge](../../assets/images/attribute-management-mapping-merge.png)

**Source ordering matters:** With "First found", the **order** of sources in **Source Settings → Authoritative account sources** determines precedence. The first source has highest priority.
If the Fusion attribute `mainAccount` is populated with a valid managed account ID, that specific account is evaluated first as an override; otherwise, default source order is used.

```
Example: Source order is [Workday, Active Directory]
- Workday has jobTitle = "Senior Engineer"
- Active Directory has title = "Engineer"
- Merge: First found
→ Result: "Senior Engineer" (Workday wins)
```

### Pass-through definitions

A **pass-through definition** is a Normal attribute definition whose expression reads its own name — a definition named `CRSID` with the expression `$CRSID`. Define reads only the Fusion account attribute bag (`attributeBag.current`), never the flattened snapshots, so the implicit merge above is what seeds the value the expression reads: Map merges `CRSID` from the same-named snapshot key, then Define transforms that value. With nothing seeded in the bag, the expression renders as an unresolved literal instead.

Use this pattern to normalize or reformat a source-provided value under the same name. For expression syntax and the full Velocity context, see [Attribute Definitions](defining-attributes.md).

---

## Per-attribute mapping configuration

For each attribute you want to expose on the Fusion account, add an **Attribute Mapping**:

| Field                                  | Purpose                                                                    | Example                                            |
| -------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| **New attribute**                      | Name on Fusion account schema                                              | `jobTitle`, `department`, `manager`, `roles`       |
| **Existing attributes**                | List of source attribute names (from all sources) that feed this attribute | `[title, jobTitle, position]`                      |
| **Default attribute merge** (override) | Override global merge for this specific attribute                          | Use "Source name" to prefer Workday for `jobTitle` |
| **Source name**                        | Specific source to use when merge = "Source name"                          | `Workday`                                          |

**Per-attribute merge options:**

| Option                           | Effect                                       | Use case                                         |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| **Main account**                 | Main snapshot, otherwise origin; no fallback | Follow one representative account                |
| **Origin account**               | Origin snapshot only; no fallback            | Pin the attribute to creation provenance         |
| **First found**                  | Main snapshot first, then source order       | Fill from the next source when values are absent |
| **Keep a list of values**        | Keep all values                              | Multi-valued attribute (roles, groups)           |
| **Concatenate different values** | Concatenate all values                       | Human-readable combined view                     |
| **Source name**                  | Use the first value from one source only     | One source is authoritative for this attribute   |

`$originSource` in the **Source name** field remains a source-level token: it resolves to the prioritized (`mainAccount`) source name and selects the first account on that source. It is not the same as **Origin account**, which selects the exact immutable origin account.

---

## Common mapping patterns

### Pattern 1: Preferred source for critical attributes

**Goal:** Use HR data for job titles; fall back to AD only if HR missing.

```
Attribute Mapping:
- New attribute: jobTitle
- Existing attributes: [title, jobTitle, position]
- Merge: Source name = "Workday"

Source order: [Workday, Active Directory]
→ Always uses Workday's value if present; ignores AD even if different
```

### Pattern 2: Collect all roles from all systems

**Goal:** Build a master list of all roles across SAP, Salesforce, Workday.

```
Attribute Mapping:
- New attribute: allRoles
- Existing attributes: [roles, groups, memberOf, entitlements]
- Merge: Keep a list of values

Result: ["SAP_Admin", "Salesforce_Sales", "Workday_Manager"]
→ Array with all distinct values
```

### Pattern 3: Human-readable concatenation

**Goal:** Show all departments as `[Engineering] [IT]` for easy reading.

```
Attribute Mapping:
- New attribute: departments
- Existing attributes: [department, dept, organizationalUnit]
- Merge: Concatenate different values

Workday has department = "Engineering"
AD has organizationalUnit = "IT Operations"
→ Result: "[Engineering] [IT Operations]"
```

### Pattern 4: Consolidate attribute names

**Goal:** Different sources use different names for same concept; standardize.

```
Attribute Mapping:
- New attribute: email (standardized name)
- Existing attributes: [mail, emailAddress, email, primaryEmail]
- Merge: First found (or Source name if one source is authoritative)

→ Single "email" attribute on Fusion account regardless of source naming
```

### Pattern 5: Per-attribute override

**Goal:** Most attributes follow the main account, but roles need all values collected.

```
Global default: Main account

Mapping 1:
- New attribute: jobTitle
- Existing attributes: [title, jobTitle]
- Merge: (use default) → Main account

Mapping 2:
- New attribute: roles
- Existing attributes: [roles, groups, memberOf]
- Merge: Keep a list of values (override)
→ roles get all values; other attributes use first found
```

---

## Multi-valued attributes and ISC schema

When using **Keep a list of values** or **Concatenate**, consider the ISC schema implications:

| Merge strategy            | ISC schema type        | Identity profile mapping    | Use case                          |
| ------------------------- | ---------------------- | --------------------------- | --------------------------------- |
| **Main account**          | Single-valued (string) | Direct mapping              | Representative-account attributes |
| **Origin account**        | Single-valued (string) | Direct mapping              | Provenance-pinned attributes      |
| **First found**           | Single-valued (string) | Direct mapping              | Source-order fallback             |
| **Keep a list of values** | Multi-valued (array)   | Use index transform or join | Entitlements, roles, groups       |
| **Concatenate**           | Single-valued (string) | Direct mapping              | Human-readable display; search    |

!!! note

    After **Discover Schema**, ISC may show multi-valued attributes as entitlement-type (multi-valued) fields. Your identity profile transforms must handle arrays appropriately.
