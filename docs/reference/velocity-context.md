# Velocity context reference

The **Apache Velocity expression** field provides a templating language with access to utilities and data. Use this reference when writing [Attribute Definition](../use-guides/configuration/defining-attributes.md) expressions.

## Available data

<!-- markdownlint-disable MD038 -->

| Source                                                | What you can access                                                                                                                                                                                                                                                                                                                                                                                                                 | Example                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Mapped account attributes**                         | All attributes from Attribute Mapping                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `$jobTitle`, `$department`, `$email`                                              |
| **Source account attributes**                         | Direct source attributes (if no mapping)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `$firstname`, `$lastname`, `$hireDate`                                            |
<!-- prettier-ignore -->
| **Identity attributes** | When Include identities = Yes. `$identity.name` is the root identity name. `$name` falls back to the identity name for identity-origin accounts when no mapped attribute named `name` exists. | `$identity.name`, `$identity.employeeNumber`, `$name` |
| **$accounts**                                         | Managed account snapshots: source **`attributes`** plus nested **`source`** (`id`, `name` — managed accounts only for `id`), nested **`schema`** (`id` = native identity, `name` = display name), and **`IIQDisabled`**. The top-level **`$originAccount`** is the composite `sourceId::nativeIdentity` key for the origin row only. Ordered by configured source order, then account insertion order within each source, then unknown sources appended. If `mainAccount` contains a valid managed account key, that account is moved to index 0.                                                                                                     | `$accounts[0].source.name`, `$accounts[0].schema.name`, `$accounts[0].schema.id`  |
| **$sources**                                          | Map of source name → list of managed account snapshots (the same shape as `$accounts[]` entries). Access with dot access, e.g. `$sources.SourceName`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `$sources.Workday`                                                              |
| **$previous**                                         | Previous generated account state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `$previous.username`                                                              |
| **$originSource**                                     | Source that originally created the Fusion account (when available)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `Identities`, `Workday`                                                           |
| **$originAccount**                                    | String id of the identity or managed account that originally created the Fusion account (same as the `originAccount` attribute). For managed origins this is the composite `sourceId::nativeIdentity`; for identity origins this is the identity id.                                                                                                                                                                                                                                                                                                                                                                                                  | Use as a scalar in expressions                                                    |
| **$account**                                          | Snapshot for the origin only: same shape as `$accounts[]` entries when the origin is a managed account; when the origin is **Identities** and identity attributes are available, identity-origin fields are used first (then synthetic identity row if needed). Use **`$originAccount`** for the composite key or identity id string. Rows from the Identities source use **`source.name`** = **`Identities`** (no `source.id`) and **`schema`** for display name and id; `$account.name` is also available for identity-origin rows. Note: `$account` is the origin snapshot — when `mainAccount` points elsewhere, `$accounts[0]` will differ from `$account`. | `$originAccount`, `$account.schema.name`, `$account.source.name`, `$account.name` |
| **Special variables**                                 | `$counter` (Unique type, collision mode renders empty on first try, padded suffix on subsequent attempts; auto-append is skipped when the expression uses Velocity directives), `${UUID}` (Unique type, fresh v4 per attempt when referenced; collision resolution regenerates the UUID instead of auto-appending `$counter`), `$isUnique(value)` (Unique type, returns true if the value is not already registered)                                                                                                                                                                                                         | `$counter` in expression for Unique type                                          |

<!-- markdownlint-enable MD038 -->

## Available utilities

### $Math (JavaScript Math object)

Standard mathematical operations (`$Math.round(x)`, `$Math.floor(x)`, `$Math.ceil(x)`, `$Math.max(a, b)`, `$Math.min(a, b)`, `$Math.abs(x)`).

### $Datefns (date-fns library)

Advanced date formatting and manipulation (`$Datefns.format(date, format)`, `$Datefns.parse(date, format)`, `$Datefns.addDays(date, n)`, `$Datefns.differenceInDays(date1, date2)`, etc.).

### $AddressParse (address parsing)

Parse and normalize US addresses (`$AddressParse.getCityState(city)`, `$AddressParse.parse(address)`).

Additional geo lookup helpers:

- `$AddressParse.getStateName(code, country)` — looks up the full state or region name for a code. Returns the empty string for unknown codes or unsupported countries. Supported country codes: `"US"`, `"GB"`, `"UK"` (alias for GB).
- `$AddressParse.getStateCode(name, country)` — looks up the ISO code for a state or region name (case-insensitive). Returns the empty string for unknown names or unsupported countries. Supported country codes: `"US"`, `"GB"`, `"UK"`.

```velocity
## Code to full name
$AddressParse.getStateName("NY", "US")        ## "New York"
$AddressParse.getStateName("LND", "GB")       ## "Greater London"
$AddressParse.getStateName("LND", "UK")       ## "Greater London" (UK alias)

## Name to ISO code
$AddressParse.getStateCode("New York", "US")          ## "NY"
$AddressParse.getStateCode("new york", "US")          ## "NY" (case-insensitive)
$AddressParse.getStateCode("Greater London", "GB")    ## "LND"
$AddressParse.getStateCode("Atlantis", "US")          ## "" (unknown)
```

> **Note:** `$AddressParse.getCityState` and `$AddressParse.getCityStateCode` are deprecated because city names alone can collide across states (for example, there are Springfields in many US states). Prefer the explicit state/region lookups above for unambiguous results.

### $Normalize (data normalization)

Standardize common data formats (`$Normalize.phone(number)`, `$Normalize.date(date)`, `$Normalize.name(name)`).
`Normalize.phone` also accepts an optional default country code for local numbers, for example: `$Normalize.phone($phone, "GB")`. If the phone string already includes an international prefix (for example `+1`), that explicit prefix is used instead of the default.
For ambiguous numeric dates, `Normalize.date` accepts an optional priority argument:
`$Normalize.date($birthDate, "dd-MM-yyyy,MM-dd-yyyy")` (default) or
`$Normalize.date($birthDate, "MM-dd-yyyy,dd-MM-yyyy")`.

`Normalize.address(address, country?)` parses and reformats an address. The optional `country` parameter defaults to `"US"`. Supported country codes are `"US"`, `"GB"`, and `"UK"` (alias for GB). For US addresses, the fallback normalizes a full state name to its 2-letter code (for example `"California"` → `"CA"`). For UK addresses, the fallback normalizes a full region name or 3-letter region code (for example `"Greater London"` → `"LND"`). Unsupported country codes return the trimmed original address.

```velocity
## US: full state name is normalized to ISO code
$Normalize.address("Los Angeles, California 90001", "US")
## "Los Angeles, CA 90001"

## US: 2-letter code is preserved
$Normalize.address("Seattle, WA 98101", "US")
## "Seattle, WA 98101"

## UK: full region name is normalized to region code
$Normalize.address("London, Greater London SW1A 2AA", "GB")
## "London, LND SW1A 2AA"

## UK alias works the same as GB
$Normalize.address("London, Greater London SW1A 2AA", "UK")

## Unsupported country: returns trimmed original
$Normalize.address("Toronto, Ontario M5H 2N2", "CA")
## "Toronto, Ontario M5H 2N2"
```

`Normalize.ascii(input, language?)` transliterates non-ASCII characters to their ASCII equivalents. The optional `language` parameter enables language-specific digraph rules. Supported languages: `"de"` (German: ä→ae, ö→oe, ü→ue, ß→ss), `"no"` (Norwegian), `"da"` (Danish), and `"sv"` (Swedish: ä→ae, ö→oe, å→aa, ø→oe). When no language is provided or the language is unrecognized, the helper falls back to generic transliteration (strips diacritics: ä→a, é→e, etc.). Output is always lowercase; chain with `$Normalize.name()` for proper-casing.

```velocity
## German (DACH) digraph rules
$Normalize.ascii("Müller", "de")
## "mueller"

## Chain with Normalize.name for proper-casing
$Normalize.name($Normalize.ascii("MÜLLER", "de"))
## "Mueller"

## Nordic digraph rules (Norwegian, Danish, Swedish)
$Normalize.ascii("Søren Østergaard", "no")
## "soeren oestergaard"

## Generic transliteration fallback (no language)
$Normalize.ascii("José García")
## "jose garcia"
```

### $MD5 (hashing)

Compute a lowercase hex MD5 digest of a string: `$MD5($email)`.

Returns an empty string for null, undefined, non-string, or whitespace-only input (the attribute value is not written).

> **Note:** Use `$MD5` for deterministic identifiers compatible with downstream systems — not for password or secret hashing. MD5 is cryptographically weak and unsuitable for security-sensitive use.

```velocity
$MD5($email)
## "b58996c504c5638798eb6b511e6f49af" when $email is "user@example.com"
```
