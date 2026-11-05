## Scope

Packaging an Internal-record dump decides its Internal Record schema, Match participation, and Accounts JMESPath filter before the customizer reaches Identity Security Cloud. The connector reads that package as Record sources and retires the reserved-value index. Out of scope: changing Authoritative or Orphan source behavior, and applying an Accounts API filter to a dump.

## Language

**Internal Record source** (`conflicts-with-canonical`):
A Record source whose accounts come from a packaged Internal-record dump. The source name is chosen at packaging. The canonical entry still allows a Source Settings file field to identify it.
_Avoid_: internal source, CSV source

**Internal-record dump** (`promote`):
A headered CSV of accounts in `customizers/records/records/`.
_Avoid_: values file, reserved-value file

**Internal Record schema** (`promote`):
The saved field list for one Internal Record source, including which field is Account ID, which field is Account Name, and which fields are multi-valued.
_Avoid_: discovered schema, inferred type

**Internal Record configuration** (`promote`):
The saved packaging decisions for every Internal Record source in the customizer: source name, Internal Record schema, Include record accounts in Match, and Accounts JMESPath filter.
_Avoid_: internal sources config, source settings

**Records Customizer** (`conflicts-with-canonical`):
The standalone customizer project that packages Internal-record dumps for Identity Fusion. The canonical entry still defines it as a compiler of single-column unique-value CSVs.
_Avoid_: values customizer

**Customizer Value Store** (`conflicts-with-canonical`):
The binary hash index of reserved unique values. This change retires it. Unique values are reserved by record registration from Internal Record sources.
_Avoid_: static cache, disk table, reserved-value index

**INTERNAL badge** (`promote`):
Report provenance for an account that came from an Internal Record source.
_Avoid_: internal flag

## Decisions

Context: Internal Record accounts must participate in Match, filtering, and unique reservation without a runtime Source Settings join, and without the single-column reserved-value index.

1. Configuration is decided while packaging the Records Customizer, before upload to Identity Security Cloud.
2. Each Internal-record dump lives in `records/`. `values/` and the sorted hash index are removed.
3. Packaging prompts when a dump has no saved Internal Record configuration. The operator confirms the source name, Include record accounts in Match, the Accounts JMESPath filter, the Account ID field, and the Account Name field.
4. Packaging builds an Internal Record schema from the dump headers. A field is initially multi-valued when any value contains an unquoted semicolon. The operator may flip that flag or edit the CSV and re-scan. The connector uses the saved flag.
5. CSV parsing follows RFC 4180 for commas and quotes. An unquoted semicolon separates values only on a field the schema marks multi-valued. A quoted semicolon stays inside one value.
6. The package contains the Internal Record configuration and the stream-readable account artifacts. The connector treats each entry as a Record source.
7. Packaging fails when two dumps are given the same source name. Connector setup fails when an Internal Record source name equals a configured source name.
8. A non-interactive pack fails when any dump lacks saved configuration.
9. The Accounts JMESPath filter is stored in the configuration and applied when the connector streams accounts. The Accounts API filter does not apply.
10. Account ID becomes `nativeIdentity`. Account Name becomes the account name. Other fields become attributes. A multi-valued field becomes a list of strings.
11. Unique generation consults values registered from these accounts. A bare list of strings no longer reserves a value.

## Open questions

None. Assumptions recorded above are accepted for planning: read-time JMESPath, explicit saved Match flag, non-interactive failure when configuration is missing, and an empty Account Name falling back to Account ID.

## Scenarios discussed

- A dump with no saved configuration prompts, then later packs reuse the saved answers.
- A non-interactive pack with a new dump fails before producing a zip.
- Unquoted semicolons mark a field multi-valued; the operator marks it single-valued and the cell stays one string.
- A quoted semicolon does not mark the field multi-valued and does not split.
- Two dumps assigned the same source name fail packaging.
- An Internal Record source whose name matches a configured Authoritative, Orphan, or Record source fails connector setup.
- A configured source whose name matches no Internal Record source keeps its Identity Security Cloud account feed.
- Match off registers unique attributes and does not score. Match on scores. A non-match still does not create a Fusion account.
- A username reserves a value only when it is a field on an account row that record registration maps to that unique attribute.
