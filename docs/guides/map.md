# Map: Attribute Mapping

The **Map** step controls how source account attributes are combined into the Fusion account schema when multiple sources contribute. Mapping source attributes into the Fusion schema happens first, before Attribute Definitions or Match scoring.

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

The **Default attribute merge from multiple sources** setting applies globally to all mapped attributes (unless overridden per attribute). This defines how Fusion deals with multiple accounts providing a value for the same unified attribute.

| Merge strategy                   | Behavior                                     | Result format         | Use when                                      | Example                                                                               |
| -------------------------------- | -------------------------------------------- | --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| **First found**                  | Uses first non-null value by source order    | Single value (string) | One source is preferred/authoritative         | HR first, then AD; prefer HR value                                                    |
| **Keep a list of values**        | Array of all distinct non-null values        | Array of strings      | Need all values (roles, groups, entitlements) | Collect all roles from SAP, Salesforce, Workday → `["Admin", "Manager", "Developer"]` |
| **Concatenate different values** | Distinct values in brackets, space-separated | Single string         | Human-readable combined view                  | Departments: `[Engineering] [IT Operations]`                                          |

**Screenshot Placeholder:** Attribute Mapping with merge strategies.
![Attribute mapping and merge](../assets/images/attribute-management-mapping-merge.png)

**Source ordering matters:** With "First found", the **order** of sources in **Source Settings → Authoritative account sources** determines precedence. The first source has highest priority.

```
Example: Source order is [Workday, Active Directory]
- Workday has jobTitle = "Senior Engineer"
- Active Directory has title = "Engineer"
- Merge: First found
→ Result: "Senior Engineer" (Workday wins)
```

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

| Option                           | Effect                              | Use case                                       |
| -------------------------------- | ----------------------------------- | ---------------------------------------------- |
| (Use default)                    | Inherits global default merge       | Most attributes                                |
| **First found**                  | Override global to use first found  | This attribute has preferred source order      |
| **Keep a list of values**        | Override global to keep all values  | Multi-valued attribute (roles, groups)         |
| **Concatenate different values** | Override global to concatenate      | Human-readable combined view                   |
| **Source name**                  | Use value from specific source only | One source is authoritative for this attribute |

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

**Goal:** Most attributes use "First found", but roles need all values collected.

```
Global default: First found

Mapping 1:
- New attribute: jobTitle
- Existing attributes: [title, jobTitle]
- Merge: (use default) → First found

Mapping 2:
- New attribute: roles
- Existing attributes: [roles, groups, memberOf]
- Merge: Keep a list of values (override)
→ roles get all values; other attributes use first found
```

---

## Multi-valued attributes and ISC schema

When using **Keep a list of values** or **Concatenate**, consider the ISC schema implications:

| Merge strategy            | ISC schema type        | Identity profile mapping    | Use case                                  |
| ------------------------- | ---------------------- | --------------------------- | ----------------------------------------- |
| **First found**           | Single-valued (string) | Direct mapping              | Most attributes (name, email, department) |
| **Keep a list of values** | Multi-valued (array)   | Use index transform or join | Entitlements, roles, groups               |
| **Concatenate**           | Single-valued (string) | Direct mapping              | Human-readable display; search            |

**Note:** After **Discover Schema**, ISC may show multi-valued attributes as entitlement-type (multi-valued) fields. Your identity profile transforms must handle arrays appropriately.
